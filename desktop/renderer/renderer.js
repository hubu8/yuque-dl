const $ = (sel) => document.querySelector(sel)

// ========== 授权检查 ==========
const licenseOverlay = $('#licenseOverlay')
const mainApp = $('#mainApp')
const machineIdInput = $('#machineId')
const licenseKeyInput = $('#licenseKeyInput')
const copyMachineIdBtn = $('#copyMachineIdBtn')
const activateBtn = $('#activateBtn')
const licenseError = $('#licenseError')

async function initLicense() {
  const status = await window.yuqueAPI.licenseCheck()
  machineIdInput.value = status.machineId

  if (status.activated) {
    licenseOverlay.style.display = 'none'
    mainApp.style.display = 'flex'
  } else {
    licenseOverlay.style.display = 'flex'
    mainApp.style.display = 'none'
  }
}

copyMachineIdBtn.addEventListener('click', async () => {
  await window.yuqueAPI.licenseCopyMachineId()
  copyMachineIdBtn.textContent = '已复制'
  setTimeout(() => { copyMachineIdBtn.textContent = '复制' }, 2000)
})

activateBtn.addEventListener('click', async () => {
  const key = licenseKeyInput.value.trim()
  if (!key) {
    licenseError.textContent = '请输入授权码'
    licenseError.style.display = 'block'
    return
  }

  activateBtn.disabled = true
  activateBtn.textContent = '验证中...'
  const result = await window.yuqueAPI.licenseActivate(key)
  activateBtn.disabled = false
  activateBtn.textContent = '激活'

  if (result.success) {
    licenseOverlay.style.display = 'none'
    mainApp.style.display = 'flex'
  } else {
    licenseError.textContent = result.error
    licenseError.style.display = 'block'
  }
})

// 启动时检查授权
initLicense()

// ========== 主界面逻辑 ==========
const form = $('#downloadForm')
const startBtn = $('#startBtn')
const cancelBtn = $('#cancelBtn')
const selectDirBtn = $('#selectDirBtn')
const openDistDirBtn = $('#openDistDirBtn')
const clearLogBtn = $('#clearLogBtn')
const openDirBtn = $('#openDirBtn')
const logArea = $('#logArea')
const progressSection = $('#progressSection')
const progressText = $('#progressText')
const progressPercent = $('#progressPercent')
const progressFill = $('#progressFill')
const resultSection = $('#resultSection')
const resultText = $('#resultText')

let isDownloading = false
let resultPath = ''

// 选择目录
selectDirBtn.addEventListener('click', async () => {
  const dir = await window.yuqueAPI.selectDirectory()
  if (dir) {
    $('#distDir').value = dir
  }
})

// 清空日志
clearLogBtn.addEventListener('click', () => {
  logArea.innerHTML = ''
})

// 打开下载目录（表单旁的按钮）
openDistDirBtn.addEventListener('click', () => {
  const dir = $('#distDir').value
  if (dir) {
    window.yuqueAPI.openDirectory(dir)
  }
})

// 打开下载结果目录
openDirBtn.addEventListener('click', () => {
  if (resultPath) {
    window.yuqueAPI.openDirectory(resultPath)
  }
})

// 添加日志
function addLog(msg, type = 'info') {
  const div = document.createElement('div')
  div.className = `log-item log-${type}`
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
  logArea.appendChild(div)
  logArea.scrollTop = logArea.scrollHeight
}

// 设置下载状态
function setDownloading(downloading) {
  isDownloading = downloading
  startBtn.disabled = downloading
  cancelBtn.disabled = !downloading
  startBtn.textContent = downloading ? '下载中...' : '开始下载'
}

// 提交表单 - 开始下载
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (isDownloading) return

  const url = $('#url').value.trim()
  if (!url) {
    addLog('请输入知识库 URL', 'error')
    return
  }

  const params = {
    url,
    distDir: $('#distDir').value || 'download',
    token: $('#token').value.trim() || undefined,
    key: $('#key').value.trim() || undefined,
    ignoreImg: $('#ignoreImg').checked,
    ignoreAttachments: $('#ignoreAttachments').checked,
    toc: $('#toc').checked,
    incremental: $('#incremental').checked,
    convertMarkdownVideoLinks: $('#convertMarkdownVideoLinks').checked,
    hideFooter: $('#hideFooter').checked
  }

  setDownloading(true)
  progressSection.style.display = 'block'
  resultSection.style.display = 'none'
  progressFill.style.width = '0%'
  progressText.textContent = '准备中...'
  progressPercent.textContent = '0%'
  addLog(`开始下载: ${url}`, 'info')

  const result = await window.yuqueAPI.startDownload(params)

  setDownloading(false)

  if (result.success) {
    resultPath = result.path
    resultSection.style.display = 'flex'
    resultSection.className = 'result-section'
    resultText.textContent = `✅ 下载完成!`
    openDirBtn.style.display = 'inline'
    addLog('下载完成!', 'success')
  } else {
    resultSection.style.display = 'flex'
    resultSection.className = 'result-section error'
    resultText.textContent = `❌ ${result.error}`
    openDirBtn.style.display = 'none'
    addLog(`错误: ${result.error}`, 'error')
  }
})

// 取消下载
cancelBtn.addEventListener('click', async () => {
  if (!isDownloading) return
  await window.yuqueAPI.cancelDownload()
  setDownloading(false)
  addLog('已取消下载', 'error')
})

// 监听进度
window.yuqueAPI.onProgress((data) => {
  const percent = Math.round((data.current / data.total) * 100)
  progressFill.style.width = `${percent}%`
  progressText.textContent = `${data.title} (${data.current}/${data.total})`
  progressPercent.textContent = `${percent}%`
})

// 监听日志
window.yuqueAPI.onLog((msg) => {
  const type = msg.startsWith('✓') ? 'success' : msg.startsWith('✗') ? 'error' : 'info'
  addLog(msg, type)
})
