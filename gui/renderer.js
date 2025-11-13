const { exec } = require('child_process');

function download() {
  const url = document.getElementById('url').value.trim();
  const key = document.getElementById('key').value.trim();
  const token = document.getElementById('token').value.trim();

  // 验证输入
  if (!url) {
    showStatus('请输入知识库URL', 'error');
    return;
  }

  // 构建命令
  let cmd = `yuque-dl "${url}"`;

  // 设置 key 的默认值
  const actualKey = key || '_yuque_session';

  if (token) {
    if (key) {
      // 如果用户指定了 key，则使用用户指定的 key
      cmd += ` -k="${key}" -t="${token}"`;
    } else {
      // 如果用户只提供了 token，使用默认 key
      cmd += ` -k="${actualKey}" -t="${token}"`;
    }
  }

  // 更新UI状态
  const downloadBtn = document.getElementById('downloadBtn');
  downloadBtn.disabled = true;
  downloadBtn.textContent = '下载中...';

  showStatus('正在下载...', 'downloading');
  updateProgress(0);

  // 执行命令
  exec(cmd, (error, stdout, stderr) => {
    downloadBtn.disabled = false;
    downloadBtn.textContent = '开始下载';

    if (error) {
      showStatus(`下载失败: ${stderr || error.message}`, 'error');
      updateProgress(0);
    } else {
      showStatus('下载完成！', 'success');
      updateProgress(100);
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
