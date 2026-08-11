import crypto from 'node:crypto';
import { DEFAULT_SHAPE, SCHEMA_VERSION, validateDocument } from '../public/editor-model.js';

export const newId = () => crypto.randomUUID();

export function createDocument(title = 'Untitled mind map') {
  return { schemaVersion: SCHEMA_VERSION, id: newId(), title, shape: DEFAULT_SHAPE, collapsed: false, children: [] };
}

export const validateTree = validateDocument;
