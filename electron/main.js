import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMachineId, verifyLicenseCode, saveLicenseCode, isLicensed, getLicenseInfo } from './license.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    width: 600,
    height: 400,
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

// 处理下载请求
ipcMain.handle('download', async (event, url, options) => {
  try {
    const { main } = await import(path.join(__dirname, '../dist/es/index.js'));
    await main(url, options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理服务器启动请求
ipcMain.handle('server', async (event, serverPath, options) => {
  try {
    const { runServer } = await import(path.join(__dirname, '../dist/es/server.js'));
    await runServer(serverPath, options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理目录选择请求
ipcMain.handle('selectDirectory', async (event, title = '选择目录') => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: title
  });
  
  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    return { success: true, filePath: result.filePaths[0] };
  }
  return { success: false };
});