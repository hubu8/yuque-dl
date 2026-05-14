const { contextBridge, ipcRenderer } = require('electron')

// 安全的事件监听注册：每次注册前先移除同一频道的旧监听器，避免累积
function safeOn(channel, callback) {
  ipcRenderer.removeAllListeners(channel)
  ipcRenderer.on(channel, (_, data) => callback(data))
}

contextBridge.exposeInMainWorld('yuqueAPI', {
  selectDirectory: (currentDir) => ipcRenderer.invoke('select-directory', currentDir),
  getDefaultDownloadPath: () => ipcRenderer.invoke('get-default-download-path'),
  getDownloadConfig: () => ipcRenderer.invoke('get-download-config'),
  saveDownloadConfig: (config) => ipcRenderer.invoke('save-download-config', config),
  openDirectory: (dir) => ipcRenderer.invoke('open-directory', dir),
  startDownload: (params) => ipcRenderer.invoke('start-download', params),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  checkDocCount: (params) => ipcRenderer.invoke('check-doc-count', params),
  onProgress: (callback) => safeOn('download-progress', callback),
  onLog: (callback) => safeOn('download-log', callback),
  onDocCount: (callback) => safeOn('download-doc-count', callback),
  // 授权相关
  licenseCheck: () => ipcRenderer.invoke('license-check'),
  licenseActivate: (key) => ipcRenderer.invoke('license-activate', key),
  licenseCopyMachineId: () => ipcRenderer.invoke('license-copy-machine-id'),
  licenseClear: () => ipcRenderer.invoke('license-clear'),
  onLicenseExpired: (callback) => safeOn('license-expired', callback),
  // 预览相关
  previewStart: (rootPath) => ipcRenderer.invoke('preview-start', rootPath),
  previewStop: () => ipcRenderer.invoke('preview-stop'),
  previewOpen: (url) => ipcRenderer.invoke('preview-open', url),
  selectPreviewDirectory: () => ipcRenderer.invoke('select-preview-directory'),
  // 转换相关
  selectConvertDirectory: () => ipcRenderer.invoke('select-convert-directory'),
  startConvert: (dirPath, format, concurrency) => ipcRenderer.invoke('start-convert', dirPath, format, concurrency),
  cancelConvert: () => ipcRenderer.invoke('cancel-convert'),
  onConvertProgress: (callback) => safeOn('convert-progress', callback),
  onConvertLog: (callback) => safeOn('convert-log', callback)
})
