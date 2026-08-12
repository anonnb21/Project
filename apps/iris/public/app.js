import {
  DEFAULT_NODE_COLOR,
  DEFAULT_ROOT_COLOR,
  DEFAULT_TEXT_COLOR,
  SHAPES,
  applyOperation,
  cloneSubtree,
  descendantIds,
  findDirectionalNeighbor,
  findNode,
  flattenTree,
  normalizeDocument,
  outlineToSubtrees,
  replayOperations,
  subtreeToOutline,
} from './editor-model.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const views = { auth: $('#auth-view'), dashboard: $('#dashboard-view'), editor: $('#editor-view') };
const state = {
  user: null, maps: [], map: null, register: false, selected: null, view: 'canvas',
  scale: 1, panX: 0, panY: 0, socket: null, saveTimer: null, dirty: false, saving: false,
  history: [], redo: [], pendingOps: [], conflict: null, layout: new Map(), bounds: null,
  renderQueued: false, rendering: false, renderedSizes: new Map(), editAfterRender: null,
  selectedIds: new Set(), selectionAnchor: null, clipboard: null, marquee: null, canvasTool: 'pan',
};
const svgNS = 'http://www.w3.org/2000/svg';

function showView(name) {
  Object.entries(views).forEach(([key, value]) => value.classList.toggle('hidden', key !== name));
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
}
function announce(message) { $('#editor-status').textContent = ''; requestAnimationFrame(() => { $('#editor-status').textContent = message; }); }
async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Request failed'); error.status = response.status; error.data = data; throw error; }
  return data;
}
function initials(name) { return String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function formatDate(value) {
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  const days = Math.floor((Date.now() - date) / 86400_000);
  return days < 1 ? 'Updated today' : days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`;
}
function canEdit() { return state.map && ['owner', 'editor'].includes(state.map.role); }
function newNode(title = 'New idea', shape = 'rounded', formatSource = null) {
  return {
    id: crypto.randomUUID(), title, shape, collapsed: false, note: '', tags: [], status: 'none', priority: null, url: '',
    color: formatSource?.color || DEFAULT_NODE_COLOR,
    textColor: formatSource?.textColor || DEFAULT_TEXT_COLOR,
    fontSize: 13, fontWeight: 600, fontStyle: 'normal', textAlign: 'center', children: [],
  };
}

async function bootstrap() {
  try { state.user = (await api('/api/auth/me')).user; await showDashboard(); } catch { showAuth(); }
}
function showAuth() {
  showView('auth');
  api('/api/auth/config').then(({ allowRegistration }) => $('#auth-toggle-row').classList.toggle('hidden', !allowRegistration));
}
function updateAuthMode() {
  $('#auth-title').textContent = state.register ? 'Create your workspace account' : 'Sign in to your workspace';
  $('#auth-subtitle').textContent = state.register ? 'Your first map is only a minute away.' : 'Integrated Red Ant Colony Information System';
  $('#auth-submit').textContent = state.register ? 'Create account' : 'Sign in';
  $('#auth-toggle').textContent = state.register ? 'Sign in instead' : 'Create an account';
  $('#name-field').classList.toggle('hidden', !state.register);
  $('#auth-form').password.autocomplete = state.register ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
}
$('#auth-toggle').addEventListener('click', () => { state.register = !state.register; updateAuthMode(); });
$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#auth-error').textContent = ''; const form = event.currentTarget;
  try {
    const payload = Object.fromEntries(new FormData(form));
    const data = await api(`/api/auth/${state.register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    state.user = data.user; form.reset(); await showDashboard();
  } catch (error) { $('#auth-error').textContent = error.message; }
});
$('#logout-btn').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; location.hash = ''; showAuth(); });

async function showDashboard() {
  disconnectLive(); showView('dashboard'); state.map = null;
  $('#user-name').textContent = state.user.displayName; $('#user-email').textContent = state.user.email; $('#user-avatar').textContent = initials(state.user.displayName);
  state.maps = (await api('/api/mindmaps')).mindmaps; renderMapGrid();
}
function renderMapGrid() {
  const query = $('#search-input').value.trim().toLowerCase();
  const maps = state.maps.filter((map) => map.title.toLowerCase().includes(query));
  const grid = $('#map-grid'); grid.replaceChildren();
  maps.forEach((map) => {
    const card = document.createElement('article'); card.className = 'map-card'; card.tabIndex = 0;
    const preview = document.createElement('div'); preview.className = 'map-preview';
    const previewIcon = document.createElement('i'); previewIcon.className = 'ph ph-tree-structure'; previewIcon.setAttribute('aria-hidden', 'true'); preview.append(previewIcon);
    const info = document.createElement('div'); info.className = 'map-info';
    const title = document.createElement('h3'); title.textContent = map.title;
    const meta = document.createElement('div'); meta.className = 'map-meta';
    const date = document.createElement('span'); date.textContent = formatDate(map.updatedAt);
    const role = document.createElement('span'); role.className = 'role-pill'; role.textContent = map.role;
    meta.append(date, role); info.append(title, meta); card.append(preview, info);
    const open = () => openMap(map.id); card.addEventListener('click', open); card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    grid.append(card);
  });
  $('#map-count').textContent = `${maps.length} ${maps.length === 1 ? 'map' : 'maps'}`;
  $('#empty-state').classList.toggle('hidden', state.maps.length > 0 || query);
  grid.classList.toggle('hidden', !maps.length);
}
$('#search-input').addEventListener('input', renderMapGrid);
function openNewDialog() { $('#new-map-dialog').showModal(); }
$('#new-map-btn').addEventListener('click', openNewDialog); $$('[data-new-map]').forEach((button) => button.addEventListener('click', openNewDialog));
$('#new-map-form').addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault(); const form = event.currentTarget; const title = new FormData(form).get('title');
  try { const { mindmap } = await api('/api/mindmaps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }); $('#new-map-dialog').close(); form.reset(); await openMap(mindmap.id); } catch (error) { toast(error.message); }
});
$('#import-input').addEventListener('change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  try { const { mindmap } = await api('/api/mindmaps/import', { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: await file.text() }); await openMap(mindmap.id); toast('OPML imported'); }
  catch (error) { toast(error.message); } finally { event.target.value = ''; }
});

async function openMap(id) {
  try {
    state.map = (await api(`/api/mindmaps/${id}`)).mindmap;
    state.map.document = normalizeDocument(state.map.document);
    state.selected = state.map.document.id; state.selectedIds = new Set([state.selected]); state.selectionAnchor = state.selected;
    state.scale = 1; state.dirty = false; state.saving = false; state.canvasTool = 'pan';
    state.history = []; state.redo = []; state.pendingOps = []; state.conflict = null; state.view = 'canvas';
    $('#map-title').value = state.map.title; $('#map-title').disabled = !canEdit();
    const readOnly = !canEdit(); $('#read-only').classList.toggle('hidden', !readOnly);
    ['#add-child-btn', '#add-sibling-btn', '#duplicate-node-btn', '#paste-outline-btn', '#select-branch-btn', '#promote-node-btn', '#collapse-node-btn', '#delete-node-btn'].forEach((selector) => { $(selector).disabled = readOnly; });
    $$('#shape-palette button').forEach((button) => { button.disabled = readOnly; });
    $('#share-btn').classList.toggle('hidden', state.map.role !== 'owner');
    $('#save-state').textContent = readOnly ? 'View only' : 'Saved';
    $('#conflict-bar').classList.add('hidden'); updateUndoButtons(); setEditorView('canvas'); setCanvasTool('pan'); showView('editor');
    renderEditor(); fitMap(); connectLive(id); history.replaceState(null, '', `#map/${id}`);
  } catch (error) { toast(error.message); await showDashboard(); }
}
$('#back-btn').addEventListener('click', () => { history.replaceState(null, '', location.pathname); showDashboard(); });
$('#map-title').addEventListener('input', () => { state.map.title = $('#map-title').value; queueSave(); });
$('#export-btn').addEventListener('click', () => { location.href = `/api/mindmaps/${state.map.id}/export.opml`; });

function execute(operation, { record = true, announceText = '', preserveSelection = false, selectIds = null, focusSelection = false } = {}) {
  if (!canEdit()) return null;
  try {
    const result = applyOperation(state.map.document, operation);
    state.map.document = result.document;
    if (Array.isArray(selectIds) && selectIds.length) setSelection(selectIds, selectIds.at(-1), false, false);
    else if (preserveSelection) {
      const remaining = [...state.selectedIds].filter((id) => findNode(state.map.document, id));
      setSelection(remaining, remaining.includes(state.selected) ? state.selected : remaining.at(-1), false, false);
    } else setSelection([result.selectedId || state.selected], result.selectedId || state.selected, false, false);
    state.pendingOps.push(result.applied);
    if (record) { state.history.push({ op: result.applied, inverse: result.inverse }); if (state.history.length > 100) state.history.shift(); state.redo = []; }
    state.dirty = true; updateUndoButtons(); renderEditor(); queueSave();
    if (focusSelection && state.view === 'canvas') requestAnimationFrame(() => nodeElement(state.selected)?.focus());
    if (announceText) { announce(announceText); toast(announceText); }
    return result;
  } catch (error) { toast(error.message); announce(error.message); return null; }
}
function undo() {
  const entry = state.history.pop(); if (!entry) return;
  const result = execute(entry.inverse, { record: false });
  if (result) { state.redo.push(entry); updateUndoButtons(); announce('Change undone'); }
}
function redo() {
  const entry = state.redo.pop(); if (!entry) return;
  const result = execute(entry.op, { record: false });
  if (result) { state.history.push(entry); updateUndoButtons(); announce('Change redone'); }
}
function updateUndoButtons() { $('#undo-btn').disabled = !canEdit() || !state.history.length; $('#redo-btn').disabled = !canEdit() || !state.redo.length; }
$('#undo-btn').addEventListener('click', undo); $('#redo-btn').addEventListener('click', redo);

function addChild(shape = 'rounded', parentId = state.selected) {
  const target = findNode(state.map.document, parentId)?.node; if (!target) return;
  if (target.collapsed) execute({ type: 'collapse', nodeId: target.id, collapsed: false }, { record: true });
  const node = newNode('New idea', shape, target); state.editAfterRender = state.view === 'canvas' ? node.id : null;
  execute({ type: 'add', parentId: target.id, node }, { announceText: 'Child topic added' });
}
function addSibling() {
  const found = findNode(state.map.document, state.selected); if (!found) return;
  if (!found.parent) return addChild();
  const index = found.parent.children.findIndex((child) => child.id === found.node.id) + 1;
  const node = newNode('New idea', found.node.shape, found.node); state.editAfterRender = state.view === 'canvas' ? node.id : null;
  execute({ type: 'add', parentId: found.parent.id, index, node }, { announceText: 'Sibling topic added' });
}
function deleteSelected() {
  const deletable = topLevelSelection([...state.selectedIds].filter((id) => id !== state.map.document.id));
  if (!deletable.length) return toast('The central topic cannot be deleted');
  const operation = deletable.length === 1
    ? { type: 'delete', nodeId: deletable[0] }
    : { type: 'batch', operations: deletable.map((nodeId) => ({ type: 'delete', nodeId })) };
  execute(operation, { focusSelection: true, announceText: deletable.length === 1 ? 'Topic branch deleted' : `${deletable.length} topic branches deleted` });
}
function selectBranch() {
  const ids = [...descendantIds(state.map.document, state.selected)];
  setSelection(ids, state.selected);
  announce(`${ids.length} topics selected in this branch`);
}
function copySelection() {
  const ids = topLevelSelection();
  const nodes = ids.map((id) => findNode(state.map.document, id)?.node).filter(Boolean);
  if (!nodes.length) return false;
  const text = nodes.map((node) => subtreeToOutline(node)).join('\n');
  state.clipboard = { text, nodes: structuredClone(nodes) };
  navigator.clipboard?.writeText(text).catch(() => {});
  announce(`${nodes.length} ${nodes.length === 1 ? 'branch' : 'branches'} copied`);
  toast(nodes.length === 1 ? 'Branch copied' : `${nodes.length} branches copied`);
  return true;
}
function cutSelection() { if (copySelection()) deleteSelected(); }
function duplicateSelection() {
  const ids = topLevelSelection([...state.selectedIds].filter((id) => id !== state.map.document.id));
  if (!ids.length) return toast('The central topic cannot be duplicated');
  const offsets = new Map(); const operations = []; const cloneIds = [];
  ids.forEach((id) => {
    const found = findNode(state.map.document, id); if (!found?.parent) return;
    const offset = offsets.get(found.parent.id) || 0;
    const index = found.parent.children.findIndex((child) => child.id === id) + 1 + offset;
    const cloned = cloneSubtree(found.node); cloneIds.push(cloned.id);
    operations.push({ type: 'add', parentId: found.parent.id, index, node: cloned });
    offsets.set(found.parent.id, offset + 1);
  });
  if (operations.length) execute({ type: 'batch', operations }, { selectIds: cloneIds, announceText: `${operations.length} ${operations.length === 1 ? 'branch' : 'branches'} duplicated` });
}
function pasteOutline(text) {
  const target = findNode(state.map.document, state.selected)?.node;
  if (!target || !canEdit()) return;
  let nodes; const internalClipboard = state.clipboard?.text === text;
  try {
    nodes = internalClipboard
      ? state.clipboard.nodes.map((node) => cloneSubtree(node))
      : outlineToSubtrees(text);
  } catch (error) { toast(error.message); announce(error.message); return; }
  if (!nodes.length) return;
  const applyBranchColor = (node, color, textColor) => {
    node.color = color; node.textColor = textColor;
    node.children.forEach((child) => applyBranchColor(child, color, textColor));
  };
  if (!internalClipboard) nodes.forEach((node) => applyBranchColor(node, target.color, target.textColor));
  const operations = [];
  if (target.collapsed) operations.push({ type: 'collapse', nodeId: target.id, collapsed: false });
  nodes.forEach((node) => operations.push({ type: 'add', parentId: target.id, node }));
  execute({ type: 'batch', operations }, { selectIds: nodes.map((node) => node.id), announceText: `${nodes.length} ${nodes.length === 1 ? 'branch' : 'branches'} pasted` });
}
function promoteSelected() {
  const found = findNode(state.map.document, state.selected); if (!found?.parent) return toast('The central topic cannot be promoted');
  const grand = findNode(state.map.document, found.parent.id)?.parent; if (!grand) return toast('This topic is already at the first branch level');
  const parentIndex = grand.children.findIndex((child) => child.id === found.parent.id);
  execute({ type: 'move', nodeId: found.node.id, parentId: grand.id, index: parentIndex + 1 }, { announceText: 'Topic promoted one level' });
}
function reorderSelected(direction) {
  const found = findNode(state.map.document, state.selected); if (!found?.parent) return;
  const index = found.parent.children.findIndex((child) => child.id === found.node.id);
  if ((direction < 0 && index === 0) || (direction > 0 && index === found.parent.children.length - 1)) return;
  const targetIndex = direction < 0 ? index - 1 : index + 2;
  execute({ type: 'move', nodeId: found.node.id, parentId: found.parent.id, index: targetIndex }, { announceText: direction < 0 ? 'Topic moved up' : 'Topic moved down' });
}
function bulkShape(shape) {
  const operations = [...state.selectedIds].map((nodeId) => ({ type: 'shape', nodeId, shape }));
  if (operations.length) execute({ type: 'batch', operations }, { preserveSelection: true, announceText: `${operations.length} topics changed to ${shape}` });
}
function applyFormatChanges(changes, message = 'Topic format updated') {
  const operations = [...state.selectedIds].map((nodeId) => ({ type: 'format', nodeId, changes }));
  if (!operations.length) return;
  const operation = operations.length === 1 ? operations[0] : { type: 'batch', operations };
  execute(operation, { preserveSelection: true, announceText: operations.length > 1 ? `${operations.length} topic formats updated` : message });
}
function applyConnectorChanges(changes, message = 'Connector style updated') {
  execute({ type: 'connector', nodeId: state.map.document.id, changes }, { preserveSelection: true, announceText: message });
}
function updateFormatPanel() {
  if (!state.map) return;
  const node = findNode(state.map.document, state.selected)?.node; if (!node) return;
  $('#format-selection-label').textContent = `${state.selectedIds.size} ${state.selectedIds.size === 1 ? 'topic' : 'topics'} selected`;
  $('#format-shape').value = node.shape; $('#format-color').value = node.color; $('#format-text-color').value = node.textColor;
  $('#format-font-size').value = String(node.fontSize); $('#format-align').value = node.textAlign;
  $('#format-bold-btn').setAttribute('aria-pressed', String(node.fontWeight >= 700));
  $('#format-italic-btn').setAttribute('aria-pressed', String(node.fontStyle === 'italic'));
  const document = state.map.document;
  $$('[data-connector-style]').forEach((button) => {
    const selected = button.dataset.connectorStyle === document.connectorStyle;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $('#connector-end').value = document.connectorEnd; $('#connector-width').value = document.connectorWidth;
  $('#connector-color-mode').value = document.connectorColorMode; $('#connector-color').value = document.connectorColor;
  $('#connector-custom-color-row').classList.toggle('hidden', document.connectorColorMode !== 'custom');
  const smartStyle = document.layout === 'org-chart' ? 'Elbow 90 deg' : 'Curved';
  $('#connector-smart-hint').textContent = document.connectorStyle === 'smart'
    ? `Smart currently uses ${smartStyle} for this layout.`
    : 'This connector style remains selected when the map layout changes.';
  $$('#format-panel input,#format-panel select,#format-panel button:not(#format-close-btn)').forEach((control) => { control.disabled = !canEdit(); });
  const layout = document.layout || 'right';
  $$('[data-layout]').forEach((button) => {
    const selected = button.dataset.layout === layout;
    button.classList.toggle('active-tool', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
$('#format-shape').addEventListener('change', (event) => applyFormatChanges({ shape: event.target.value }, 'Topic shape updated'));
$('#format-color').addEventListener('change', (event) => applyFormatChanges({ color: event.target.value }, 'Topic color updated'));
$('#format-text-color').addEventListener('change', (event) => applyFormatChanges({ textColor: event.target.value }, 'Text color updated'));
$('#format-font-size').addEventListener('change', (event) => applyFormatChanges({ fontSize: Number(event.target.value) }, 'Text size updated'));
$('#format-align').addEventListener('change', (event) => applyFormatChanges({ textAlign: event.target.value }, 'Text alignment updated'));
$('#format-bold-btn').addEventListener('click', () => { const node = findNode(state.map.document, state.selected)?.node; if (node) applyFormatChanges({ fontWeight: node.fontWeight >= 700 ? 600 : 700 }, 'Text weight updated'); });
$('#format-italic-btn').addEventListener('click', () => { const node = findNode(state.map.document, state.selected)?.node; if (node) applyFormatChanges({ fontStyle: node.fontStyle === 'italic' ? 'normal' : 'italic' }, 'Text style updated'); });
$$('[data-connector-style]').forEach((button) => button.addEventListener('click', () => applyConnectorChanges({ connectorStyle: button.dataset.connectorStyle }, `Connector path changed to ${button.textContent.trim()}`)));
$('#connector-end').addEventListener('change', (event) => applyConnectorChanges({ connectorEnd: event.target.value }, event.target.value === 'arrow' ? 'Connector arrows enabled' : 'Connector arrows removed'));
$('#connector-width').addEventListener('change', (event) => applyConnectorChanges({ connectorWidth: event.target.value }, `Connector thickness changed to ${event.target.value}`));
$('#connector-color-mode').addEventListener('change', (event) => applyConnectorChanges({ connectorColorMode: event.target.value }, event.target.value === 'branch' ? 'Connectors now follow branch colors' : 'Custom connector color enabled'));
$('#connector-color').addEventListener('change', (event) => applyConnectorChanges({ connectorColor: event.target.value }, 'Connector color updated'));
$('#connector-reset-btn').addEventListener('click', () => applyConnectorChanges({ connectorStyle: 'smart', connectorEnd: 'none', connectorWidth: 'regular', connectorColorMode: 'branch', connectorColor: '#c2878d' }, 'Connector settings reset to layout defaults'));
$('#format-toggle-btn').addEventListener('click', () => $('#format-panel').classList.toggle('mobile-open'));
$('#format-close-btn').addEventListener('click', () => $('#format-panel').classList.remove('mobile-open'));
function changeLayout(layout) {
  const labels = { right: 'Logic Tree', spider: 'Spider Diagram', 'top-down': 'Top-down Tree', 'org-chart': 'Org Chart' };
  const result = execute({ type: 'layout', nodeId: state.map.document.id, layout }, { preserveSelection: true, announceText: `${labels[layout] || 'Mind map'} layout applied` });
  if (result && state.view === 'canvas') requestAnimationFrame(fitMap);
}
$$('[data-layout]').forEach((button) => button.addEventListener('click', () => changeLayout(button.dataset.layout)));
function toggleCollapse(nodeId = state.selected) {
  const node = findNode(state.map.document, nodeId)?.node; if (!node?.children.length) return toast('This topic has no child branch');
  if (!canEdit()) {
    const result = applyOperation(state.map.document, { type: 'collapse', nodeId, collapsed: !node.collapsed });
    if (!result.ok) return;
    state.map.document = result.document; state.selected = nodeId; renderEditor();
    announce(node.collapsed ? 'Branch expanded' : 'Branch collapsed');
    return;
  }
  execute({ type: 'collapse', nodeId, collapsed: !node.collapsed }, { announceText: node.collapsed ? 'Branch expanded' : 'Branch collapsed' });
}
$('#add-child-btn').addEventListener('click', () => addChild()); $('#add-sibling-btn').addEventListener('click', addSibling);
$('#delete-node-btn').addEventListener('click', deleteSelected); $('#collapse-node-btn').addEventListener('click', () => toggleCollapse());
$('#duplicate-node-btn').addEventListener('click', duplicateSelection); $('#select-branch-btn').addEventListener('click', selectBranch);
$('#copy-node-btn').addEventListener('click', copySelection);
$('#promote-node-btn').addEventListener('click', promoteSelected);
$('#paste-outline-btn').addEventListener('click', () => { $('#paste-parent-name').textContent = findNode(state.map.document, state.selected)?.node.title || 'selected topic'; $('#paste-outline-dialog').showModal(); $('#paste-outline-form').elements.outline.focus(); });
$('#paste-outline-form').addEventListener('submit', (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault(); const form = event.currentTarget; pasteOutline(form.elements.outline.value); form.reset(); $('#paste-outline-dialog').close();
});
$('#paste-outline-form').elements.outline.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  event.preventDefault(); const input = event.currentTarget; const start = input.selectionStart; const end = input.selectionEnd;
  if (!event.shiftKey) {
    input.setRangeText('  ', start, end, 'end'); return;
  }
  const lineStart = input.value.lastIndexOf('\n', start - 1) + 1;
  const removable = input.value.slice(lineStart, start).match(/^(?: {1,2}|\t)/)?.[0] || '';
  if (removable) {
    input.setRangeText('', lineStart, lineStart + removable.length, 'preserve');
    input.setSelectionRange(Math.max(lineStart, start - removable.length), Math.max(lineStart, end - removable.length));
  }
});
$('#bulk-copy-btn').addEventListener('click', copySelection); $('#bulk-duplicate-btn').addEventListener('click', duplicateSelection);
$('#bulk-delete-btn').addEventListener('click', deleteSelected); $('#clear-selection-btn').addEventListener('click', () => setSelection([state.selected], state.selected));
$('#bulk-shape').addEventListener('change', (event) => { if (event.target.value) bulkShape(event.target.value); event.target.value = ''; });

function visibleRows() { return flattenTree(state.map.document, true); }
function setSelection(ids, primary = null, focus = false, render = true) {
  if (!state.map) return;
  const valid = [...new Set(ids)].filter((id) => findNode(state.map.document, id));
  if (!valid.length) valid.push(state.map.document.id);
  state.selectedIds = new Set(valid);
  state.selected = valid.includes(primary) ? primary : valid.at(-1);
  state.selectionAnchor = state.selected;
  if (!render) return;
  $$('.mind-node').forEach((element) => {
    const selected = state.selectedIds.has(element.dataset.nodeId); element.classList.toggle('selected', selected);
    element.classList.toggle('primary-selected', element.dataset.nodeId === state.selected);
    element.setAttribute('aria-selected', String(selected)); element.tabIndex = element.dataset.nodeId === state.selected ? 0 : -1;
    const existingMark = element.querySelector('.selection-mark');
    if (selected && !existingMark) { const mark = document.createElement('span'); mark.className = 'selection-mark'; mark.setAttribute('aria-hidden', 'true'); mark.innerHTML = '<i class="ph ph-check"></i>'; element.prepend(mark); }
    if (!selected) existingMark?.remove();
  });
  renderTable(); updateSelectionControls();
  if (focus) nodeElement(state.selected)?.focus();
}
function selectNode(id, focus = false, additive = false, range = false) {
  if (!findNode(state.map.document, id)) return;
  const anchor = state.selectionAnchor;
  let ids = [id];
  if (range && anchor) {
    const rows = visibleRows().map(({ node }) => node.id);
    const from = rows.indexOf(anchor); const to = rows.indexOf(id);
    if (from >= 0 && to >= 0) ids = rows.slice(Math.min(from, to), Math.max(from, to) + 1);
  } else if (additive) {
    ids = [...state.selectedIds];
    const index = ids.indexOf(id);
    if (index >= 0 && ids.length > 1) ids.splice(index, 1); else if (index < 0) ids.push(id);
  }
  setSelection(ids, id, focus);
  if (range) state.selectionAnchor = anchor;
}
function topLevelSelection(ids = [...state.selectedIds]) {
  const selected = new Set(ids);
  return ids.filter((id) => {
    let parent = findNode(state.map.document, id)?.parent;
    while (parent) {
      if (selected.has(parent.id)) return false;
      parent = findNode(state.map.document, parent.id)?.parent;
    }
    return true;
  });
}
function navigateNode(key) {
  const nextId = findDirectionalNeighbor(state.layout, state.selected, key);
  if (nextId) selectNode(nextId, true);
}

function renderEditor() {
  if (!state.map) return;
  const validSelection = [...state.selectedIds].filter((id) => findNode(state.map.document, id));
  if (!findNode(state.map.document, state.selected)) state.selected = validSelection.at(-1) || state.map.document.id;
  if (!validSelection.length) validSelection.push(state.selected);
  state.selectedIds = new Set(validSelection);
  if (state.view === 'canvas') renderCanvas();
  renderTable(); updateSelectionControls();
}
function updateSelectionControls() {
  const found = findNode(state.map.document, state.selected); const isRoot = !found?.parent;
  const selectedCount = state.selectedIds.size;
  const deletable = [...state.selectedIds].some((id) => id !== state.map.document.id);
  $('#delete-node-btn').disabled = !canEdit() || !deletable;
  $('#duplicate-node-btn').disabled = !canEdit() || !deletable;
  $('#select-branch-btn').disabled = !canEdit() || !found?.node.children.length;
  const grand = found?.parent ? findNode(state.map.document, found.parent.id)?.parent : null;
  $('#promote-node-btn').disabled = !canEdit() || isRoot || !grand;
  $('#collapse-node-btn').disabled = !canEdit() || !found?.node.children.length;
  $('#collapse-node-btn').querySelector('span')?.remove();
  $('#selection-toolbar').classList.toggle('hidden', !canEdit() || selectedCount < 2);
  $('#selection-count').textContent = `${selectedCount} selected`;
  updateFormatPanel();
}

const resizeObserver = new ResizeObserver((entries) => {
  if (state.rendering || !state.map || $('#node-viewport .node-editor')) return;
  let changed = false;
  for (const entry of entries) {
    if (!entry.target.isConnected) continue;
    const id = entry.target.dataset.nodeId; const previous = state.renderedSizes.get(id);
    if (previous && (Math.abs(previous.width - entry.target.offsetWidth) > 1 || Math.abs(previous.height - entry.target.offsetHeight) > 1)) changed = true;
  }
  if (changed && !state.renderQueued) { state.renderQueued = true; requestAnimationFrame(() => { state.renderQueued = false; renderCanvas(); }); }
});

function positionSpiderTree(tree) {
  const countByDepth = new Map(); const maxWidthByDepth = new Map(); let maxDepth = 0;
  tree.each((item) => {
    const size = state.renderedSizes.get(item.data.id) || { width: 160, height: 46 };
    maxDepth = Math.max(maxDepth, item.depth);
    countByDepth.set(item.depth, (countByDepth.get(item.depth) || 0) + 1);
    maxWidthByDepth.set(item.depth, Math.max(maxWidthByDepth.get(item.depth) || 0, size.width, size.height));
  });
  const radii = [0];
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const currentSize = maxWidthByDepth.get(depth) || 160; const previousSize = maxWidthByDepth.get(depth - 1) || 160;
    const circumferenceRadius = ((countByDepth.get(depth) || 1) * (currentSize + 58)) / (Math.PI * 2);
    radii[depth] = Math.max(radii[depth - 1] + (previousSize + currentSize) / 2 + 105, circumferenceRadius);
  }
  const weight = (item) => item.children?.length ? item.children.reduce((sum, child) => sum + weight(child), 0) : 1;
  const assignAngles = (item, start, end) => {
    item.angle = item.depth ? (start + end) / 2 : 0;
    if (!item.children?.length) return;
    const total = item.children.reduce((sum, child) => sum + weight(child), 0); let cursor = start;
    item.children.forEach((child) => {
      const span = (end - start) * weight(child) / total;
      assignAngles(child, cursor, cursor + span); cursor += span;
    });
  };
  assignAngles(tree, -Math.PI / 2, Math.PI * 1.5);
  tree.each((item) => {
    item.layoutX = Math.cos(item.angle) * radii[item.depth];
    item.layoutY = Math.sin(item.angle) * radii[item.depth];
  });
}

function alignOrgChartLevels(tree) {
  const maxHeightByDepth = new Map(); let maxDepth = 0;
  tree.each((item) => {
    const height = state.renderedSizes.get(item.data.id)?.height || 46;
    maxDepth = Math.max(maxDepth, item.depth);
    maxHeightByDepth.set(item.depth, Math.max(maxHeightByDepth.get(item.depth) || 0, height));
  });
  const yByDepth = [0];
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    yByDepth[depth] = yByDepth[depth - 1] + (maxHeightByDepth.get(depth - 1) || 46) / 2 + (maxHeightByDepth.get(depth) || 46) / 2 + 76;
  }
  tree.each((item) => { item.layoutX = item.x; item.layoutY = yByDepth[item.depth]; });
}

function rectangleAnchor(node, toward) {
  const dx = toward.x - node.x; const dy = toward.y - node.y;
  if (!dx && !dy) return { x: node.x, y: node.y };
  const factor = 1 / Math.max(Math.abs(dx) / Math.max(1, node.width / 2), Math.abs(dy) / Math.max(1, node.height / 2));
  return { x: node.x + dx * factor, y: node.y + dy * factor };
}

function effectiveConnectorStyle(document) {
  if (document.connectorStyle !== 'smart') return document.connectorStyle;
  return document.layout === 'org-chart' ? 'elbow' : 'curved';
}

function edgePathForLayout(layoutMode, connectorStyle, from, to) {
  const start = rectangleAnchor(from, to); const end = rectangleAnchor(to, from);
  if (connectorStyle === 'straight') return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const vertical = layoutMode === 'top-down' || layoutMode === 'org-chart';
  if (connectorStyle === 'elbow') {
    if (vertical) { const middleY = (start.y + end.y) / 2; return `M ${start.x} ${start.y} V ${middleY} H ${end.x} V ${end.y}`; }
    if (layoutMode === 'spider' && Math.abs(end.y - start.y) > Math.abs(end.x - start.x)) {
      const middleY = (start.y + end.y) / 2; return `M ${start.x} ${start.y} V ${middleY} H ${end.x} V ${end.y}`;
    }
    const middleX = (start.x + end.x) / 2; return `M ${start.x} ${start.y} H ${middleX} V ${end.y} H ${end.x}`;
  }
  if (layoutMode === 'spider') {
    const distance = Math.hypot(end.x - start.x, end.y - start.y); const targetLength = Math.hypot(to.x, to.y) || 1; const sourceLength = Math.hypot(from.x, from.y) || targetLength;
    const targetDirection = { x: to.x / targetLength, y: to.y / targetLength };
    const sourceDirection = from.x || from.y ? { x: from.x / sourceLength, y: from.y / sourceLength } : targetDirection;
    return `M ${start.x} ${start.y} C ${start.x + sourceDirection.x * distance * .42} ${start.y + sourceDirection.y * distance * .42}, ${end.x - targetDirection.x * distance * .42} ${end.y - targetDirection.y * distance * .42}, ${end.x} ${end.y}`;
  }
  if (vertical) {
    const bend = Math.max(28, Math.abs(end.y - start.y) * .46);
    return `M ${start.x} ${start.y} C ${start.x} ${start.y + bend}, ${end.x} ${end.y - bend}, ${end.x} ${end.y}`;
  }
  const direction = Math.sign(end.x - start.x) || 1; const bend = Math.max(32, Math.abs(end.x - start.x) * .48);
  return `M ${start.x} ${start.y} C ${start.x + bend * direction} ${start.y}, ${end.x - bend * direction} ${end.y}, ${end.x} ${end.y}`;
}

function renderCanvas() {
  if (!state.map) return;
  state.rendering = true;
  resizeObserver.disconnect();
  const layer = $('#node-viewport'); const edges = $('#edges'); layer.replaceChildren(); edges.replaceChildren(); state.layout = new Map(); state.renderedSizes = new Map();
  const rows = visibleRows();
  rows.forEach(({ node, depth }) => {
    const element = document.createElement('div');
    element.className = `mind-node shape-${node.shape}${node.id === state.map.document.id ? ' root' : ''}${state.selectedIds.has(node.id) ? ' selected' : ''}${node.id === state.selected ? ' primary-selected' : ''}`;
    element.dataset.nodeId = node.id; element.setAttribute('role', 'treeitem'); element.setAttribute('aria-level', String(depth + 1));
    element.setAttribute('aria-selected', String(state.selectedIds.has(node.id))); element.tabIndex = node.id === state.selected ? 0 : -1;
    if (node.children.length) element.setAttribute('aria-expanded', String(!node.collapsed));
    const root = node.id === state.map.document.id;
    element.style.background = root && node.color === DEFAULT_ROOT_COLOR ? 'var(--gradient)' : (node.shape === 'plain' && !root ? 'transparent' : node.color);
    element.style.borderColor = node.color === DEFAULT_NODE_COLOR ? '#e2c7c7' : node.color;
    element.style.color = node.textColor; element.style.fontSize = `${node.fontSize}px`; element.style.fontWeight = String(node.fontWeight); element.style.fontStyle = node.fontStyle;
    if (state.selectedIds.has(node.id)) { const mark = document.createElement('span'); mark.className = 'selection-mark'; mark.setAttribute('aria-hidden', 'true'); mark.innerHTML = '<i class="ph ph-check"></i>'; element.append(mark); }
    const label = document.createElement('span'); label.className = 'node-label'; label.textContent = node.title; label.style.textAlign = node.textAlign; element.append(label);
    if (node.children.length) {
      const branch = document.createElement('button'); branch.className = 'branch-toggle'; branch.type = 'button'; branch.title = node.collapsed ? 'Expand branch' : 'Collapse branch'; branch.setAttribute('aria-label', branch.title);
      branch.innerHTML = `<i class="ph ${node.collapsed ? 'ph-plus' : 'ph-minus'}"></i><span>${node.children.length}</span>`;
      branch.addEventListener('pointerdown', (event) => event.stopPropagation()); branch.addEventListener('click', (event) => { event.stopPropagation(); toggleCollapse(node.id); }); element.append(branch);
    }
    element.addEventListener('click', (event) => { if (!state.suppressClick) selectNode(node.id, false, event.ctrlKey || event.metaKey || event.shiftKey); });
    element.addEventListener('dblclick', (event) => { event.preventDefault(); event.stopPropagation(); setTimeout(() => startInlineEdit(node.id), 0); });
    element.addEventListener('keydown', (event) => handleNodeKey(event, node.id));
    if (canEdit()) attachNodeDrag(element, node.id);
    layer.append(element); resizeObserver.observe(element);
    state.renderedSizes.set(node.id, { width: element.offsetWidth, height: element.offsetHeight });
  });

  const layoutMode = state.map.document.layout || 'right'; const vertical = layoutMode === 'top-down' || layoutMode === 'org-chart';
  const layout = window.d3?.flextree?.({
    children: (node) => node.collapsed ? [] : node.children,
    nodeSize: (hierarchyNode) => {
      const size = state.renderedSizes.get(hierarchyNode.data.id) || { width: 160, height: 46 };
      if (layoutMode === 'org-chart') return [size.width + 38, size.height + 76];
      if (layoutMode === 'top-down') return [size.width + 58, size.height + 100];
      return [size.height + 34, size.width + 112];
    },
    spacing: 12,
  });
  if (!layout) { state.rendering = false; toast('Mind map layout failed to load'); return; }
  const tree = layout.hierarchy(state.map.document);
  if (layoutMode === 'spider') positionSpiderTree(tree);
  else {
    layout(tree);
    if (layoutMode === 'org-chart') alignOrgChartLevels(tree);
    else if (layoutMode === 'top-down') tree.each((item) => { item.layoutX = item.x; item.layoutY = item.y; });
    else tree.each((item) => { item.layoutX = item.y; item.layoutY = item.x; });
  }
  let left = Infinity; let right = -Infinity; let top = Infinity; let bottom = -Infinity;
  tree.each((item) => {
    const size = state.renderedSizes.get(item.data.id); const x = item.layoutX; const y = item.layoutY;
    const position = { x, y, width: size.width, height: size.height, parentId: item.parent?.data.id || null };
    state.layout.set(item.data.id, position);
    left = Math.min(left, x - size.width / 2); right = Math.max(right, x + size.width / 2); top = Math.min(top, y - size.height / 2); bottom = Math.max(bottom, y + size.height / 2);
  });
  state.bounds = { left, right, top, bottom, width: right - left, height: bottom - top };
  for (const element of $$('.mind-node')) {
    const position = state.layout.get(element.dataset.nodeId); if (!position) continue;
    element.style.transform = `translate(${position.x - position.width / 2}px,${position.y - position.height / 2}px)`;
    const branchToggle = element.querySelector('.branch-toggle');
    branchToggle?.classList.toggle('branch-left', layoutMode === 'spider' && position.x < 0);
    branchToggle?.classList.toggle('branch-bottom', vertical);
  }
  tree.each((item) => {
    if (!item.parent) return;
    const from = state.layout.get(item.parent.data.id); const to = state.layout.get(item.data.id);
    const path = document.createElementNS(svgNS, 'path'); path.setAttribute('class', 'edge');
    const connectorColor = state.map.document.connectorColorMode === 'custom'
      ? state.map.document.connectorColor
      : (item.data.color === DEFAULT_NODE_COLOR ? '#c2878d' : item.data.color);
    const connectorWidth = { thin: 1.4, regular: 2.2, bold: 3.4 }[state.map.document.connectorWidth] || 2.2;
    path.style.stroke = connectorColor; path.style.strokeWidth = String(connectorWidth);
    path.dataset.connectorStyle = effectiveConnectorStyle(state.map.document);
    path.setAttribute('d', edgePathForLayout(layoutMode, path.dataset.connectorStyle, from, to));
    if (state.map.document.connectorEnd === 'arrow') path.setAttribute('marker-end', 'url(#connector-arrow)');
    edges.append(path);
  });
  applyTransform(); state.rendering = false;
  if (state.editAfterRender) { const id = state.editAfterRender; state.editAfterRender = null; queueMicrotask(() => startInlineEdit(id)); }
}

function nodeElement(id) { return $$('.mind-node').find((element) => element.dataset.nodeId === id) || null; }
function handleNodeKey(event, nodeId) {
  if (event.target.matches('textarea,input,select')) return;
  state.selected = nodeId; state.selectedIds.add(nodeId);
  if (event.key === 'F2') { event.preventDefault(); startInlineEdit(nodeId); }
  else if (event.key === 'Tab' && event.shiftKey) { event.preventDefault(); promoteSelected(); }
  else if (event.key === 'Tab') { event.preventDefault(); addChild(); }
  else if (event.key === 'Enter') { event.preventDefault(); addSibling(); }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
  else if (event.key === ' ') { event.preventDefault(); toggleCollapse(); }
  else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); reorderSelected(event.key === 'ArrowUp' ? -1 : 1); }
  else if (event.key.startsWith('Arrow')) { event.preventDefault(); navigateNode(event.key); }
}
function startInlineEdit(nodeId) {
  if (!canEdit()) return;
  const found = findNode(state.map.document, nodeId); const element = nodeElement(nodeId); if (!found || !element || element.querySelector('textarea')) return;
  state.selected = nodeId; state.selectedIds = new Set([nodeId]); const label = element.querySelector('.node-label'); const original = found.node.title;
  const input = document.createElement('textarea'); input.className = 'node-editor'; input.maxLength = 240; input.value = original; input.setAttribute('aria-label', 'Topic text');
  label.replaceWith(input); let finished = false;
  const resize = () => { input.style.height = '0'; input.style.height = `${Math.min(180, input.scrollHeight)}px`; };
  const finish = (save) => {
    if (finished) return; finished = true;
    const title = input.value.trim();
    if (save && title && title !== original) execute({ type: 'rename', nodeId, title }, { announceText: 'Topic renamed' });
    else { if (save && !title) toast('Topic text cannot be empty'); renderCanvas(); }
  };
  input.addEventListener('input', resize);
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true)); input.addEventListener('pointerdown', (event) => event.stopPropagation());
  resize(); input.focus(); input.select();
}

function applyTransform() {
  const transform = `translate(${state.panX}px,${state.panY}px) scale(${state.scale})`;
  $('#node-viewport').style.transform = transform;
  $('#edge-viewport').setAttribute('transform', `translate(${state.panX},${state.panY}) scale(${state.scale})`);
  $('#zoom-level').textContent = `${Math.round(state.scale * 100)}%`;
}
function fitMap() {
  if (!state.bounds) return;
  const canvas = $('#canvas'); const pad = canvas.clientWidth < 600 ? 42 : 90;
  const width = Math.max(1, state.bounds.width); const height = Math.max(1, state.bounds.height);
  const minimumScale = canvas.clientWidth < 600 ? .2 : .35;
  state.scale = Math.max(minimumScale, Math.min(1.25, (canvas.clientWidth - pad * 2) / width, (canvas.clientHeight - pad * 2) / height));
  state.panX = canvas.clientWidth / 2 - ((state.bounds.left + state.bounds.right) / 2) * state.scale;
  state.panY = canvas.clientHeight / 2 - ((state.bounds.top + state.bounds.bottom) / 2) * state.scale; applyTransform();
}
function fitSelection() {
  const position = state.layout.get(state.selected); if (!position) return;
  const canvas = $('#canvas'); state.scale = Math.max(.75, Math.min(1.25, state.scale));
  state.panX = canvas.clientWidth / 2 - position.x * state.scale; state.panY = canvas.clientHeight / 2 - position.y * state.scale; applyTransform();
}
function zoom(amount, origin = null) {
  const canvas = $('#canvas'); const rect = canvas.getBoundingClientRect(); const point = origin || { x: rect.width / 2, y: rect.height / 2 };
  const worldX = (point.x - state.panX) / state.scale; const worldY = (point.y - state.panY) / state.scale;
  state.scale = Math.max(canvas.clientWidth < 600 ? .2 : .35, Math.min(2, state.scale + amount)); state.panX = point.x - worldX * state.scale; state.panY = point.y - worldY * state.scale; applyTransform();
}
$('#zoom-in-btn').addEventListener('click', () => zoom(.15)); $('#zoom-out-btn').addEventListener('click', () => zoom(-.15));
$('#fit-btn').addEventListener('click', fitMap); $('#fit-selection-btn').addEventListener('click', fitSelection);
function setCanvasTool(tool) {
  state.canvasTool = tool === 'select' ? 'select' : 'pan';
  $('#canvas').classList.toggle('tool-select', state.canvasTool === 'select');
  $('#pan-tool-btn').classList.toggle('active-tool', state.canvasTool === 'pan');
  $('#select-tool-btn').classList.toggle('active-tool', state.canvasTool === 'select');
  $('#pan-tool-btn').setAttribute('aria-pressed', String(state.canvasTool === 'pan'));
  $('#select-tool-btn').setAttribute('aria-pressed', String(state.canvasTool === 'select'));
  announce(`${state.canvasTool === 'select' ? 'Select' : 'Pan'} tool active`);
}
$('#pan-tool-btn').addEventListener('click', () => setCanvasTool('pan')); $('#select-tool-btn').addEventListener('click', () => setCanvasTool('select'));
$('#canvas').addEventListener('wheel', (event) => { event.preventDefault(); const rect = $('#canvas').getBoundingClientRect(); zoom(event.deltaY < 0 ? .1 : -.1, { x: event.clientX - rect.left, y: event.clientY - rect.top }); }, { passive: false });
let canvasDrag = null;
$('#canvas').addEventListener('pointerdown', (event) => {
  if (event.target.closest('.mind-node') || event.button !== 0) return;
  if (state.canvasTool === 'select' || event.shiftKey) {
    const rect = $('#canvas').getBoundingClientRect();
    state.marquee = { startX: event.clientX - rect.left, startY: event.clientY - rect.top, x: event.clientX - rect.left, y: event.clientY - rect.top, additive: event.ctrlKey || event.metaKey };
    const box = $('#selection-box'); box.classList.remove('hidden'); box.style.left = `${state.marquee.startX}px`; box.style.top = `${state.marquee.startY}px`; box.style.width = '0'; box.style.height = '0';
    $('#canvas').setPointerCapture(event.pointerId); event.preventDefault(); return;
  }
  canvasDrag = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY }; $('#canvas').classList.add('dragging'); $('#canvas').setPointerCapture(event.pointerId);
});
$('#canvas').addEventListener('pointermove', (event) => {
  if (state.marquee) {
    const rect = $('#canvas').getBoundingClientRect(); state.marquee.x = event.clientX - rect.left; state.marquee.y = event.clientY - rect.top;
    const left = Math.min(state.marquee.startX, state.marquee.x); const top = Math.min(state.marquee.startY, state.marquee.y);
    const box = $('#selection-box'); box.style.left = `${left}px`; box.style.top = `${top}px`; box.style.width = `${Math.abs(state.marquee.x - state.marquee.startX)}px`; box.style.height = `${Math.abs(state.marquee.y - state.marquee.startY)}px`;
    return;
  }
  if (!canvasDrag) return; state.panX = canvasDrag.panX + event.clientX - canvasDrag.x; state.panY = canvasDrag.panY + event.clientY - canvasDrag.y; applyTransform();
});
$('#canvas').addEventListener('pointerup', () => {
  if (state.marquee) {
    const canvasRect = $('#canvas').getBoundingClientRect();
    const selectionRect = {
      left: canvasRect.left + Math.min(state.marquee.startX, state.marquee.x),
      right: canvasRect.left + Math.max(state.marquee.startX, state.marquee.x),
      top: canvasRect.top + Math.min(state.marquee.startY, state.marquee.y),
      bottom: canvasRect.top + Math.max(state.marquee.startY, state.marquee.y),
    };
    const hits = $$('.mind-node').filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.right >= selectionRect.left && rect.left <= selectionRect.right && rect.bottom >= selectionRect.top && rect.top <= selectionRect.bottom;
    }).map((node) => node.dataset.nodeId);
    const ids = state.marquee.additive ? [...state.selectedIds, ...hits] : hits;
    state.marquee = null; $('#selection-box').classList.add('hidden');
    if (hits.length) { setSelection(ids, hits.at(-1)); announce(`${new Set(ids).size} topics selected`); }
    else if (state.canvasTool === 'select') setSelection([state.map.document.id], state.map.document.id);
    return;
  }
  canvasDrag = null; $('#canvas').classList.remove('dragging');
});
$('#canvas').addEventListener('pointercancel', () => { state.marquee = null; canvasDrag = null; $('#selection-box').classList.add('hidden'); $('#canvas').classList.remove('dragging'); });

function clearDropState() { $$('.mind-node.drop-target,.mind-node.drop-invalid,.mind-node.drop-before,.mind-node.drop-after,.mind-node.drop-left,.mind-node.drop-right').forEach((node) => node.classList.remove('drop-target', 'drop-invalid', 'drop-before', 'drop-after', 'drop-left', 'drop-right')); $('#drop-marker').classList.add('hidden'); }
function dropForPoint(clientX, clientY, draggedId = null) {
  clearDropState(); const target = document.elementFromPoint(clientX, clientY)?.closest('.mind-node'); if (!target) return null;
  const targetId = target.dataset.nodeId; const invalid = draggedId && (draggedId === state.map.document.id || descendantIds(state.map.document, draggedId).has(targetId));
  if (invalid) { target.classList.add('drop-invalid'); return { invalid: true, targetId }; }
  const targetFound = findNode(state.map.document, targetId); const draggedFound = draggedId ? findNode(state.map.document, draggedId) : null;
  const targetRect = target.getBoundingClientRect(); const verticalRatio = (clientY - targetRect.top) / targetRect.height; const horizontalRatio = (clientX - targetRect.left) / targetRect.width;
  const layoutMode = state.map.document.layout || 'right'; let horizontalOrder = layoutMode === 'top-down' || layoutMode === 'org-chart';
  if (layoutMode === 'spider' && targetFound?.parent) {
    const targetPosition = state.layout.get(targetId); const parentPosition = state.layout.get(targetFound.parent.id);
    if (targetPosition && parentPosition) horizontalOrder = Math.abs(targetPosition.y - parentPosition.y) >= Math.abs(targetPosition.x - parentPosition.x);
  }
  const edgeRatio = horizontalOrder ? horizontalRatio : verticalRatio;
  if (draggedFound?.parent && targetFound?.parent?.id === draggedFound.parent.id && targetId !== draggedId && (edgeRatio < .25 || edgeRatio > .75)) {
    const before = edgeRatio < .25;
    target.classList.add(horizontalOrder ? (before ? 'drop-left' : 'drop-right') : (before ? 'drop-before' : 'drop-after'));
    const targetIndex = targetFound.parent.children.findIndex((child) => child.id === targetId);
    return { targetId, parentId: targetFound.parent.id, index: targetIndex + (before ? 0 : 1), mode: 'reorder' };
  }
  target.classList.add('drop-target'); return { targetId, parentId: targetId, mode: 'reparent' };
}
function makeGhost(text) { const ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.textContent = text; document.body.append(ghost); return ghost; }
function autoPan(clientX, clientY) {
  const rect = $('#canvas').getBoundingClientRect(); const edge = 44; let dx = 0; let dy = 0;
  if (clientX < rect.left + edge) dx = 12; if (clientX > rect.right - edge) dx = -12; if (clientY < rect.top + edge) dy = 12; if (clientY > rect.bottom - edge) dy = -12;
  if (dx || dy) { state.panX += dx; state.panY += dy; applyTransform(); }
}
function attachNodeDrag(element, nodeId) {
  let drag = null;
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button,textarea,input,select')) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, drop: null, ghost: null };
    element.setPointerCapture(event.pointerId);
    window.addEventListener('pointerup', finish, { once: true }); window.addEventListener('pointercancel', finish, { once: true });
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag) return; const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < 6) return;
    if (!drag.moved) { drag.moved = true; drag.ghost = makeGhost(findNode(state.map.document, nodeId).node.title); element.classList.add('is-dragging'); }
    drag.ghost.style.transform = `translate(${event.clientX + 14}px,${event.clientY + 14}px)`; element.style.pointerEvents = 'none';
    drag.drop = dropForPoint(event.clientX, event.clientY, nodeId); element.style.pointerEvents = ''; autoPan(event.clientX, event.clientY);
  });
  const finish = (event) => {
    if (!drag) return;
    const moved = drag.moved; const drop = moved && event?.clientX !== undefined ? (dropForPoint(event.clientX, event.clientY, nodeId) || drag.drop) : drag.drop; drag.ghost?.remove(); element.classList.remove('is-dragging'); clearDropState(); drag = null;
    if (moved) { state.suppressClick = true; setTimeout(() => { state.suppressClick = false; }, 0); }
    if (moved && drop && !drop.invalid) execute({ type: 'move', nodeId, parentId: drop.parentId, index: drop.index }, { announceText: drop.mode === 'reorder' ? 'Topic reordered' : 'Topic moved to a new parent' });
  };
  element.addEventListener('pointerup', finish); element.addEventListener('pointercancel', finish);
}

$$('#shape-palette button').forEach((button) => {
  let drag = null;
  button.addEventListener('pointerdown', (event) => { if (!canEdit() || event.button !== 0) return; drag = { x: event.clientX, y: event.clientY, moved: false, ghost: null, drop: null }; button.setPointerCapture(event.pointerId); });
  button.addEventListener('pointermove', (event) => {
    if (!drag) return; if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    if (!drag.moved) { drag.moved = true; drag.ghost = makeGhost(`New ${button.dataset.shape} topic`); }
    drag.ghost.style.transform = `translate(${event.clientX + 14}px,${event.clientY + 14}px)`; drag.drop = dropForPoint(event.clientX, event.clientY); autoPan(event.clientX, event.clientY);
  });
  button.addEventListener('pointerup', () => {
    if (!drag) return; const moved = drag.moved; const drop = drag.drop; drag.ghost?.remove(); clearDropState(); drag = null;
    if (moved) { state.suppressPaletteClick = true; setTimeout(() => { state.suppressPaletteClick = false; }, 0); if (drop && !drop.invalid) addChild(button.dataset.shape, drop.parentId); }
  });
  button.addEventListener('click', () => { if (!state.suppressPaletteClick) addChild(button.dataset.shape); });
});

function setEditorView(view) {
  state.view = view; const canvas = view === 'canvas';
  $('#canvas-panel').classList.toggle('hidden', !canvas);
  $('#table-panel').classList.toggle('hidden', canvas); $('.node-tools').classList.toggle('table-active', !canvas);
  $('#canvas-view-btn').classList.toggle('active', canvas); $('#table-view-btn').classList.toggle('active', !canvas);
  $('#canvas-view-btn').setAttribute('aria-pressed', String(canvas)); $('#table-view-btn').setAttribute('aria-pressed', String(!canvas));
  if (canvas) { renderCanvas(); requestAnimationFrame(() => { if (!state.bounds) return; applyTransform(); }); } else renderTable();
}
$('#canvas-view-btn').addEventListener('click', () => setEditorView('canvas')); $('#table-view-btn').addEventListener('click', () => setEditorView('table'));

function renderTable() {
  if (!state.map) return; const body = $('#relation-body'); body.replaceChildren(); const rows = visibleRows(); const allRows = flattenTree(state.map.document, false);
  rows.forEach(({ node, parent, depth }, rowIndex) => {
    const tr = document.createElement('tr'); tr.dataset.nodeId = node.id; tr.tabIndex = node.id === state.selected ? 0 : -1;
    tr.setAttribute('role', 'row'); tr.setAttribute('aria-level', String(depth + 1)); tr.setAttribute('aria-selected', String(state.selectedIds.has(node.id)));
    if (node.children.length) tr.setAttribute('aria-expanded', String(!node.collapsed));
    tr.addEventListener('click', (event) => { if (!event.target.matches('input,select,button')) selectNode(node.id, false, event.ctrlKey || event.metaKey, event.shiftKey); });
    tr.addEventListener('keydown', (event) => handleTableKey(event, rows, rowIndex));
    const topicCell = document.createElement('td'); topicCell.className = 'topic-cell'; topicCell.style.setProperty('--depth', depth);
    if (node.children.length) {
      const toggle = document.createElement('button'); toggle.className = 'table-branch'; toggle.title = node.collapsed ? 'Expand branch' : 'Collapse branch'; toggle.setAttribute('aria-label', toggle.title); toggle.innerHTML = `<i class="ph ${node.collapsed ? 'ph-caret-right' : 'ph-caret-down'}"></i>`;
      toggle.addEventListener('click', () => toggleCollapse(node.id)); topicCell.append(toggle);
    } else { const indent = document.createElement('span'); indent.className = 'table-indent'; topicCell.append(indent); }
    if (canEdit()) {
      const input = document.createElement('input'); input.value = node.title; input.maxLength = 240; input.setAttribute('aria-label', `Topic: ${node.title}`);
      const save = () => { const title = input.value.trim(); if (title && title !== node.title) execute({ type: 'rename', nodeId: node.id, title }); else if (!title) { input.value = node.title; toast('Topic text cannot be empty'); } };
      input.addEventListener('change', save); input.addEventListener('blur', save); input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } if (event.key === 'Escape') { input.value = node.title; input.blur(); } }); topicCell.append(input);
    } else { const text = document.createElement('span'); text.textContent = node.title; topicCell.append(text); }

    const parentCell = document.createElement('td');
    if (parent && canEdit()) {
      const select = document.createElement('select'); select.setAttribute('aria-label', `Parent for ${node.title}`); const blocked = descendantIds(state.map.document, node.id);
      allRows.filter(({ node: candidate }) => !blocked.has(candidate.id)).forEach(({ node: candidate, depth: candidateDepth }) => {
        const option = document.createElement('option'); option.value = candidate.id; option.textContent = `${'— '.repeat(candidateDepth)}${candidate.title}`; option.selected = candidate.id === parent.id; select.append(option);
      });
      select.addEventListener('change', () => execute({ type: 'move', nodeId: node.id, parentId: select.value }, { announceText: 'Topic moved to a new parent' })); parentCell.append(select);
    } else parentCell.textContent = parent?.title || 'Central topic';

    const shapeCell = document.createElement('td');
    if (canEdit()) {
      const select = document.createElement('select'); select.setAttribute('aria-label', `Shape for ${node.title}`);
      SHAPES.forEach((shape) => { const option = document.createElement('option'); option.value = shape; option.textContent = shape[0].toUpperCase() + shape.slice(1); option.selected = shape === node.shape; select.append(option); });
      select.addEventListener('change', () => execute({ type: 'shape', nodeId: node.id, shape: select.value }, { announceText: 'Topic shape changed' })); shapeCell.append(select);
    } else shapeCell.textContent = node.shape;
    const depthCell = document.createElement('td'); depthCell.textContent = String(depth);
    const childCell = document.createElement('td'); childCell.textContent = String(node.children.length);
    const actionCell = document.createElement('td');
    if (parent && canEdit()) { const remove = document.createElement('button'); remove.className = 'table-delete'; remove.title = `Delete ${node.title}`; remove.setAttribute('aria-label', remove.title); remove.innerHTML = '<i class="ph ph-trash"></i>'; remove.addEventListener('click', () => { setSelection([node.id], node.id, false, false); deleteSelected(); }); actionCell.append(remove); }
    tr.append(topicCell, parentCell, shapeCell, depthCell, childCell, actionCell); body.append(tr);
  });
  $('#relation-table').setAttribute('aria-readonly', String(!canEdit()));
}
function handleTableKey(event, rows, index) {
  if (event.target.matches('input,select,button')) return; let next = null;
  if (event.key === 'ArrowDown') next = rows[index + 1]?.node.id;
  if (event.key === 'ArrowUp') next = rows[index - 1]?.node.id;
  if (event.key === 'Home') next = rows[0]?.node.id;
  if (event.key === 'End') next = rows.at(-1)?.node.id;
  if (event.key === 'ArrowLeft') { const row = rows[index]; if (row.node.children.length && !row.node.collapsed) toggleCollapse(row.node.id); else next = row.parent?.id; }
  if (event.key === 'ArrowRight') { const row = rows[index]; if (row.node.children.length && row.node.collapsed) toggleCollapse(row.node.id); else next = row.node.children[0]?.id; }
  if (next) {
    event.preventDefault(); selectNode(next, false, false, event.shiftKey);
    queueMicrotask(() => $(`#relation-body tr[data-node-id="${next}"]`)?.focus());
  }
}

function queueSave() {
  if (!canEdit()) return; state.dirty = true; clearTimeout(state.saveTimer);
  $('#save-state').textContent = 'Unsaved'; $('#save-state').className = 'save-state saving';
  state.saveTimer = setTimeout(save, 650);
}
async function save() {
  if (!state.dirty || !state.map || state.saving || state.conflict) return;
  state.saving = true; state.dirty = false; const snapshotId = state.map.id; const operationCount = state.pendingOps.length;
  $('#save-state').textContent = 'Saving…';
  try {
    const result = await api(`/api/mindmaps/${snapshotId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: state.map.title, document: state.map.document, version: state.map.version }) });
    if (state.map?.id !== snapshotId) return;
    state.map.version = result.version; state.pendingOps.splice(0, operationCount); $('#save-state').textContent = 'Saved'; $('#save-state').className = 'save-state'; announce('Mind map saved');
  } catch (error) {
    if (error.status === 409 && error.data.mindmap) handleIncomingVersion(error.data.mindmap, 'A collaborator saved a newer version');
    else { state.dirty = true; $('#save-state').textContent = 'Save failed'; $('#save-state').className = 'save-state conflict'; toast(error.message); }
  } finally { state.saving = false; if (state.dirty && !state.conflict) queueSave(); }
}
function handleIncomingVersion(incoming, message) {
  const latest = { ...incoming, document: normalizeDocument(incoming.document) };
  if (!state.dirty && !state.pendingOps.length) {
    state.map = { ...state.map, ...latest }; $('#map-title').value = state.map.title; renderEditor(); $('#save-state').textContent = message; announce(message); return;
  }
  const draft = structuredClone(state.map.document); const draftTitle = state.map.title; const replay = replayOperations(latest.document, state.pendingOps);
  if (!replay.failed) {
    state.map = { ...state.map, ...latest, document: replay.document, title: draftTitle }; state.dirty = true; renderEditor();
    $('#save-state').textContent = 'Rebased local changes'; announce('Local changes were replayed on the latest version'); queueSave();
  } else {
    state.conflict = { latest, draft, draftTitle }; state.dirty = false; $('#conflict-message').textContent = `${message} Your draft is preserved.`;
    $('#conflict-bar').classList.remove('hidden'); $('#save-state').textContent = 'Needs review'; $('#save-state').className = 'save-state conflict'; announce('This map has a conflict that needs review');
  }
}
$('#use-latest-btn').addEventListener('click', () => {
  if (!state.conflict) return; const { latest } = state.conflict; state.map = { ...state.map, ...latest }; state.pendingOps = []; state.history = []; state.redo = []; state.conflict = null;
  $('#map-title').value = state.map.title; $('#conflict-bar').classList.add('hidden'); $('#save-state').textContent = 'Latest version loaded'; updateUndoButtons(); renderEditor(); announce('Latest collaborator version loaded');
});
$('#keep-draft-btn').addEventListener('click', () => {
  if (!state.conflict) return; const { latest, draft, draftTitle } = state.conflict; state.map = { ...state.map, ...latest, document: draft, title: draftTitle }; state.conflict = null; state.dirty = true;
  $('#map-title').value = state.map.title; $('#conflict-bar').classList.add('hidden'); renderEditor(); queueSave(); announce('Your draft will replace the latest map');
});

function connectLive(mapId) {
  disconnectLive(); const scheme = location.protocol === 'https:' ? 'wss' : 'ws'; const ws = new WebSocket(`${scheme}://${location.host}/live?map=${encodeURIComponent(mapId)}`); state.socket = ws;
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'presence') $('#presence-label').textContent = `${message.count} online`;
    if (message.type === 'updated' && message.mindmap.version > state.map.version && message.actor.id !== state.user.id) {
      handleIncomingVersion(message.mindmap, `Updated by ${message.actor.displayName}`); toast(`${message.actor.displayName} updated this map`);
    }
    if (message.type === 'deleted') { toast('This map was deleted'); showDashboard(); }
  });
}
function disconnectLive() { state.socket?.close(); state.socket = null; }

$('#shortcuts-btn').addEventListener('click', () => $('#shortcuts-dialog').showModal()); $('#shortcuts-close').addEventListener('click', () => $('#shortcuts-dialog').close());
window.addEventListener('keydown', (event) => {
  if (!state.map || views.editor.classList.contains('hidden') || event.target.matches('input,textarea,select')) return;
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  if (modifier && event.key.toLowerCase() === 'a') { event.preventDefault(); const ids = visibleRows().map(({ node }) => node.id); setSelection(ids, ids.at(-1)); announce(`${ids.length} visible topics selected`); }
  if (modifier && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); }
  if (modifier && event.key.toLowerCase() === 'x' && canEdit()) { event.preventDefault(); cutSelection(); }
  if (modifier && event.key.toLowerCase() === 'd' && canEdit()) { event.preventDefault(); duplicateSelection(); }
  if (!modifier && !event.altKey && event.key.toLowerCase() === 'v') { event.preventDefault(); setCanvasTool('select'); }
  if (!modifier && !event.altKey && event.key.toLowerCase() === 'h') { event.preventDefault(); setCanvasTool('pan'); }
  if (!event.defaultPrevented && event.key === ' ' && !event.target.closest('button,a')) { event.preventDefault(); toggleCollapse(); }
  if (!event.defaultPrevented && event.key === 'Tab' && event.shiftKey && canEdit()) { event.preventDefault(); promoteSelected(); }
  if (!event.defaultPrevented && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && canEdit()) { event.preventDefault(); reorderSelected(event.key === 'ArrowUp' ? -1 : 1); }
});
window.addEventListener('paste', (event) => {
  if (!state.map || !canEdit() || views.editor.classList.contains('hidden') || event.target.matches('input,textarea,select')) return;
  const text = event.clipboardData?.getData('text/plain'); if (!text) return;
  event.preventDefault(); pasteOutline(text);
});
window.addEventListener('resize', () => { if (state.map && state.view === 'canvas') renderCanvas(); });

$('#share-btn').addEventListener('click', async () => { $('#share-map-name').textContent = state.map.title; $('#share-error').textContent = ''; $('#share-dialog').showModal(); await loadMembers(); });
$('#share-close').addEventListener('click', () => $('#share-dialog').close());
async function loadMembers() {
  const { members } = await api(`/api/mindmaps/${state.map.id}/members`); const list = $('#member-list'); list.replaceChildren();
  members.forEach((member) => {
    const row = document.createElement('div'); row.className = 'member'; const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = initials(member.displayName);
    const info = document.createElement('div'); info.className = 'member-info'; const name = document.createElement('strong'); name.textContent = member.displayName; const email = document.createElement('small'); email.textContent = member.email; info.append(name, email);
    const role = document.createElement('span'); role.className = 'member-role'; role.textContent = member.role; row.append(avatar, info, role);
    if (member.role !== 'owner') { const remove = document.createElement('button'); remove.className = 'remove-member'; remove.title = 'Remove access'; remove.setAttribute('aria-label', `Remove ${member.displayName}`); remove.innerHTML = '<i class="ph ph-x"></i>'; remove.addEventListener('click', async () => { await api(`/api/mindmaps/${state.map.id}/members/${member.id}`, { method: 'DELETE' }); await loadMembers(); }); row.append(remove); }
    list.append(row);
  });
}
$('#share-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#share-error').textContent = ''; const form = event.currentTarget; const body = Object.fromEntries(new FormData(form));
  try { await api(`/api/mindmaps/${state.map.id}/members`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); form.reset(); await loadMembers(); toast('Access updated'); } catch (error) { $('#share-error').textContent = error.message; }
});

window.addEventListener('hashchange', () => { const id = location.hash.match(/^#map\/(.+)$/)?.[1]; if (id && state.user) openMap(id); });
window.addEventListener('beforeunload', (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
bootstrap().then(() => { const id = location.hash.match(/^#map\/(.+)$/)?.[1]; if (id && state.user) openMap(id); });
