export const SCHEMA_VERSION = 2;
export const SHAPES = ['rounded', 'pill', 'rectangle', 'plain'];
export const DEFAULT_SHAPE = 'rounded';

const copy = (value) => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function normalizeNode(value, root = false) {
  const node = value && typeof value === 'object' ? value : {};
  const result = {
    id: String(node.id || ''),
    title: String(node.title || 'Untitled topic'),
    shape: SHAPES.includes(node.shape) ? node.shape : DEFAULT_SHAPE,
    collapsed: Boolean(node.collapsed),
    children: Array.isArray(node.children) ? node.children.map((child) => normalizeNode(child)) : [],
  };
  if (root) result.schemaVersion = SCHEMA_VERSION;
  return result;
}

export function normalizeDocument(value) {
  return normalizeNode(value, true);
}

export function validateDocument(value, depth = 0, seen = new Set(), root = true) {
  if (!value || typeof value !== 'object' || depth > 20) return false;
  if (typeof value.id !== 'string' || !value.id || seen.has(value.id)) return false;
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 240) return false;
  if (value.shape !== undefined && !SHAPES.includes(value.shape)) return false;
  if (value.collapsed !== undefined && typeof value.collapsed !== 'boolean') return false;
  if (root && value.schemaVersion !== undefined && value.schemaVersion !== SCHEMA_VERSION) return false;
  if (!Array.isArray(value.children) || value.children.length > 100) return false;
  seen.add(value.id);
  return value.children.every((child) => validateDocument(child, depth + 1, seen, false));
}

export function walkTree(document, fn, parent = null, depth = 0) {
  fn(document, parent, depth);
  document.children.forEach((child) => walkTree(child, fn, document, depth + 1));
}

export function findNode(document, id) {
  let match = null;
  walkTree(document, (node, parent, depth) => {
    if (!match && node.id === id) match = { node, parent, depth };
  });
  return match;
}

export function descendantIds(document, id) {
  const found = findNode(document, id);
  const ids = new Set();
  if (found) walkTree(found.node, (node) => ids.add(node.id));
  return ids;
}

export function flattenTree(document, respectCollapsed = true) {
  const rows = [];
  function visit(node, parent = null, depth = 0) {
    rows.push({ node, parent, depth });
    if (!respectCollapsed || !node.collapsed) node.children.forEach((child) => visit(child, node, depth + 1));
  }
  visit(document);
  return rows;
}

function insertAt(parent, node, index) {
  const targetIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, parent.children.length))
    : parent.children.length;
  parent.children.splice(targetIndex, 0, node);
  return targetIndex;
}

export function applyOperation(source, operation) {
  const document = copy(source);
  const op = copy(operation);
  const found = op.nodeId ? findNode(document, op.nodeId) : null;

  if (op.type === 'add' || op.type === 'insert') {
    const parent = findNode(document, op.parentId)?.node;
    if (!parent || !op.node || findNode(document, op.node.id)) throw new Error('The target topic is no longer available');
    const node = normalizeNode(op.node);
    if (!validateDocument(node, 1, new Set(), false)) throw new Error('The new topic is invalid');
    const index = insertAt(parent, node, op.index);
    return { document, selectedId: node.id, inverse: { type: 'delete', nodeId: node.id }, applied: { ...op, index } };
  }

  if (!found) throw new Error('The selected topic is no longer available');

  if (op.type === 'rename') {
    const title = String(op.title || '').trim();
    if (!title || title.length > 240) throw new Error('Topic text must be between 1 and 240 characters');
    const inverse = { type: 'rename', nodeId: op.nodeId, title: found.node.title };
    found.node.title = title;
    return { document, selectedId: op.nodeId, inverse, applied: { ...op, title } };
  }

  if (op.type === 'shape') {
    if (!SHAPES.includes(op.shape)) throw new Error('Unsupported topic shape');
    const inverse = { type: 'shape', nodeId: op.nodeId, shape: found.node.shape };
    found.node.shape = op.shape;
    return { document, selectedId: op.nodeId, inverse, applied: op };
  }

  if (op.type === 'collapse') {
    const collapsed = Boolean(op.collapsed);
    const inverse = { type: 'collapse', nodeId: op.nodeId, collapsed: found.node.collapsed };
    found.node.collapsed = collapsed;
    return { document, selectedId: op.nodeId, inverse, applied: { ...op, collapsed } };
  }

  if (op.type === 'delete') {
    if (!found.parent) throw new Error('The central topic cannot be deleted');
    const index = found.parent.children.findIndex((child) => child.id === op.nodeId);
    const subtree = copy(found.node);
    found.parent.children.splice(index, 1);
    return {
      document,
      selectedId: found.parent.id,
      inverse: { type: 'insert', parentId: found.parent.id, index, node: subtree },
      applied: op,
    };
  }

  if (op.type === 'move') {
    if (!found.parent) throw new Error('The central topic cannot be moved');
    const nextParent = findNode(document, op.parentId)?.node;
    if (!nextParent) throw new Error('The destination topic is no longer available');
    if (descendantIds(document, op.nodeId).has(nextParent.id)) throw new Error('A topic cannot be moved into its own branch');
    const oldParent = found.parent;
    const oldIndex = oldParent.children.findIndex((child) => child.id === found.node.id);
    oldParent.children.splice(oldIndex, 1);
    let index = Number.isInteger(op.index) ? op.index : nextParent.children.length;
    if (oldParent.id === nextParent.id && index > oldIndex) index -= 1;
    index = insertAt(nextParent, found.node, index);
    return {
      document,
      selectedId: op.nodeId,
      inverse: { type: 'move', nodeId: op.nodeId, parentId: oldParent.id, index: oldIndex },
      applied: { ...op, index },
    };
  }

  throw new Error('Unsupported editor operation');
}

export function replayOperations(source, operations) {
  let document = copy(source);
  const applied = [];
  for (const operation of operations) {
    try {
      const result = applyOperation(document, operation);
      document = result.document;
      applied.push(result.applied);
    } catch (error) {
      return { document, applied, failed: operation, error };
    }
  }
  return { document, applied, failed: null, error: null };
}
