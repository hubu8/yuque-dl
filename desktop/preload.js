const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('yuqueAPI', {
  selectDirectory: (currentDir) => ipcRenderer.invoke('select-directory', currentDir),
  getDefaultDownloadPath: () => ipcRenderer.invoke('get-default-download-path'),
  openDirectory: (dir) => ipcRenderer.invoke('open-directory', dir),
  startDownload: (params) => ipcRenderer.invoke('start-download', params),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  onProgress: (callback) => {
    ipcRenderer.on('download-progress', (_, data) => callback(data))
  },
  onLog: (callback) => {
    ipcRenderer.on('download-log', (_, data) => callback(data))
  },
  // 授权相关
  licenseCheck: () => ipcRenderer.invoke('license-check'),
  licenseActivate: (key) => ipcRenderer.invoke('license-activate', key),
  licenseCopyMachineId: () => ipcRenderer.invoke('license-copy-machine-id'),
  // 预览相关
  previewStart: (rootPath) => ipcRenderer.invoke('preview-start', rootPath),
  previewStop: () => ipcRenderer.invoke('preview-stop'),
  previewOpen: (url) => ipcRenderer.invoke('preview-open', url),
  selectPreviewDirectory: () => ipcRenderer.invoke('select-preview-directory'),
  // 转换相关
  selectConvertDirectory: () => ipcRenderer.invoke('select-convert-directory'),
  startConvert: (dirPath, format, concurrency) => ipcRenderer.invoke('start-convert', dirPath, format, concurrency),
  cancelConvert: () => ipcRenderer.invoke('cancel-convert'),
  onConvertProgress: (callback) => {
    ipcRenderer.on('convert-progress', (_, data) => callback(data))
  },
  onConvertLog: (callback) => {
    ipcRenderer.on('convert-log', (_, data) => callback(data))
  }
})
