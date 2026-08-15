export const SCHEMA_VERSION = 5;
export const SHAPES = ['rounded', 'pill', 'rectangle', 'plain'];
export const DEFAULT_SHAPE = 'rounded';
export const STATUSES = ['none', 'todo', 'doing', 'done', 'blocked'];
export const PRIORITIES = [null, 'low', 'medium', 'high'];
export const LAYOUTS = ['right', 'spider', 'top-down', 'org-chart'];
export const CONNECTOR_STYLES = ['smart', 'straight', 'curved', 'elbow'];
export const CONNECTOR_ENDS = ['none', 'arrow'];
export const CONNECTOR_WIDTHS = ['thin', 'regular', 'bold'];
export const CONNECTOR_COLOR_MODES = ['branch', 'custom'];
export const DEFAULT_CONNECTOR_COLOR = '#c2878d';
export const DEFAULT_ROOT_COLOR = '#d92d3f';
export const DEFAULT_NODE_COLOR = '#ffffff';
export const DEFAULT_TEXT_COLOR = '#3a292b';

const validColor = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ''));

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
    note: String(node.note || '').slice(0, 10_000),
    tags: Array.isArray(node.tags)
      ? [...new Set(node.tags.map((tag) => String(tag).trim().slice(0, 40)).filter(Boolean))].slice(0, 20)
      : [],
    status: STATUSES.includes(node.status) ? node.status : 'none',
    priority: PRIORITIES.includes(node.priority) ? node.priority : null,
    url: String(node.url || '').trim().slice(0, 2_048),
    color: validColor(node.color) ? node.color.toLowerCase() : (root ? DEFAULT_ROOT_COLOR : DEFAULT_NODE_COLOR),
    textColor: validColor(node.textColor) ? node.textColor.toLowerCase() : (root ? '#ffffff' : DEFAULT_TEXT_COLOR),
    fontSize: Number.isInteger(node.fontSize) && node.fontSize >= 10 && node.fontSize <= 24 ? node.fontSize : (root ? 14 : 13),
    fontWeight: [500, 600, 700, 800].includes(node.fontWeight) ? node.fontWeight : (root ? 700 : 600),
    fontStyle: node.fontStyle === 'italic' ? 'italic' : 'normal',
    textAlign: ['left', 'center', 'right'].includes(node.textAlign) ? node.textAlign : 'center',
    children: Array.isArray(node.children) ? node.children.map((child) => normalizeNode(child)) : [],
  };
  if (root) {
    result.schemaVersion = SCHEMA_VERSION;
    const layout = node.layout === 'radial' ? 'spider' : node.layout;
    result.layout = LAYOUTS.includes(layout) ? layout : 'right';
    result.connectorStyle = CONNECTOR_STYLES.includes(node.connectorStyle) ? node.connectorStyle : 'smart';
    result.connectorEnd = CONNECTOR_ENDS.includes(node.connectorEnd) ? node.connectorEnd : 'none';
    result.connectorWidth = CONNECTOR_WIDTHS.includes(node.connectorWidth) ? node.connectorWidth : 'regular';
    result.connectorColorMode = CONNECTOR_COLOR_MODES.includes(node.connectorColorMode) ? node.connectorColorMode : 'branch';
    result.connectorColor = validColor(node.connectorColor) ? node.connectorColor.toLowerCase() : DEFAULT_CONNECTOR_COLOR;
  }
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
  if (typeof value.note !== 'string' || value.note.length > 10_000) return false;
  if (!Array.isArray(value.tags) || value.tags.length > 20 || value.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 40)) return false;
  if (!STATUSES.includes(value.status) || !PRIORITIES.includes(value.priority)) return false;
  if (typeof value.url !== 'string' || value.url.length > 2_048) return false;
  if (!validColor(value.color) || !validColor(value.textColor)) return false;
  if (!Number.isInteger(value.fontSize) || value.fontSize < 10 || value.fontSize > 24) return false;
  if (![500, 600, 700, 800].includes(value.fontWeight) || !['normal', 'italic'].includes(value.fontStyle) || !['left', 'center', 'right'].includes(value.textAlign)) return false;
  if (root && value.schemaVersion !== undefined && value.schemaVersion !== SCHEMA_VERSION) return false;
  if (root && !LAYOUTS.includes(value.layout)) return false;
  if (root && !CONNECTOR_STYLES.includes(value.connectorStyle)) return false;
  if (root && !CONNECTOR_ENDS.includes(value.connectorEnd)) return false;
  if (root && !CONNECTOR_WIDTHS.includes(value.connectorWidth)) return false;
  if (root && !CONNECTOR_COLOR_MODES.includes(value.connectorColorMode)) return false;
  if (root && !validColor(value.connectorColor)) return false;
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

export function findDirectionalNeighbor(layout, currentId, key) {
  const current = layout?.get?.(currentId);
  const direction = {
    ArrowLeft: { axis: 'x', sign: -1 },
    ArrowRight: { axis: 'x', sign: 1 },
    ArrowUp: { axis: 'y', sign: -1 },
    ArrowDown: { axis: 'y', sign: 1 },
  }[key];
  if (!current || !direction) return null;

  let best = null;
  for (const [id, position] of layout) {
    if (id === currentId || !position) continue;
    const dx = position.x - current.x; const dy = position.y - current.y;
    const primaryDistance = (direction.axis === 'x' ? dx : dy) * direction.sign;
    if (primaryDistance <= 1) continue;
    const crossDistance = Math.abs(direction.axis === 'x' ? dy : dx);
    const distance = Math.hypot(dx, dy);
    const score = primaryDistance + crossDistance * 1.5 + (crossDistance / primaryDistance) * 80;
    if (!best || score < best.score || (score === best.score && distance < best.distance)) best = { id, score, distance };
  }
  return best?.id || null;
}

function insertAt(parent, node, index) {
  if (parent.children.length >= 100) throw new Error('A topic cannot have more than 100 direct children');
  const targetIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(index, parent.children.length))
    : parent.children.length;
  parent.children.splice(targetIndex, 0, node);
  return targetIndex;
}

export function applyOperation(source, operation) {
  const document = copy(source);
  const op = copy(operation);

  if (op.type === 'batch') {
    if (!Array.isArray(op.operations) || !op.operations.length) throw new Error('A batch needs at least one operation');
    let current = document;
    const applied = [];
    const inverses = [];
    let selectedId = null;
    for (const childOperation of op.operations) {
      if (childOperation?.type === 'batch') throw new Error('Nested batches are not supported');
      const result = applyOperation(current, childOperation);
      current = result.document;
      applied.push(result.applied);
      inverses.unshift(result.inverse);
      selectedId = result.selectedId || selectedId;
    }
    return {
      document: current,
      selectedId,
      inverse: { type: 'batch', operations: inverses },
      applied: { type: 'batch', operations: applied },
    };
  }

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

  if (op.type === 'format') {
    const next = normalizeNode({ ...found.node, ...op.changes });
    const fields = ['shape', 'color', 'textColor', 'fontSize', 'fontWeight', 'fontStyle', 'textAlign'];
    const changes = {};
    const previous = {};
    for (const field of fields) {
      if (!(field in (op.changes || {}))) continue;
      changes[field] = next[field]; previous[field] = found.node[field]; found.node[field] = next[field];
    }
    if (!Object.keys(changes).length) throw new Error('No supported format changes were provided');
    return {
      document,
      selectedId: op.nodeId,
      inverse: { type: 'format', nodeId: op.nodeId, changes: previous },
      applied: { type: 'format', nodeId: op.nodeId, changes },
    };
  }

  if (op.type === 'layout') {
    if (found.parent || !LAYOUTS.includes(op.layout)) throw new Error('Unsupported mind map layout');
    const inverse = { type: 'layout', nodeId: found.node.id, layout: document.layout };
    document.layout = op.layout;
    return { document, selectedId: found.node.id, inverse, applied: { type: 'layout', nodeId: found.node.id, layout: op.layout } };
  }

  if (op.type === 'connector') {
    if (found.parent) throw new Error('Connector settings belong to the whole mind map');
    const fields = ['connectorStyle', 'connectorEnd', 'connectorWidth', 'connectorColorMode', 'connectorColor'];
    const next = normalizeDocument({ ...document, ...op.changes });
    const changes = {}; const previous = {};
    for (const field of fields) {
      if (!(field in (op.changes || {}))) continue;
      changes[field] = next[field]; previous[field] = document[field]; document[field] = next[field];
    }
    if (!Object.keys(changes).length) throw new Error('No supported connector changes were provided');
    return {
      document,
      selectedId: found.node.id,
      inverse: { type: 'connector', nodeId: found.node.id, changes: previous },
      applied: { type: 'connector', nodeId: found.node.id, changes },
    };
  }

  if (op.type === 'collapse') {
    const collapsed = Boolean(op.collapsed);
    const inverse = { type: 'collapse', nodeId: op.nodeId, collapsed: found.node.collapsed };
    found.node.collapsed = collapsed;
    return { document, selectedId: op.nodeId, inverse, applied: { ...op, collapsed } };
  }

  if (op.type === 'metadata') {
    const next = normalizeNode({ ...found.node, ...op.changes });
    const fields = ['note', 'tags', 'status', 'priority', 'url'];
    const changes = {};
    const previous = {};
    for (const field of fields) {
      if (!(field in (op.changes || {}))) continue;
      changes[field] = copy(next[field]);
      previous[field] = copy(found.node[field]);
      found.node[field] = copy(next[field]);
    }
    if (!Object.keys(changes).length) throw new Error('No supported metadata changes were provided');
    return {
      document,
      selectedId: op.nodeId,
      inverse: { type: 'metadata', nodeId: op.nodeId, changes: previous },
      applied: { type: 'metadata', nodeId: op.nodeId, changes },
    };
  }

  if (op.type === 'delete') {
    if (!found.parent) throw new Error('The central topic cannot be deleted');
    const index = found.parent.children.findIndex((child) => child.id === op.nodeId);
    const subtree = copy(found.node);
    found.parent.children.splice(index, 1);
    const nearestSibling = found.parent.children[index] || found.parent.children[index - 1];
    return {
      document,
      selectedId: nearestSibling?.id || found.parent.id,
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

export function cloneSubtree(node, idFactory = () => crypto.randomUUID()) {
  const cloned = normalizeNode(copy(node));
  walkTree(cloned, (item) => { item.id = idFactory(); });
  return cloned;
}

export function subtreeToOutline(node, depth = 0) {
  const lines = [`${'  '.repeat(depth)}- ${String(node.title).replaceAll('\n', ' ')}`];
  node.children.forEach((child) => lines.push(subtreeToOutline(child, depth + 1)));
  return lines.join('\n');
}

export function outlineToSubtrees(text, idFactory = () => crypto.randomUUID()) {
  const rawLines = String(text || '').replaceAll('\r', '').split('\n').filter((line) => line.trim());
  if (!rawLines.length) return [];
  if (rawLines.length > 500) throw new Error('Paste is limited to 500 topics at a time');
  const roots = [];
  const stack = [];
  for (const rawLine of rawLines) {
    const leading = rawLine.match(/^[\t ]*/)?.[0] || '';
    const indent = [...leading].reduce((total, character) => total + (character === '\t' ? 2 : 1), 0);
    const title = rawLine.slice(leading.length).replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').trim().slice(0, 240);
    if (!title) continue;
    const node = normalizeNode({ id: idFactory(), title, children: [] });
    while (stack.length && indent <= stack.at(-1).indent) stack.pop();
    if (stack.length) {
      if (stack.length >= 20) throw new Error('Pasted outlines are limited to 20 levels');
      stack.at(-1).node.children.push(node);
    } else roots.push(node);
    stack.push({ indent, node });
  }
  return roots;
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
