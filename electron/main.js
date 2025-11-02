import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import {
  listProjects, createProject, readMaster, saveMaster,
  ingestFiles, exportMaster, deleteProject,
  listComponents, readComponent, rebuildMaster
} from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.setName('Note Compacter');

function ensureStageStorage() {
  const userData = app.getPath('userData');
  const dataDir = join(userData, 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const markerPath = join(userData, 'stage1.marker.json');
  if (!existsSync(markerPath)) {
    const payload = { createdAt: new Date().toISOString(), note: 'Stage 1 marker' };
    writeFileSync(markerPath, JSON.stringify(payload, null, 2), 'utf-8');
  }
}

ipcMain.handle('nc:getStorageInfo', () => {
  try {
    const userData = app.getPath('userData');
    const dataDir = join(userData, 'data');
    const markerPath = join(userData, 'stage1.marker.json');
    let marker = {};
    try { marker = JSON.parse(readFileSync(markerPath, 'utf-8')); } catch { marker = {}; }
    return { ok: true, info: { userData, dataDir, markerName: 'stage1.marker.json' }, marker };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Stage 2 + 3 IPC
ipcMain.handle('nc:listProjects', async () => await listProjects());
ipcMain.handle('nc:createProject', async (_e, name) => await createProject(name));
ipcMain.handle('nc:readMaster', async (_e, pid) => await readMaster(pid));
ipcMain.handle('nc:saveMaster', async (_e, pid, text) => await saveMaster(pid, text));
ipcMain.handle('nc:ingestFiles', async (e, pid) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  return await ingestFiles(pid, win);
});
ipcMain.handle('nc:exportMaster', async (e, pid) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  return await exportMaster(pid, win);
});
ipcMain.handle('nc:deleteProject', async (_e, pid) => await deleteProject(pid));

// Stage 3 additions
ipcMain.handle('nc:listComponents', async (_e, pid) => await listComponents(pid));
ipcMain.handle('nc:readComponent', async (_e, pid, internal) => await readComponent(pid, internal));
ipcMain.handle('nc:rebuildMaster', async (_e, pid) => await rebuildMaster(pid));

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: join(__dirname, 'preload.cjs')
    }
  });
  win.loadURL('http://localhost:5174/');
}

app.whenReady().then(() => {
  ensureStageStorage();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
