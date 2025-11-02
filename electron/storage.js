import { app, dialog } from 'electron';
import { promises as fsp } from 'fs';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import crypto from 'crypto';

function appRoot() {
  const base = app.getPath('userData');
  return base;
}

function projectsRoot() {
  return join(appRoot(), 'projects');
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

async function readJson(path, fallback) {
  try {
    const buf = await fsp.readFile(path, 'utf-8');
    return JSON.parse(buf);
  } catch {
    return fallback;
  }
}

async function writeJson(path, obj) {
  const txt = JSON.stringify(obj, null, 2);
  await fsp.writeFile(path, txt, 'utf-8');
}

function projectDir(projectId) {
  return join(projectsRoot(), projectId);
}
function componentsDir(projectId) {
  return join(projectDir(projectId), 'components');
}
function masterPathFor(projectId) {
  return join(projectDir(projectId), 'master.txt');
}

export async function listProjects() {
  await ensureDir(projectsRoot());
  const names = await fsp.readdir(projectsRoot(), { withFileTypes: true });
  const results = [];
  for (const d of names) {
    if (!d.isDirectory()) continue;
    const id = d.name;
    const meta = await readJson(join(projectsRoot(), id, 'project.json'), { id, name: '(unnamed)' });
    results.push({ id: meta.id || id, name: meta.name || '(unnamed)' });
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

export async function createProject(name) {
  await ensureDir(projectsRoot());
  const id = newId();
  const pdir = projectDir(id);
  const cdir = componentsDir(id);
  await ensureDir(cdir);
  await writeJson(join(pdir, 'project.json'), {
    id,
    name: name && name.trim() ? name.trim() : `Project ${id}`,
    createdAt: new Date().toISOString()
  });
  if (!existsSync(masterPathFor(id))) {
    await fsp.writeFile(masterPathFor(id), '', 'utf-8');
  }
  await writeJson(join(pdir, 'ui.json'), {});
  return { id };
}

export async function readMaster(projectId) {
  const txt = existsSync(masterPathFor(projectId)) ? await fsp.readFile(masterPathFor(projectId), 'utf-8') : '';
  const meta = await readJson(join(projectDir(projectId), 'project.json'), { id: projectId, name: '(unnamed)' });
  return { name: meta.name, text: txt };
}

export async function saveMaster(projectId, text) {
  await fsp.writeFile(masterPathFor(projectId), text ?? '', 'utf-8');
  return true;
}

/* ---------- Stage 3: Components metadata & listing ---------- */
// Each ingested file gets:
//   components/<internalId>.txt
//   components/<internalId>.meta.json  -> { originalName, addedAt }
function metaPath(projectId, internalName) {
  return join(componentsDir(projectId), `${internalName}.meta.json`);
}

export async function listComponents(projectId) {
  await ensureDir(componentsDir(projectId));
  const entries = await fsp.readdir(componentsDir(projectId), { withFileTypes: true });
  const items = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.txt')) continue;
    const internalName = e.name; // e.g., 1730415600_abcd1234.txt
    const meta = await readJson(metaPath(projectId, internalName.replace('.txt', '')), null);
    items.push({
      internalName,
      originalName: meta?.originalName || '(unknown)',
      addedAt: meta?.addedAt || null
    });
  }
  // newest first
  items.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  return items;
}

export async function readComponent(projectId, internalName) {
  const full = join(componentsDir(projectId), internalName);
  const data = await fsp.readFile(full, 'utf-8');
  const meta = await readJson(metaPath(projectId, internalName.replace('.txt', '')), null);
  return { internalName, originalName: meta?.originalName || '(unknown)', addedAt: meta?.addedAt || null, text: data };
}
/* ------------------------------------------------------------ */

function bannerFor(internalName, originalName, addedAt) {
  // Three-line header + footer for readability
  const when = addedAt || new Date().toISOString();
  return {
    open:
`=== COMPONENT START ===
Original: ${originalName}
Internal: ${internalName} | Added: ${when}
`,
    close:
`\n=== COMPONENT END (${internalName}) ===\n`
  };
}

export async function ingestFiles(projectId, browserWindow) {
  const pdir = projectDir(projectId);
  const cdir = componentsDir(projectId);
  await ensureDir(cdir);

  const res = await dialog.showOpenDialog(browserWindow, {
    title: 'Select text files to ingest',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Text', extensions: ['txt'] }]
  });
  if (res.canceled || !res.filePaths.length) return { copied: 0, appendedBytes: 0 };

  let master = existsSync(masterPathFor(projectId)) ? await fsp.readFile(masterPathFor(projectId), 'utf-8') : '';
  let copied = 0;
  let appendedBytes = 0;

  for (const full of res.filePaths) {
    const data = await fsp.readFile(full, 'utf-8');
    const stamp = Date.now();
    const internalBase = `${stamp}_${newId()}.txt`;
    const dest = join(cdir, internalBase);
    await fsp.writeFile(dest, data, 'utf-8');
    copied += 1;

    const originalName = basename(full);
    const addedAt = new Date().toISOString();
    await writeJson(metaPath(projectId, internalBase.replace('.txt', '')), { originalName, addedAt });

    const { open, close } = bannerFor(internalBase, originalName, addedAt);
    const section = `${open}${data}${close}`;
    master += (master.endsWith('\n') ? '' : '\n') + section;
    appendedBytes += section.length;
  }

  await fsp.writeFile(masterPathFor(projectId), master, 'utf-8');
  return { copied, appendedBytes };
}

export async function exportMaster(projectId, browserWindow) {
  const contents = existsSync(masterPathFor(projectId)) ? await fsp.readFile(masterPathFor(projectId), 'utf-8') : '';
  const res = await dialog.showSaveDialog(browserWindow, {
    title: 'Export master as .txt',
    defaultPath: 'master.txt',
    filters: [{ name: 'Text', extensions: ['txt'] }]
  });
  if (res.canceled || !res.filePath) return { saved: false };
  await fsp.writeFile(res.filePath, contents, 'utf-8');
  return { saved: true, path: res.filePath };
}

export async function deleteProject(projectId) {
  await fsp.rm(projectDir(projectId), { recursive: true, force: true });
  return true;
}

/* ---------- Stage 3: Rebuild master from components ---------- */
export async function rebuildMaster(projectId) {
  await ensureDir(componentsDir(projectId));
  const comps = await listComponents(projectId);
  let master = '';
  for (const c of comps.reverse()) { // oldest first when rebuilding
    const full = join(componentsDir(projectId), c.internalName);
    const data = await fsp.readFile(full, 'utf-8');
    const { open, close } = bannerFor(c.internalName, c.originalName, c.addedAt);
    const section = `${open}${data}${close}`;
    master += (master.endsWith('\n') ? '' : '\n') + section;
  }
  await fsp.writeFile(masterPathFor(projectId), master, 'utf-8');
  return { built: comps.length, bytes: master.length };
}
