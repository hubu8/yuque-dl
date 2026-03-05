import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 处理下载请求
ipcMain.handle('download', async (event, url, options) => {
  const { main } = await import('../dist/es/index.js');
  try {
    await main(url, options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理服务器启动请求
ipcMain.handle('server', async (event, serverPath, options) => {
  const { runServer } = await import('../dist/es/server.js');
  try {
    await runServer(serverPath, options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});