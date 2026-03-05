const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  download: (url, options) => ipcRenderer.invoke('download', url, options),
  server: (serverPath, options) => ipcRenderer.invoke('server', serverPath, options)
});