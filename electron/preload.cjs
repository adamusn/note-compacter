try {
  const { contextBridge, ipcRenderer } = require('electron');

  contextBridge.exposeInMainWorld('__nc_preload', { ok: true, error: null });

  contextBridge.exposeInMainWorld('noteCompacter', {
    getStorageInfo: async () => await ipcRenderer.invoke('nc:getStorageInfo'),

    listProjects: async () => await ipcRenderer.invoke('nc:listProjects'),
    createProject: async (name) => await ipcRenderer.invoke('nc:createProject', name),
    readMaster: async (projectId) => await ipcRenderer.invoke('nc:readMaster', projectId),
    saveMaster: async (projectId, text) => await ipcRenderer.invoke('nc:saveMaster', projectId, text),
    ingestFiles: async (projectId) => await ipcRenderer.invoke('nc:ingestFiles', projectId),
    exportMaster: async (projectId) => await ipcRenderer.invoke('nc:exportMaster', projectId),
    deleteProject: async (projectId) => await ipcRenderer.invoke('nc:deleteProject', projectId),

    // Stage 3 additions
    listComponents: async (projectId) => await ipcRenderer.invoke('nc:listComponents', projectId),
    readComponent: async (projectId, internalName) => await ipcRenderer.invoke('nc:readComponent', projectId, internalName),
    rebuildMaster: async (projectId) => await ipcRenderer.invoke('nc:rebuildMaster', projectId)
  });
} catch (e) {
  try {
    const { contextBridge } = require('electron');
    contextBridge.exposeInMainWorld('__nc_preload', { ok: false, error: String(e) });
  } catch {}
}
