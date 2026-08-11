import { DEFAULT_SHAPE, SHAPES } from '../public/editor-model.js';
import { createDocument, newId } from './tree.js';

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const decodeXml = (value) => String(value)
  .replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&gt;', '>')
  .replaceAll('&lt;', '<').replaceAll('&amp;', '&');

function outline(node, indent = '    ') {
  const shape = SHAPES.includes(node.shape) ? node.shape : DEFAULT_SHAPE;
  const attrs = `text="${escapeXml(node.title)}" _id="${escapeXml(node.id)}" _irisShape="${shape}" _irisCollapsed="${Boolean(node.collapsed)}"`;
  if (!node.children.length) return `${indent}<outline ${attrs}/>`;
  const children = node.children.map((child) => outline(child, `${indent}  `)).join('\n');
  return `${indent}<outline ${attrs}>\n${children}\n${indent}</outline>`;
}

export function toOpml(title, tree) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${escapeXml(title)}</title></head>\n  <body>\n${outline(tree)}\n  </body>\n</opml>\n`;
}

export function fromOpml(xml) {
  if (typeof xml !== 'string' || xml.length > 2_000_000 || !/<opml\b/i.test(xml)) {
    throw new Error('Invalid OPML document');
  }
  const tokens = [...xml.matchAll(/<\/?outline\b[^>]*\/?>/gi)].map((match) => match[0]);
  if (!tokens.length) throw new Error('OPML contains no outline');
  const roots = [];
  const stack = [];
  const usedIds = new Set();
  for (const token of tokens) {
    if (/^<\/outline/i.test(token)) {
      stack.pop();
      continue;
    }
    const text = token.match(/\b(?:text|title)\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (text === undefined) throw new Error('Every outline needs text');
    const decodedTitle = decodeXml(text).trim();
    if (!decodedTitle) throw new Error('Every outline needs non-empty text');
    const rawId = token.match(/\b_id\s*=\s*(["'])(.*?)\1/i)?.[2];
    const candidateId = rawId ? decodeXml(rawId) : newId();
    const nodeId = usedIds.has(candidateId) ? newId() : candidateId;
    usedIds.add(nodeId);
    const rawShape = token.match(/\b_irisShape\s*=\s*(["'])(.*?)\1/i)?.[2];
    const shape = SHAPES.includes(rawShape) ? rawShape : DEFAULT_SHAPE;
    const collapsed = token.match(/\b_irisCollapsed\s*=\s*(["'])true\1/i) !== null;
    const node = { id: nodeId, title: decodedTitle.slice(0, 240), shape, collapsed, children: [] };
    if (stack.length) stack.at(-1).children.push(node); else roots.push(node);
    if (!/\/>$/.test(token)) stack.push(node);
  }
  if (roots.length === 1) return roots[0];
  const document = createDocument('Imported mind map');
  document.children = roots;
  return document;
}
