#!/usr/bin/env node
/**
 * 授权码生成工具 - Web 版
 * 启动本地服务，打开浏览器页面，输入机器码 + 选择时长 → 生成授权码
 *
 * 用法:
 *   node keygen.js
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const http = require('http')
const { exec } = require('child_process')

const PRIVATE_KEY = fs.readFileSync(
  path.join(__dirname, 'keys', 'private.pem'), 'utf-8'
)

const PORT = 19999

// 生成授权码: 签名内容 = machineId|expireAt
function generateLicense(machineId, expireAt) {
  const clean = machineId.replace(/[^A-Fa-f0-9]/g, '').toUpperCase()
  if (clean.length !== 16) throw new Error('机器码应为16位十六进制')

  const payload = `${clean}|${expireAt}`
  const sign = crypto.createSign('SHA256')
  sign.update(payload)
  sign.end()
  const signature = sign.sign(PRIVATE_KEY, 'base64')

  // 授权码格式: expireAt:signature
  return `${expireAt}:${signature}`
}

// 计算过期时间戳
function calcExpireAt(duration) {
  const now = Date.now()
  switch (duration) {
    case '30m':   return now + 30 * 60 * 1000
    case '1d':    return now + 24 * 60 * 60 * 1000
    case '1y':    return now + 365 * 24 * 60 * 60 * 1000
    case '3y':    return now + 3 * 365 * 24 * 60 * 60 * 1000
    case 'permanent': return 0
    default: throw new Error('无效的授权时长')
  }
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>授权码生成器</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, "Microsoft YaHei", sans-serif;
    background: #f0f2f5;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .card {
    background: #fff;
    border-radius: 14px;
    padding: 36px 32px;
    width: 520px;
    max-width: 100%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.08);
  }
  .card h1 {
    font-size: 22px;
    text-align: center;
    margin-bottom: 6px;
    color: #1d2129;
  }
  .card .subtitle {
    text-align: center;
    font-size: 13px;
    color: #86909c;
    margin-bottom: 28px;
  }
  .field { margin-bottom: 20px; }
  .field label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #4e5969;
    margin-bottom: 6px;
  }
  .field input[type="text"] {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #e4e7ec;
    border-radius: 8px;
    font-size: 15px;
    font-family: "Cascadia Code", Consolas, monospace;
    letter-spacing: 1px;
    outline: none;
    transition: border-color 0.2s;
  }
  .field input:focus {
    border-color: #4a9eff;
    box-shadow: 0 0 0 3px rgba(74,158,255,0.1);
  }
  .duration-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
  .duration-btn {
    padding: 10px 0;
    border: 2px solid #e4e7ec;
    border-radius: 8px;
    background: #fafbfc;
    font-size: 13px;
    font-weight: 600;
    color: #4e5969;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s;
  }
  .duration-btn:hover { border-color: #4a9eff; color: #4a9eff; background: #f0f7ff; }
  .duration-btn.active { border-color: #4a9eff; color: #fff; background: #4a9eff; }
  .duration-btn .dur-label { display: block; }
  .duration-btn .dur-desc { display: block; font-size: 11px; font-weight: 400; margin-top: 2px; opacity: 0.7; }
  .btn-generate {
    width: 100%;
    padding: 12px;
    background: #25b864;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.2s;
    margin-top: 4px;
  }
  .btn-generate:hover { background: #1fa855; }
  .btn-generate:disabled { background: #c9cdd4; cursor: not-allowed; }
  .result {
    margin-top: 20px;
    display: none;
  }
  .result.show { display: block; }
  .result-label {
    font-size: 12px;
    font-weight: 600;
    color: #4e5969;
    margin-bottom: 4px;
  }
  .result-box {
    background: #f7f8fa;
    border: 1px solid #e4e7ec;
    border-radius: 8px;
    padding: 12px 14px;
    font-family: "Cascadia Code", Consolas, monospace;
    font-size: 12px;
    word-break: break-all;
    line-height: 1.6;
    color: #1d2129;
    position: relative;
  }
  .result-info {
    margin-top: 10px;
    padding: 10px 14px;
    background: #ecfdf3;
    border: 1px solid #b7ebc9;
    border-radius: 8px;
    font-size: 12px;
    color: #1a7a3a;
  }
  .btn-copy {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 4px 10px;
    font-size: 11px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-copy:hover { background: #3b8de8; }
  .error-msg {
    margin-top: 12px;
    padding: 10px 14px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    font-size: 13px;
    color: #b91c1c;
    display: none;
  }
  .history { margin-top: 24px; border-top: 1px solid #e4e7ec; padding-top: 16px; }
  .history h3 { font-size: 14px; color: #4e5969; margin-bottom: 10px; }
  .history-list { max-height: 200px; overflow-y: auto; }
  .history-item {
    padding: 8px 12px;
    background: #fafbfc;
    border: 1px solid #e4e7ec;
    border-radius: 6px;
    margin-bottom: 6px;
    font-size: 12px;
    color: #4e5969;
  }
  .history-item .hi-machine { font-family: Consolas, monospace; font-weight: 600; color: #1d2129; }
  .history-item .hi-dur { color: #4a9eff; }
  .history-item .hi-time { color: #86909c; }
</style>
</head>
<body>
<div class="card">
  <h1>🔑 授权码生成器</h1>
  <p class="subtitle">输入客户机器码，选择授权时长，生成授权码</p>

  <div class="field">
    <label>机器码</label>
    <input type="text" id="machineId" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="19"
           oninput="formatMachineId(this)">
  </div>

  <div class="field">
    <label>授权时长</label>
    <div class="duration-grid">
      <div class="duration-btn" data-dur="30m" onclick="selectDuration(this)">
        <span class="dur-label">30 分钟</span>
        <span class="dur-desc">测试用</span>
      </div>
      <div class="duration-btn" data-dur="1d" onclick="selectDuration(this)">
        <span class="dur-label">1 天</span>
        <span class="dur-desc">试用</span>
      </div>
      <div class="duration-btn" data-dur="1y" onclick="selectDuration(this)">
        <span class="dur-label">1 年</span>
        <span class="dur-desc">标准</span>
      </div>
      <div class="duration-btn" data-dur="3y" onclick="selectDuration(this)">
        <span class="dur-label">3 年</span>
        <span class="dur-desc">长期</span>
      </div>
      <div class="duration-btn active" data-dur="permanent" onclick="selectDuration(this)">
        <span class="dur-label">永久</span>
        <span class="dur-desc">买断</span>
      </div>
    </div>
  </div>

  <button class="btn-generate" id="generateBtn" onclick="generate()">生成授权码</button>

  <div class="error-msg" id="errorMsg"></div>

  <div class="result" id="resultSection">
    <div class="result-label">授权码（发送给客户）</div>
    <div class="result-box" id="resultBox">
      <button class="btn-copy" onclick="copyResult()">复制</button>
      <span id="resultText"></span>
    </div>
    <div class="result-info" id="resultInfo"></div>
  </div>

  <div class="history" id="historySection" style="display:none;">
    <h3>📋 生成记录</h3>
    <div class="history-list" id="historyList"></div>
  </div>
</div>

<script>
let selectedDuration = 'permanent'
const history = []

const DURATION_LABELS = {
  '30m': '30 分钟', '1d': '1 天',
  '1y': '1 年', '3y': '3 年', 'permanent': '永久'
}

function formatMachineId(input) {
  let v = input.value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase().slice(0, 16)
  input.value = v.match(/.{1,4}/g)?.join('-') || ''
}

function selectDuration(el) {
  document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'))
  el.classList.add('active')
  selectedDuration = el.dataset.dur
}

async function generate() {
  const machineId = document.getElementById('machineId').value.trim()
  const errorMsg = document.getElementById('errorMsg')
  const resultSection = document.getElementById('resultSection')
  errorMsg.style.display = 'none'
  resultSection.classList.remove('show')

  if (!machineId) {
    errorMsg.textContent = '请输入机器码'
    errorMsg.style.display = 'block'
    return
  }

  const clean = machineId.replace(/[^A-Fa-f0-9]/g, '')
  if (clean.length !== 16) {
    errorMsg.textContent = '机器码应为16位十六进制（如 A1B2-C3D4-E5F6-7890）'
    errorMsg.style.display = 'block'
    return
  }

  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId: clean, duration: selectedDuration })
    })
    const data = await resp.json()
    if (!data.success) {
      errorMsg.textContent = data.error
      errorMsg.style.display = 'block'
      return
    }

    document.getElementById('resultText').textContent = data.licenseKey
    const expireText = data.expireAt === 0
      ? '永久有效'
      : '过期时间: ' + new Date(data.expireAt).toLocaleString('zh-CN')
    document.getElementById('resultInfo').textContent =
      '机器码: ' + machineId + ' | 时长: ' + DURATION_LABELS[selectedDuration] + ' | ' + expireText
    resultSection.classList.add('show')

    // 添加历史记录
    history.unshift({ machineId, duration: selectedDuration, time: new Date().toLocaleTimeString() })
    renderHistory()
  } catch (err) {
    errorMsg.textContent = '请求失败: ' + err.message
    errorMsg.style.display = 'block'
  }
}

function copyResult() {
  const text = document.getElementById('resultText').textContent
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.btn-copy')
    btn.textContent = '已复制!'
    setTimeout(() => { btn.textContent = '复制' }, 1500)
  })
}

function renderHistory() {
  const section = document.getElementById('historySection')
  const list = document.getElementById('historyList')
  if (history.length === 0) { section.style.display = 'none'; return }
  section.style.display = 'block'
  list.innerHTML = history.map(h =>
    '<div class="history-item">' +
    '<span class="hi-machine">' + h.machineId + '</span> ' +
    '<span class="hi-dur">' + DURATION_LABELS[h.duration] + '</span> ' +
    '<span class="hi-time">' + h.time + '</span>' +
    '</div>'
  ).join('')
}
</script>
</body>
</html>`

// HTTP 服务
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(HTML_PAGE)
    return
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const { machineId, duration } = JSON.parse(body)
        const expireAt = calcExpireAt(duration)
        const licenseKey = generateLicense(machineId, expireAt)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, licenseKey, expireAt }))
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
    })
    return
  }

  res.writeHead(404)
  res.end('Not Found')
})

server.listen(PORT, () => {
  const url = `http://127.0.0.1:${PORT}`
  console.log('')
  console.log('🔑 授权码生成器已启动')
  console.log(`   地址: ${url}`)
  console.log('   按 Ctrl+C 停止')
  console.log('')

  // 自动打开浏览器
  const cmd = process.platform === 'win32' ? `start ${url}`
    : process.platform === 'darwin' ? `open ${url}`
    : `xdg-open ${url}`
  exec(cmd)
})
