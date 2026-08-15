import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOperation,
  cloneSubtree,
  descendantIds,
  findDirectionalNeighbor,
  flattenTree,
  normalizeDocument,
  outlineToSubtrees,
  replayOperations,
  subtreeToOutline,
  validateDocument,
} from '../public/editor-model.js';

const legacyTree = () => ({ id: 'root', title: 'Root', children: [
  { id: 'a', title: 'Alpha', children: [] },
  { id: 'b', title: 'Beta', children: [{ id: 'c', title: 'Gamma', children: [] }] },
] });

test('legacy trees normalize to schema v5 without changing their hierarchy', () => {
  const document = normalizeDocument(legacyTree());
  assert.equal(document.schemaVersion, 5);
  assert.equal(document.layout, 'right');
  assert.equal(document.connectorStyle, 'smart');
  assert.equal(document.connectorEnd, 'none');
  assert.equal(document.connectorWidth, 'regular');
  assert.equal(document.connectorColorMode, 'branch');
  assert.equal(document.shape, 'rounded');
  assert.equal(document.children[1].children[0].title, 'Gamma');
  assert.equal(document.children[0].collapsed, false);
  assert.deepEqual(document.children[0].tags, []);
  assert.equal(document.children[0].status, 'none');
  assert.equal(validateDocument(document), true);
});

test('legacy radial layout normalizes to the Spider Diagram layout', () => {
  const document = normalizeDocument({ ...legacyTree(), layout: 'radial' });
  assert.equal(document.layout, 'spider');
  assert.equal(validateDocument(document), true);
});

test('arrow navigation selects the nearest topic in the requested visual direction', () => {
  const layout = new Map([
    ['center', { x: 0, y: 0 }],
    ['left', { x: -180, y: 10 }],
    ['right', { x: 190, y: -5 }],
    ['up', { x: 8, y: -120 }],
    ['down', { x: -6, y: 140 }],
    ['far-left', { x: -400, y: 0 }],
  ]);
  assert.equal(findDirectionalNeighbor(layout, 'center', 'ArrowLeft'), 'left');
  assert.equal(findDirectionalNeighbor(layout, 'center', 'ArrowRight'), 'right');
  assert.equal(findDirectionalNeighbor(layout, 'center', 'ArrowUp'), 'up');
  assert.equal(findDirectionalNeighbor(layout, 'center', 'ArrowDown'), 'down');
  assert.equal(findDirectionalNeighbor(layout, 'center', 'Enter'), null);
});

test('move reparents a complete subtree and returns an undo operation', () => {
  const document = normalizeDocument(legacyTree());
  const moved = applyOperation(document, { type: 'move', nodeId: 'b', parentId: 'a' });
  assert.deepEqual(moved.document.children.map((node) => node.id), ['a']);
  assert.deepEqual(moved.document.children[0].children.map((node) => node.id), ['b']);
  assert.equal(moved.document.children[0].children[0].children[0].id, 'c');
  const undone = applyOperation(moved.document, moved.inverse);
  assert.deepEqual(undone.document.children.map((node) => node.id), ['a', 'b']);
});

test('move supports deterministic sibling reordering', () => {
  const document = normalizeDocument(legacyTree());
  const moved = applyOperation(document, { type: 'move', nodeId: 'b', parentId: 'root', index: 0 });
  assert.deepEqual(moved.document.children.map((node) => node.id), ['b', 'a']);
});

test('root moves and ancestor cycles are rejected', () => {
  const document = normalizeDocument(legacyTree());
  assert.throws(() => applyOperation(document, { type: 'move', nodeId: 'root', parentId: 'a' }), /central topic/i);
  assert.throws(() => applyOperation(document, { type: 'move', nodeId: 'b', parentId: 'c' }), /own branch/i);
});

test('delete preserves enough data for undo', () => {
  const document = normalizeDocument(legacyTree());
  const deleted = applyOperation(document, { type: 'delete', nodeId: 'b' });
  assert.equal(descendantIds(deleted.document, 'b').size, 0);
  assert.equal(deleted.selectedId, 'a');
  const restored = applyOperation(deleted.document, deleted.inverse);
  assert.equal(restored.document.children[1].children[0].id, 'c');
});

test('delete keeps selection on the nearest surviving sibling then its parent', () => {
  const document = normalizeDocument(legacyTree());
  const firstDeleted = applyOperation(document, { type: 'delete', nodeId: 'a' });
  assert.equal(firstDeleted.selectedId, 'b');
  const lastDeleted = applyOperation(firstDeleted.document, { type: 'delete', nodeId: 'b' });
  assert.equal(lastDeleted.selectedId, 'root');
});

test('collapsed branches disappear only from the visible flattening', () => {
  const document = normalizeDocument(legacyTree());
  const collapsed = applyOperation(document, { type: 'collapse', nodeId: 'b', collapsed: true }).document;
  assert.deepEqual(flattenTree(collapsed, true).map(({ node }) => node.id), ['root', 'a', 'b']);
  assert.deepEqual(flattenTree(collapsed, false).map(({ node }) => node.id), ['root', 'a', 'b', 'c']);
});

test('operation replay rebases valid edits and reports invalid targets', () => {
  const latest = normalizeDocument(legacyTree());
  const valid = replayOperations(latest, [
    { type: 'rename', nodeId: 'a', title: 'Rebased Alpha' },
    { type: 'shape', nodeId: 'a', shape: 'pill' },
  ]);
  assert.equal(valid.failed, null);
  assert.equal(valid.document.children[0].title, 'Rebased Alpha');
  assert.equal(valid.document.children[0].shape, 'pill');
  const invalid = replayOperations(latest, [{ type: 'rename', nodeId: 'missing', title: 'Nope' }]);
  assert.equal(invalid.failed.nodeId, 'missing');
});

test('validation rejects duplicate ids, unsupported shapes, and empty text', () => {
  const duplicate = normalizeDocument(legacyTree()); duplicate.children[1].id = 'a';
  assert.equal(validateDocument(duplicate), false);
  const badShape = normalizeDocument(legacyTree()); badShape.children[0].shape = 'triangle';
  assert.equal(validateDocument(badShape), false);
  const empty = normalizeDocument(legacyTree()); empty.children[0].title = '   ';
  assert.equal(validateDocument(empty), false);
  const badColor = normalizeDocument(legacyTree()); badColor.children[0].color = 'red';
  assert.equal(validateDocument(badColor), false);
});

test('batch operations are atomic and undo as one command', () => {
  const document = normalizeDocument(legacyTree());
  const changed = applyOperation(document, { type: 'batch', operations: [
    { type: 'shape', nodeId: 'a', shape: 'pill' },
    { type: 'shape', nodeId: 'b', shape: 'rectangle' },
  ] });
  assert.deepEqual(changed.document.children.map((node) => node.shape), ['pill', 'rectangle']);
  assert.equal(changed.inverse.type, 'batch');
  const replayed = replayOperations(document, [changed.applied]);
  assert.equal(replayed.failed, null);
  assert.deepEqual(replayed.document.children.map((node) => node.shape), ['pill', 'rectangle']);
  const undone = applyOperation(changed.document, changed.inverse);
  assert.deepEqual(undone.document.children.map((node) => node.shape), ['rounded', 'rounded']);
  assert.throws(() => applyOperation(document, { type: 'batch', operations: [
    { type: 'shape', nodeId: 'a', shape: 'pill' },
    { type: 'rename', nodeId: 'missing', title: 'Nope' },
  ] }), /no longer available/i);
  assert.equal(document.children[0].shape, 'rounded');
});

test('metadata changes normalize and undo cleanly', () => {
  const document = normalizeDocument(legacyTree());
  const changed = applyOperation(document, { type: 'metadata', nodeId: 'a', changes: {
    note: 'Supporting context', tags: ['research', 'research'], status: 'doing', priority: 'high', url: 'https://example.test',
  } });
  assert.deepEqual(changed.document.children[0].tags, ['research']);
  assert.equal(changed.document.children[0].status, 'doing');
  const undone = applyOperation(changed.document, changed.inverse);
  assert.equal(undone.document.children[0].note, '');
  assert.equal(undone.document.children[0].priority, null);
});

test('outline clipboard helpers preserve hierarchy and regenerate ids', () => {
  let nextId = 0;
  const nodes = outlineToSubtrees('- Alpha\n  - Child\n- Beta', () => `new-${++nextId}`);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].children[0].title, 'Child');
  assert.equal(subtreeToOutline(nodes[0]), '- Alpha\n  - Child');
  const cloned = cloneSubtree(nodes[0], () => `clone-${++nextId}`);
  assert.notEqual(cloned.id, nodes[0].id);
  assert.notEqual(cloned.children[0].id, nodes[0].children[0].id);
  assert.equal(cloned.children[0].title, 'Child');
});

test('topic formatting and document layout are undoable', () => {
  const document = normalizeDocument(legacyTree());
  const formatted = applyOperation(document, { type: 'format', nodeId: 'a', changes: {
    shape: 'pill', color: '#3366cc', textColor: '#ffffff', fontSize: 16, fontWeight: 700, fontStyle: 'italic', textAlign: 'left',
  } });
  assert.equal(formatted.document.children[0].color, '#3366cc');
  assert.equal(formatted.document.children[0].fontStyle, 'italic');
  assert.equal(applyOperation(formatted.document, formatted.inverse).document.children[0].color, '#ffffff');
  for (const layout of ['spider', 'top-down', 'org-chart']) {
    const changed = applyOperation(document, { type: 'layout', nodeId: 'root', layout });
    assert.equal(changed.document.layout, layout);
    assert.equal(applyOperation(changed.document, changed.inverse).document.layout, 'right');
  }
  assert.throws(() => applyOperation(document, { type: 'layout', nodeId: 'a', layout: 'spider' }), /unsupported/i);
  assert.throws(() => applyOperation(document, { type: 'layout', nodeId: 'root', layout: 'radial' }), /unsupported/i);
});

test('map connector settings normalize and undo as one command', () => {
  const document = normalizeDocument(legacyTree());
  const changed = applyOperation(document, { type: 'connector', nodeId: 'root', changes: {
    connectorStyle: 'elbow', connectorEnd: 'arrow', connectorWidth: 'bold', connectorColorMode: 'custom', connectorColor: '#3366cc',
  } });
  assert.equal(changed.document.connectorStyle, 'elbow');
  assert.equal(changed.document.connectorEnd, 'arrow');
  assert.equal(changed.document.connectorWidth, 'bold');
  assert.equal(changed.document.connectorColor, '#3366cc');
  assert.equal(applyOperation(changed.document, changed.inverse).document.connectorStyle, 'smart');
  assert.throws(() => applyOperation(document, { type: 'connector', nodeId: 'a', changes: { connectorStyle: 'straight' } }), /whole mind map/i);
});
