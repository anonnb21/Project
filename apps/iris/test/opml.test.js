import test from 'node:test';
import assert from 'node:assert/strict';
import { fromOpml, toOpml } from '../src/opml.js';

test('OPML round trip preserves a mind map tree', () => {
  const tree = { id: 'root', title: 'Plan & Build', children: [
    { id: 'a', title: 'Research', children: [] },
    { id: 'b', title: 'Ship <v1>', children: [{ id: 'c', title: 'Review', children: [] }] },
  ] };
  const withDefaults = (node) => ({
    ...node,
    shape: 'rounded',
    collapsed: false,
    children: node.children.map(withDefaults),
  });
  assert.deepEqual(fromOpml(toOpml('Plan', tree)), withDefaults(tree));
});

test('OPML import wraps multiple top-level outlines', () => {
  const tree = fromOpml('<?xml version="1.0"?><opml version="2.0"><body><outline text="One"/><outline text="Two"/></body></opml>');
  assert.equal(tree.children.length, 2);
});

test('OPML import replaces duplicate node IDs', () => {
  const tree = fromOpml('<opml version="2.0"><body><outline text="Root" _id="same"><outline text="Child" _id="same"/></outline></body></opml>');
  assert.notEqual(tree.id, tree.children[0].id);
});
