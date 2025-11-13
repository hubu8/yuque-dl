const { app, BrowserWindow } = require('electron');


app.on('ready', () => {
  // 设置应用区域
  app.commandLine.appendSwitch('lang', 'zh-CN');
});

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
