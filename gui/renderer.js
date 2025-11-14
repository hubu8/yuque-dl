const yuqueDL = require('yuque-dl');
const fs = require('fs');
const path = require('path');


function viewLogs() {
  const { shell } = require('electron');
  const fs = require('fs');
  const path = require('path');

  // 使用相同的应用数据目录
  const userDataPath = (process.env.LOCALAPPDATA || process.env.APPDATA) + '\\yuque-dl-gui';
  const logPath = path.join(userDataPath, 'download.log');

  // 如果日志文件不存在，创建一个空文件
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '');
  }

  shell.openPath(logPath);
}

function clearLogs() {
  const fs = require('fs');
  const path = require('path');

  const userDataPath = (process.env.LOCALAPPDATA || process.env.APPDATA) + '\\yuque-dl-gui';
  const logPath = path.join(userDataPath, 'download.log');

  try {
    fs.writeFileSync(logPath, '');
    showStatus('日志已清除', 'success');
  } catch (error) {
    showStatus('清除日志失败: ' + error.message, 'error');
  }
}
// 添加日志记录函数
// 改进的 logMessage 函数
function logMessage(message) {
  try {
    const userDataPath = (process.env.LOCALAPPDATA || process.env.APPDATA) + '\\yuque-dl-gui';
    // 确保目录存在
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const logPath = path.join(userDataPath, 'download.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    fs.appendFileSync(logPath, logEntry, 'utf8');
    console.log('Log written successfully:', message); // 调试用
  } catch (err) {
    console.error('日志写入失败:', err);
  }
}

// 修改 download 函数中的调用方式
function download() {
  const url = document.getElementById('url').value.trim();
  const key = document.getElementById('key').value.trim();
  const token = document.getElementById('token').value.trim();

  // 验证输入
  if (!url) {
    const errorMsg = '请输入知识库URL';
    showStatus(errorMsg, 'error');
    logMessage(`错误: ${errorMsg}`);
    return;
  }

  logMessage(`开始下载: ${url}`);

  // 设置选项
  const options = {};
  if (token) {
    options.key = key || '_yuque_session';
    options.token = token;
    logMessage(`使用key: ${options.key}`);
  }

  // 更新UI状态
  const downloadBtn = document.getElementById('downloadBtn');
  downloadBtn.disabled = true;
  downloadBtn.textContent = '下载中...';

  showStatus('正在下载...', 'downloading');
  updateProgress(0);
  logMessage('下载进程启动');

  // 调用 yuque-dl，注意传递正确的参数
  yuqueDL(url, options)
    .then(() => {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '开始下载';
      showStatus('下载完成！', 'success');
      updateProgress(100);
      logMessage('下载完成');
    })
    .catch((error) => {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '开始下载';
      const errorMsg = `下载失败: ${error.message}`;
      showStatus(errorMsg, 'error');
      updateProgress(0);
      logMessage(`下载失败: ${error.message}`);
    });
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  const statusText = document.getElementById('statusText');

  statusDiv.className = 'status ' + type;
  statusText.textContent = message;
}

function updateProgress(percent) {
  const progressBar = document.getElementById('progressBar');
  progressBar.style.width = percent + '%';
}

function simulateProgress() {
  let progress = 0;
  const interval = setInterval(() => {
    if (progress >= 90) {
      clearInterval(interval);
      return;
    }
    progress += Math.random() * 10;
    if (progress > 90) progress = 90;
    updateProgress(progress);
  }, 500);
}

// 添加回车键支持
document.addEventListener('DOMContentLoaded', function() {
  const inputs = document.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        download();
      }
    });
  });
});
