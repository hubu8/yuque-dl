import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';
import { getMachineId, verifyLicenseCode, saveLicenseCode, isLicensed, getLicenseInfo } from './license.js';

const require = createRequire(import.meta.url);

let vitepressServer = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 获取默认下载目录（安装目录下的download文件夹）
function getDefaultDownloadDir() {
  return path.join(process.resourcesPath, '..', 'download');
}

// 确保下载目录存在
function ensureDownloadDir() {
  const downloadDir = getDefaultDownloadDir();
  if (!fs.existsSync(downloadDir)) {
    try {
      fs.mkdirSync(downloadDir, { recursive: true });
      console.log('创建下载目录:', downloadDir);
    } catch (error) {
      console.error('创建下载目录失败:', error);
    }
  }
  return downloadDir;
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function createLicenseWindow() {
  const licenseWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: false
  });

  licenseWindow.loadFile(path.join(__dirname, 'license.html'));
  return licenseWindow;
}

app.whenReady().then(() => {
  // 确保下载目录存在
  ensureDownloadDir();
  
  // 检查是否已授权
  if (isLicensed()) {
    createMainWindow();
  } else {
    createLicenseWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isLicensed()) {
        createMainWindow();
      } else {
        createLicenseWindow();
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 处理授权相关请求
ipcMain.handle('getMachineId', () => {
  return getMachineId();
});

ipcMain.handle('verifyLicense', (event, licenseCode) => {
  const result = verifyLicenseCode(licenseCode);
  if (result.valid) {
    saveLicenseCode(licenseCode);
  }
  return result;
});

ipcMain.handle('getLicenseInfo', () => {
  return getLicenseInfo();
});

ipcMain.handle('openMainWindow', () => {
  createMainWindow();
  // 关闭授权窗口
  const licenseWindow = BrowserWindow.getAllWindows().find(w => {
    const title = w.getTitle();
    return title.includes('授权') || title.includes('License');
  });
  if (licenseWindow) {
    licenseWindow.close();
  }
});

// 获取dist目录路径（打包后在asar外部）
function getDistPath() {
  // 在开发环境，__dirname指向electron目录
  // 在生产环境（打包后），resourcesPath指向app.asar所在目录
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'dist', 'es');
  }
  return path.join(__dirname, '../dist/es');
}

// 确保模块路径正确
if (app.isPackaged) {
  // 在生产环境，将app/node_modules添加到模块搜索路径
  const nodeModulesPath = path.join(process.resourcesPath, 'app', 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    process.env.NODE_PATH = nodeModulesPath;
    require('module').Module._initPaths();
  }
}

// 处理下载请求
ipcMain.handle('download', async (event, url, options) => {
  try {
    const { main } = require(path.join(getDistPath(), 'index.js'));
    await main(url, options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理服务器启动请求
ipcMain.handle('server', async (event, serverPath, options) => {
  try {
    const { runServer } = require(path.join(getDistPath(), 'server.js'));
    await runServer(serverPath, options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理停止服务器请求
ipcMain.handle('stopServer', async () => {
  try {
    const { stopServer } = require(path.join(getDistPath(), 'server.js'));
    await stopServer();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理目录选择请求
ipcMain.handle('selectDirectory', async (event, title = '选择目录', defaultPath = null) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: title,
    defaultPath: defaultPath || getDefaultDownloadDir()
  });
  
  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    return { success: true, filePath: result.filePaths[0] };
  }
  return { success: false };
});

// 获取默认下载目录
ipcMain.handle('getDefaultDownloadDir', () => {
  return getDefaultDownloadDir();
});