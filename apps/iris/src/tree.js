import crypto from 'node:crypto';
import { DEFAULT_SHAPE, SCHEMA_VERSION, validateDocument } from '../public/editor-model.js';

export const newId = () => crypto.randomUUID();

export function createDocument(title = 'Untitled mind map') {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    title,
    shape: DEFAULT_SHAPE,
    collapsed: false,
    note: '',
    tags: [],
    status: 'none',
    priority: null,
    url: '',
    color: '#d92d3f',
    textColor: '#ffffff',
    fontSize: 14,
    fontWeight: 700,
    fontStyle: 'normal',
    textAlign: 'center',
    layout: 'right',
    connectorStyle: 'smart',
    connectorEnd: 'none',
    connectorWidth: 'regular',
    connectorColorMode: 'branch',
    connectorColor: '#c2878d',
    children: [],
  };
}

export const validateTree = validateDocument;
