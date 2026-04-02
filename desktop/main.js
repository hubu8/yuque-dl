const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { fork } = require('child_process')

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
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
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
