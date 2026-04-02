const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('yuqueAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openDirectory: (dir) => ipcRenderer.invoke('open-directory', dir),
  startDownload: (params) => ipcRenderer.invoke('start-download', params),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  onProgress: (callback) => {
    ipcRenderer.on('download-progress', (_, data) => callback(data))
  },
  onLog: (callback) => {
    ipcRenderer.on('download-log', (_, data) => callback(data))
  }
})
