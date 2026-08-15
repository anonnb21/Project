import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument } from '../public/editor-model.js';
import { fromOpml, toOpml } from '../src/opml.js';

test('OPML round trip preserves a mind map tree', () => {
  const tree = { id: 'root', title: 'Plan & Build', children: [
    { id: 'a', title: 'Research', children: [] },
    { id: 'b', title: 'Ship <v1>', children: [{ id: 'c', title: 'Review', children: [] }] },
  ] };
  assert.deepEqual(fromOpml(toOpml('Plan', tree)), normalizeDocument(tree));
});

test('OPML import wraps multiple top-level outlines', () => {
  const tree = fromOpml('<?xml version="1.0"?><opml version="2.0"><body><outline text="One"/><outline text="Two"/></body></opml>');
  assert.equal(tree.children.length, 2);
});

test('OPML import replaces duplicate node IDs', () => {
  const tree = fromOpml('<opml version="2.0"><body><outline text="Root" _id="same"><outline text="Child" _id="same"/></outline></body></opml>');
  assert.notEqual(tree.id, tree.children[0].id);
});

test('OPML round trip preserves IRIS shape, collapse, and semantic metadata', () => {
  const tree = { id: 'root', title: 'Plan', shape: 'pill', collapsed: true, note: 'Context & detail', tags: ['launch', 'Q4'], status: 'doing', priority: 'high', url: 'https://example.test/plan?a=1&b=2', color: '#3366cc', textColor: '#ffffff', fontSize: 16, fontWeight: 700, fontStyle: 'italic', textAlign: 'left', layout: 'org-chart', connectorStyle: 'elbow', connectorEnd: 'arrow', connectorWidth: 'bold', connectorColorMode: 'custom', connectorColor: '#663399', children: [
    { id: 'child', title: 'Decision', shape: 'rectangle', collapsed: false, note: '', tags: [], status: 'done', priority: null, url: '', children: [] },
  ] };
  const xml = toOpml('Plan', tree);
  assert.match(xml, /_irisShape="pill"/);
  assert.match(xml, /_irisCollapsed="true"/);
  assert.match(xml, /_irisStatus="doing"/);
  assert.match(xml, /_irisColor="#3366cc"/);
  assert.match(xml, /_irisLayout="org-chart"/);
  assert.match(xml, /_irisConnectorStyle="elbow"/);
  assert.match(xml, /_irisConnectorEnd="arrow"/);
  assert.match(xml, /_irisConnectorWidth="bold"/);
  assert.match(xml, /_irisConnectorColor="#663399"/);
  assert.deepEqual(fromOpml(xml), normalizeDocument(tree));
});

test('OPML ignores unknown metadata and defaults invalid IRIS shapes', () => {
  const tree = fromOpml('<opml version="2.0"><body><outline text="Root" extra="ignored" _irisShape="triangle"/></body></opml>');
  assert.equal(tree.shape, 'rounded');
  assert.equal(tree.collapsed, false);
});
