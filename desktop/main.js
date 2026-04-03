const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron')
const path = require('path')
const { fork } = require('child_process')
const license = require('./license')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    title: '语雀知识库下载器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.setMenuBarVisibility(false)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 选择目录
ipcMain.handle('select-directory', async (_, currentDir) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: currentDir || app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// 获取默认下载路径
ipcMain.handle('get-default-download-path', () => {
  return path.join(app.getPath('documents'), 'yuque-download')
})

// 打开目录
ipcMain.handle('open-directory', async (_, dirPath) => {
  shell.openPath(dirPath)
})

// 开始下载
let downloadProcess = null

ipcMain.handle('start-download', async (_, params) => {
  if (downloadProcess) {
    downloadProcess.kill()
    downloadProcess = null
  }

  return new Promise((resolve) => {
    downloadProcess = fork(path.join(__dirname, 'worker.js'), [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    })

    downloadProcess.send(params)

    downloadProcess.on('message', (msg) => {
      if (msg.type === 'progress') {
        mainWindow.webContents.send('download-progress', msg.data)
      } else if (msg.type === 'log') {
        mainWindow.webContents.send('download-log', msg.data)
      } else if (msg.type === 'done') {
        resolve({ success: true, path: msg.data })
      } else if (msg.type === 'error') {
        resolve({ success: false, error: msg.data })
      }
    })

    downloadProcess.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    downloadProcess.on('exit', (code) => {
      downloadProcess = null
      if (code !== 0 && code !== null) {
        resolve({ success: false, error: `进程异常退出 (code: ${code})` })
      }
    })
  })
})

ipcMain.handle('cancel-download', async () => {
  if (downloadProcess) {
    downloadProcess.kill()
    downloadProcess = null
    return true
  }
  return false
})

// ============ 授权相关 ============

// 检查激活状态
ipcMain.handle('license-check', async () => {
  return license.checkActivation(app.getPath('userData'))
})

// 激活授权码
ipcMain.handle('license-activate', async (_, licenseKey) => {
  const machineId = license.generateMachineId()
  const valid = license.validateLicense(machineId, licenseKey)
  if (valid) {
    license.saveLicense(app.getPath('userData'), machineId, licenseKey)
    return { success: true }
  }
  return { success: false, error: '授权码无效，请检查后重试' }
})

// 复制机器码到剪贴板
ipcMain.handle('license-copy-machine-id', async () => {
  const machineId = license.generateMachineId()
  clipboard.writeText(machineId)
  return machineId
})

// ============ 预览服务（主进程内运行） ============
const previewServer = require('./preview-server')
let previewPort = null

ipcMain.handle('preview-start', async (_, rootPath) => {
  if (previewPort) {
    return { success: true, port: previewPort }
  }

  try {
    const port = await previewServer.start(rootPath, 18888)
    previewPort = port
    return { success: true, port }
  } catch (err) {
    return { success: false, error: err.message || String(err) }
  }
})

ipcMain.handle('preview-stop', async () => {
  previewServer.stop()
  previewPort = null
  return true
})

ipcMain.handle('preview-open', async (_, url) => {
  shell.openExternal(url)
})

// 选择预览目录
ipcMain.handle('select-preview-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择已下载的知识库目录'
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// 退出时清理预览服务
app.on('before-quit', () => {
  previewServer.stop()
})
