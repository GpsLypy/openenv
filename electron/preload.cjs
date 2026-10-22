const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('openenv', {
  scan: () => ipcRenderer.invoke('inventory:scan'),
  cached: () => ipcRenderer.invoke('inventory:cached'),
  settings: () => ipcRenderer.invoke('settings:get'),
  setStartup: enabled => ipcRenderer.invoke('settings:startup', enabled),
  setCloseToTray: enabled => ipcRenderer.invoke('settings:close-to-tray', enabled),
  reveal: file => ipcRenderer.invoke('file:reveal', file),
  copy: text => ipcRenderer.invoke('text:copy', text),
  exportReport: () => ipcRenderer.invoke('inventory:export'),
  onProgress: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('inventory:progress', listener);
    return () => ipcRenderer.removeListener('inventory:progress', listener);
  },
  onInventory: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('inventory:updated', listener);
    return () => ipcRenderer.removeListener('inventory:updated', listener);
  }
});
