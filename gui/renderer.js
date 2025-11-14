const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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

    fs.appendFileSync(logPath, logEntry);
  } catch (err) {
    console.error('日志写入失败:', err);
  }
}


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

  // 构建命令
  let cmd = `yuque-dl "${url}"`;
  logMessage(`开始下载: ${url}`);

  // 设置 key 的默认值
  const actualKey = key || '_yuque_session';

  if (token) {
    if (key) {
      // 如果用户指定了 key，则使用用户指定的 key
      cmd += ` -k="${key}" -t="${token}"`;
      logMessage(`使用自定义key: ${key}`);
    } else {
      // 如果用户只提供了 token，使用默认 key
      cmd += ` -k="${actualKey}" -t="${token}"`;
      logMessage(`使用默认key: ${actualKey}`);
    }
  }

  // 更新UI状态
  const downloadBtn = document.getElementById('downloadBtn');
  downloadBtn.disabled = true;
  downloadBtn.textContent = '下载中...';

  showStatus('正在下载...', 'downloading');
  updateProgress(0);
  logMessage('下载进程启动');

  // 执行命令
  exec(cmd, (error, stdout, stderr) => {
    downloadBtn.disabled = false;
    downloadBtn.textContent = '开始下载';

    if (error) {
      const errorMsg = `下载失败: ${stderr || error.message}`;
      showStatus(errorMsg, 'error');
      updateProgress(0);
      logMessage(`下载失败: ${stderr || error.message}`);
    } else {
      showStatus('下载完成！', 'success');
      updateProgress(100);
      logMessage('下载完成');
    }

    // 记录详细输出
    if (stdout) {
      logMessage(`stdout: ${stdout}`);
    }
    if (stderr) {
      logMessage(`stderr: ${stderr}`);
    }
  });

  // 模拟进度更新
  simulateProgress();
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
