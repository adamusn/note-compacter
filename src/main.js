let currentProjectId = null;
let dirty = false;
let viewing = 'master'; // or 'component'
let currentComponent = null;

function el(id) { return document.getElementById(id); }
function setStatus(msg) { el('status').textContent = msg || ''; }
function setDetails(msg) { el('details').textContent = msg || ''; }
function showDirty(flag) {
  dirty = !!flag;
  el('dirtyFlag').classList.toggle('hidden', !dirty);
}
function activate(btnId) {
  el('viewMaster').classList.toggle('active', btnId === 'viewMaster');
  el('viewComponent').classList.toggle('active', btnId === 'viewComponent');
}

function getProjectName() {
  return new Promise(resolve => {
    const modal = el('nameModal');
    const input = el('nameInput');
    const btnOk = el('nameOk');
    const btnCancel = el('nameCancel');

    function cleanup(val) {
      modal.classList.add('hidden');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      window.removeEventListener('keydown', onKey);
      resolve(val);
    }
    function onOk() { cleanup(input.value.trim() || 'Untitled Project'); }
    function onCancel() { cleanup(null); }
    function onKey(e) { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); }

    input.value = '';
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 0);
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    window.addEventListener('keydown', onKey);
  });
}

async function maybeAutoSave() {
  if (!dirty || !currentProjectId) return true;
  await window.noteCompacter.saveMaster(currentProjectId, el('master').value);
  showDirty(false);
  setStatus('Auto-saved changes.');
  return true;
}

async function refreshProjects(selectId) {
  const list = el('projectList');
  list.innerHTML = '';
  const projects = await window.noteCompacter.listProjects();
  projects.forEach(p => {
    const div = document.createElement('div');
    div.className = 'proj' + (p.id === currentProjectId ? ' active' : '');
    div.textContent = p.name;
    div.onclick = async () => {
      await maybeAutoSave();
      currentProjectId = p.id;
      await loadMaster();
      await refreshProjects();
      await refreshComponents();
    };
    list.appendChild(div);
  });
  if (selectId) {
    const found = projects.find(p => p.id === selectId);
    if (found) {
      currentProjectId = found.id;
      await loadMaster();
      await refreshProjects();
      await refreshComponents();
    }
  }
  if (!projects.length) {
    currentProjectId = null;
    el('projectTitle').textContent = 'No project selected';
    el('master').value = '';
    el('componentList').innerHTML = '';
    el('componentView').textContent = '';
    el('viewComponent').disabled = true;
    activate('viewMaster');
    viewing = 'master';
  }
}

async function refreshComponents() {
  if (!currentProjectId) { el('componentList').innerHTML = ''; return; }
  const comps = await window.noteCompacter.listComponents(currentProjectId);
  const list = el('componentList');
  list.innerHTML = '';
  comps.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comp' + (currentComponent && currentComponent.internalName === c.internalName ? ' active' : '');
    div.textContent = `${c.originalName} · ${c.internalName}`;
    div.title = c.addedAt ? `Added: ${c.addedAt}` : '';
    div.onclick = async () => {
      await maybeAutoSave();
      const data = await window.noteCompacter.readComponent(currentProjectId, c.internalName);
      currentComponent = data;
      el('componentLabel').textContent = `Viewing: ${data.originalName} (${data.internalName})`;
      el('componentView').textContent = data.text || '';
      el('viewComponent').disabled = false;
      switchToComponent();
      await refreshComponents(); // update selection highlight
    };
    list.appendChild(div);
  });
}

async function loadMaster() {
  if (!currentProjectId) return;
  const m = await window.noteCompacter.readMaster(currentProjectId);
  el('projectTitle').textContent = m.name || '(unnamed project)';
  el('master').value = m.text || '';
  showDirty(false);
  switchToMaster();
}

function switchToMaster() {
  viewing = 'master';
  el('master').classList.remove('hidden');
  el('componentView').classList.add('hidden');
  el('componentLabel').textContent = '';
  activate('viewMaster');
}

function switchToComponent() {
  viewing = 'component';
  el('master').classList.add('hidden');
  el('componentView').classList.remove('hidden');
  activate('viewComponent');
}

async function onCreate() {
  const name = await getProjectName();
  if (name === null) return;
  const { id } = await window.noteCompacter.createProject(name);
  await refreshProjects(id);
  setStatus('Project created.');
}

async function onDelete() {
  if (!currentProjectId) return;
  await maybeAutoSave();
  const ok = confirm('Delete this project from internal storage? This does not touch your original source files.');
  if (!ok) return;
  await window.noteCompacter.deleteProject(currentProjectId);
  currentProjectId = null;
  await refreshProjects();
  setStatus('Project deleted.');
}

async function onSave() {
  if (!currentProjectId) { setStatus('No project selected.'); return; }
  await window.noteCompacter.saveMaster(currentProjectId, el('master').value);
  showDirty(false);
  setStatus('Master saved.');
}

async function onIngest() {
  if (!currentProjectId) { setStatus('No project selected.'); return; }
  await maybeAutoSave();
  const res = await window.noteCompacter.ingestFiles(currentProjectId);
  if (res && res.copied) {
    await loadMaster();
    await refreshComponents();
    setStatus(`Ingest complete. Copied ${res.copied} file(s).`);
  } else {
    setStatus('Ingest canceled.');
  }
}

async function onExport() {
  if (!currentProjectId) { setStatus('No project selected.'); return; }
  await maybeAutoSave();
  const res = await window.noteCompacter.exportMaster(currentProjectId);
  if (res && res.saved) setStatus(`Exported to: ${res.path}`);
  else setStatus('Export canceled.');
}

async function onRebuild() {
  if (!currentProjectId) { setStatus('No project selected.'); return; }
  await maybeAutoSave();
  const res = await window.noteCompacter.rebuildMaster(currentProjectId);
  await loadMaster();
  setStatus(`Rebuilt master from ${res.built} component(s).`);
}

async function boot() {
  if (window.__nc_preload && window.__nc_preload.ok === false) {
    setStatus('Preload failed.');
    setDetails(window.__nc_preload.error || '');
    return;
  }
  const ok = await waitForBridge();
  if (!ok) {
    setStatus('Bridge failed to initialize.');
    setDetails('noteCompacter API not found.');
    return;
  }
  await refreshProjects();
  setStatus('Ready.');
}

async function waitForBridge(ms = 30, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (window.noteCompacter && window.noteCompacter.listProjects) return true;
    await new Promise(r => setTimeout(r, ms));
  }
  return false;
}

// UX hooks
window.addEventListener('DOMContentLoaded', () => {
  el('btnCreate').onclick = onCreate;
  el('btnDelete').onclick = onDelete;
  el('btnSave').onclick = onSave;
  el('btnIngest').onclick = onIngest;
  el('btnExport').onclick = onExport;
  el('btnRebuild').onclick = onRebuild;
  el('viewMaster').onclick = () => switchToMaster();
  el('viewComponent').onclick = () => currentComponent ? switchToComponent() : null;

  el('master').addEventListener('input', () => showDirty(true));

  // Ctrl+S to save
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onSave();
    }
  });

  boot();
});
