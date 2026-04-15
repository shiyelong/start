// =============================================================================
// Electron Preload Script — exposes safe IPC bridge to renderer
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron';

// Mark the window as running in Electron for platform detection
contextBridge.exposeInMainWorld('__ELECTRON__', true);

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  fullscreen: () => ipcRenderer.invoke('window:fullscreen'),

  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),

  // Media control events from main process (tray / global shortcuts)
  onMediaToggle: (callback: () => void) => {
    ipcRenderer.on('media-toggle', callback);
    return () => ipcRenderer.removeListener('media-toggle', callback);
  },
  onMediaNext: (callback: () => void) => {
    ipcRenderer.on('media-next', callback);
    return () => ipcRenderer.removeListener('media-next', callback);
  },
  onMediaPrev: (callback: () => void) => {
    ipcRenderer.on('media-prev', callback);
    return () => ipcRenderer.removeListener('media-prev', callback);
  },
});
