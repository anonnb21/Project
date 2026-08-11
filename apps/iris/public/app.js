const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const views = { auth: $('#auth-view'), dashboard: $('#dashboard-view'), editor: $('#editor-view') };
const state = { user: null, maps: [], map: null, register: false, selected: null, scale: 1, panX: 0, panY: 0, socket: null, saveTimer: null, dirty: false };
const svgNS = 'http://www.w3.org/2000/svg';

function showView(name) {
  Object.entries(views).forEach(([key, value]) => value.classList.toggle('hidden', key !== name));
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}
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

async function bootstrap() {
  try {
    state.user = (await api('/api/auth/me')).user;
    await showDashboard();
  } catch { showAuth(); }
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
  const payload = Object.fromEntries(new FormData(form));
  try {
    const data = await api(`/api/auth/${state.register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    state.user = data.user; form.reset(); await showDashboard();
  } catch (error) { $('#auth-error').textContent = error.message; }
});
$('#logout-btn').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; location.hash = ''; showAuth(); });

async function showDashboard() {
  disconnectLive(); showView('dashboard');
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
  event.preventDefault(); const form = event.currentTarget;
  const title = new FormData(form).get('title');
  try { const { mindmap } = await api('/api/mindmaps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }); $('#new-map-dialog').close(); form.reset(); await openMap(mindmap.id); } catch (error) { toast(error.message); }
});
$('#import-input').addEventListener('change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const { mindmap } = await api('/api/mindmaps/import', { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: await file.text() });
    await openMap(mindmap.id); toast('OPML imported');
  } catch (error) { toast(error.message); } finally { event.target.value = ''; }
});

async function openMap(id) {
  try {
    state.map = (await api(`/api/mindmaps/${id}`)).mindmap; state.selected = state.map.document.id; state.scale = 1; state.dirty = false;
    $('#map-title').value = state.map.title; $('#map-title').disabled = state.map.role === 'viewer';
    const readOnly = state.map.role === 'viewer'; $('#read-only').classList.toggle('hidden', !readOnly);
    $('#add-child-btn').disabled = readOnly; $('#add-sibling-btn').disabled = readOnly; $('#delete-node-btn').disabled = readOnly;
    $('#share-btn').classList.toggle('hidden', state.map.role !== 'owner');
    $('#save-state').textContent = readOnly ? 'View only' : 'Saved';
    showView('editor'); fitView(); renderMindmap(); connectLive(id); history.replaceState(null, '', `#map/${id}`);
  } catch (error) { toast(error.message); await showDashboard(); }
}
$('#back-btn').addEventListener('click', () => { history.replaceState(null, '', location.pathname); showDashboard(); });
$('#map-title').addEventListener('input', () => { state.map.title = $('#map-title').value; queueSave(); });
$('#export-btn').addEventListener('click', () => { location.href = `/api/mindmaps/${state.map.id}/export.opml`; });

function walk(node, fn, parent = null, depth = 0) { fn(node, parent, depth); node.children.forEach((child) => walk(child, fn, node, depth + 1)); }
function findNode(id) { let result; walk(state.map.document, (node, parent) => { if (node.id === id) result = { node, parent }; }); return result; }
function id() { return crypto.randomUUID(); }
function addChild() {
  if (!canEdit()) return; const target = findNode(state.selected)?.node; if (!target) return;
  const node = { id: id(), title: 'New idea', children: [] }; target.children.push(node); state.selected = node.id; changed(); setTimeout(() => renameNode(node), 50);
}
function addSibling() {
  if (!canEdit()) return; const found = findNode(state.selected); if (!found) return;
  if (!found.parent) return addChild();
  const node = { id: id(), title: 'New idea', children: [] }; const index = found.parent.children.indexOf(found.node); found.parent.children.splice(index + 1, 0, node); state.selected = node.id; changed(); setTimeout(() => renameNode(node), 50);
}
function deleteNode() {
  if (!canEdit()) return; const found = findNode(state.selected); if (!found?.parent) return toast('The central topic cannot be deleted');
  found.parent.children = found.parent.children.filter((node) => node.id !== found.node.id); state.selected = found.parent.id; changed();
}
function renameNode(node) {
  if (!canEdit()) return; const title = prompt('Node title', node.title); if (title?.trim()) { node.title = title.trim().slice(0, 240); changed(); }
}
function canEdit() { return state.map && ['owner', 'editor'].includes(state.map.role); }
function changed() { state.dirty = true; renderMindmap(); queueSave(); }
$('#add-child-btn').addEventListener('click', addChild); $('#add-sibling-btn').addEventListener('click', addSibling); $('#delete-node-btn').addEventListener('click', deleteNode);
$('#canvas').addEventListener('keydown', (event) => {
  if (event.target !== $('#canvas')) return;
  if (event.key === 'Tab') { event.preventDefault(); addChild(); }
  if (event.key === 'Enter') { event.preventDefault(); addSibling(); }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteNode(); }
});

function layoutTree() {
  const positions = new Map(); let cursor = 0;
  function visit(node, depth) {
    if (!node.children.length) { const y = cursor * 80; cursor += 1; positions.set(node.id, { x: depth * 230, y }); return y; }
    const ys = node.children.map((child) => visit(child, depth + 1)); const y = (ys[0] + ys.at(-1)) / 2; positions.set(node.id, { x: depth * 230, y }); return y;
  }
  visit(state.map.document, 0); return positions;
}
function renderMindmap() {
  if (!state.map) return; const nodes = $('#nodes'), edges = $('#edges'); nodes.replaceChildren(); edges.replaceChildren();
  const positions = layoutTree();
  walk(state.map.document, (node, parent, depth) => {
    const pos = positions.get(node.id); const width = Math.max(depth ? 120 : 150, Math.min(220, node.title.length * 7.5 + 32)); const height = depth ? 42 : 50;
    if (parent) {
      const from = positions.get(parent.id); const path = document.createElementNS(svgNS, 'path'); path.setAttribute('class', 'edge');
      path.setAttribute('d', `M ${from.x + 170} ${from.y} C ${from.x + 200} ${from.y}, ${pos.x - 40} ${pos.y}, ${pos.x} ${pos.y}`); edges.append(path);
    }
    const group = document.createElementNS(svgNS, 'g'); group.setAttribute('class', `node${depth === 0 ? ' root' : ''}${node.id === state.selected ? ' selected' : ''}`); group.setAttribute('transform', `translate(${pos.x},${pos.y - height / 2})`); group.style.cursor = canEdit() ? 'pointer' : 'default';
    const rect = document.createElementNS(svgNS, 'rect'); rect.setAttribute('width', width); rect.setAttribute('height', height); rect.setAttribute('rx', depth ? 9 : 13);
    const text = document.createElementNS(svgNS, 'text'); text.setAttribute('x', 16); text.setAttribute('y', height / 2 + 5); text.textContent = node.title.length > 27 ? `${node.title.slice(0, 26)}…` : node.title;
    group.append(rect, text); group.addEventListener('click', (event) => { event.stopPropagation(); state.selected = node.id; renderMindmap(); }); group.addEventListener('dblclick', () => renameNode(node)); nodes.append(group);
  });
  applyTransform();
}
function applyTransform() { $('#viewport').setAttribute('transform', `translate(${state.panX},${state.panY}) scale(${state.scale})`); }
function fitView() { state.scale = 1; state.panX = 130; state.panY = Math.max(130, ($('#canvas').clientHeight || 700) / 2); applyTransform(); }
function zoom(amount) { state.scale = Math.max(.35, Math.min(2, state.scale + amount)); applyTransform(); }
$('#zoom-in-btn').addEventListener('click', () => zoom(.15)); $('#zoom-out-btn').addEventListener('click', () => zoom(-.15)); $('#fit-btn').addEventListener('click', fitView);
$('#canvas').addEventListener('wheel', (event) => { event.preventDefault(); zoom(event.deltaY < 0 ? .1 : -.1); }, { passive: false });
let drag;
$('#canvas').addEventListener('pointerdown', (event) => { if (event.target.closest('.node')) return; drag = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY }; $('#canvas').classList.add('dragging'); $('#canvas').setPointerCapture(event.pointerId); });
$('#canvas').addEventListener('pointermove', (event) => { if (!drag) return; state.panX = drag.panX + event.clientX - drag.x; state.panY = drag.panY + event.clientY - drag.y; applyTransform(); });
$('#canvas').addEventListener('pointerup', () => { drag = null; $('#canvas').classList.remove('dragging'); });

function queueSave() {
  if (!canEdit()) return; state.dirty = true; clearTimeout(state.saveTimer); $('#save-state').textContent = 'Unsaved'; $('#save-state').className = 'save-state saving'; state.saveTimer = setTimeout(save, 550);
}
async function save() {
  if (!state.dirty || !state.map) return; const snapshotId = state.map.id; state.dirty = false; $('#save-state').textContent = 'Saving…';
  try {
    const result = await api(`/api/mindmaps/${snapshotId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: state.map.title, document: state.map.document, version: state.map.version }) });
    if (state.map?.id !== snapshotId) return; state.map.version = result.version; $('#save-state').textContent = 'Saved'; $('#save-state').className = 'save-state';
  } catch (error) {
    if (error.status === 409 && error.data.mindmap) {
      state.map = { ...state.map, ...error.data.mindmap }; $('#map-title').value = state.map.title; renderMindmap(); $('#save-state').textContent = 'Updated from collaborator'; $('#save-state').className = 'save-state conflict'; toast('A newer team version was loaded');
    } else { state.dirty = true; $('#save-state').textContent = 'Save failed'; $('#save-state').className = 'save-state conflict'; toast(error.message); }
  }
}
function connectLive(mapId) {
  disconnectLive(); const scheme = location.protocol === 'https:' ? 'wss' : 'ws'; const ws = new WebSocket(`${scheme}://${location.host}/live?map=${encodeURIComponent(mapId)}`); state.socket = ws;
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'presence') { $('#presence-label').textContent = `${message.count} online`; }
    if (message.type === 'updated' && message.mindmap.version > state.map.version) {
      if (message.actor.id === state.user.id) return;
      state.map = { ...state.map, ...message.mindmap }; $('#map-title').value = state.map.title; renderMindmap(); $('#save-state').textContent = `Updated by ${message.actor.displayName}`; toast(`${message.actor.displayName} updated this map`);
    }
    if (message.type === 'deleted') { toast('This map was deleted'); showDashboard(); }
  });
}
function disconnectLive() { state.socket?.close(); state.socket = null; }

$('#share-btn').addEventListener('click', async () => { $('#share-map-name').textContent = state.map.title; $('#share-error').textContent = ''; $('#share-dialog').showModal(); await loadMembers(); });
$('#share-close').addEventListener('click', () => $('#share-dialog').close());
async function loadMembers() {
  const { members } = await api(`/api/mindmaps/${state.map.id}/members`); const list = $('#member-list'); list.replaceChildren();
  members.forEach((member) => {
    const row = document.createElement('div'); row.className = 'member'; const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = initials(member.displayName);
    const info = document.createElement('div'); info.className = 'member-info'; const name = document.createElement('strong'); name.textContent = member.displayName; const email = document.createElement('small'); email.textContent = member.email; info.append(name, email);
    const role = document.createElement('span'); role.className = 'member-role'; role.textContent = member.role;
    row.append(avatar, info, role);
    if (member.role !== 'owner') { const remove = document.createElement('button'); remove.className = 'remove-member'; remove.title = 'Remove access'; remove.setAttribute('aria-label', `Remove ${member.displayName}`); const removeIcon = document.createElement('i'); removeIcon.className = 'ph ph-x'; remove.append(removeIcon); remove.addEventListener('click', async () => { await api(`/api/mindmaps/${state.map.id}/members/${member.id}`, { method: 'DELETE' }); await loadMembers(); }); row.append(remove); }
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
