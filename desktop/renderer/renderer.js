const $ = (sel) => document.querySelector(sel)

// ========== 授权检查 ==========
const licenseOverlay = $('#licenseOverlay')
const mainApp = $('#mainApp')
const machineIdInput = $('#machineId')
const licenseKeyInput = $('#licenseKeyInput')
const copyMachineIdBtn = $('#copyMachineIdBtn')
const activateBtn = $('#activateBtn')
const licenseError = $('#licenseError')
const licensePopover = $('#licensePopover')
const popoverStatus = $('#popoverStatus')
const popoverExpire = $('#popoverExpire')
const popoverMachineId = $('#popoverMachineId')
const popoverCopyBtn = $('#popoverCopyBtn')
const popoverClearBtn = $('#popoverClearBtn')

// 更新浮层信息
function updatePopoverInfo(status) {
  popoverMachineId.textContent = status.machineId || '-'
  if (status.expired) {
    popoverStatus.textContent = '已过期'
    popoverStatus.style.color = 'var(--c-danger)'
    popoverExpire.textContent = status.expireText || '-'
  } else if (!status.activated) {
    popoverStatus.textContent = '未激活'
    popoverStatus.style.color = 'var(--c-danger)'
    popoverExpire.textContent = '-'
  } else {
    popoverStatus.textContent = '已激活'
    popoverStatus.style.color = 'var(--c-primary)'
    popoverExpire.textContent = status.expireText || '永久有效'
  }
}

async function initLicense() {
  const status = await window.yuqueAPI.licenseCheck()
  machineIdInput.value = status.machineId

  const licenseStatusEl = $('#licenseStatus')

  if (status.expired) {
    licenseOverlay.style.display = 'flex'
    licenseError.textContent = `授权已过期（${status.expireText}），请重新激活`
    licenseError.style.display = 'block'
    licenseStatusEl.innerHTML = '⚠️ 已过期 <span class="license-arrow">▾</span>'
    licenseStatusEl.className = 'license-status license-clickable license-expired'
  } else if (!status.activated) {
    licenseOverlay.style.display = 'flex'
    licenseStatusEl.innerHTML = '❌ 未激活 <span class="license-arrow">▾</span>'
    licenseStatusEl.className = 'license-status license-clickable license-inactive'
  } else {
    const expireText = status.expireText || '永久有效'
    licenseStatusEl.innerHTML = `✅ ${expireText} <span class="license-arrow">▾</span>`
    licenseStatusEl.className = 'license-status license-clickable'
  }

  updatePopoverInfo(status)
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
    const licenseStatusEl = $('#licenseStatus')
    const expireText = result.expireText || '永久有效'
    licenseStatusEl.innerHTML = `✅ ${expireText} <span class="license-arrow">▾</span>`
    licenseStatusEl.className = 'license-status license-clickable'
    // 同步更新浮层
    popoverStatus.textContent = '已激活'
    popoverStatus.style.color = 'var(--c-primary)'
    popoverExpire.textContent = expireText
  } else {
    licenseError.textContent = result.error
    licenseError.style.display = 'block'
  }
})

// 启动时检查授权
initLicense()

// 监听运行期授权过期通知（主进程定时复检）
window.yuqueAPI.onLicenseExpired((status) => {
  licenseOverlay.style.display = 'flex'
  licenseError.textContent = status.tampered
    ? '检测到系统时间异常，请校正系统时间后重启'
    : `授权已过期（${status.expireText || '已过期'}），请重新激活`
  licenseError.style.display = 'block'
  const licenseStatusEl = $('#licenseStatus')
  licenseStatusEl.innerHTML = '⚠️ 已过期 <span class="license-arrow">▾</span>'
  licenseStatusEl.className = 'license-status license-clickable license-expired'
  updatePopoverInfo(status)
})

// ========== 授权浮层交互 ==========

$('#licenseStatus').addEventListener('click', (e) => {
  e.stopPropagation()
  const isVisible = licensePopover.style.display !== 'none'
  licensePopover.style.display = isVisible ? 'none' : 'block'
})

// 点击浮层外部关闭
document.addEventListener('click', (e) => {
  const statusEl = $('#licenseStatus')
  if (!licensePopover.contains(e.target) && !statusEl.contains(e.target)) {
    licensePopover.style.display = 'none'
  }
})

// 浮层内复制机器码
popoverCopyBtn.addEventListener('click', async () => {
  await window.yuqueAPI.licenseCopyMachineId()
  popoverCopyBtn.textContent = '✅ 已复制'
  setTimeout(() => { popoverCopyBtn.textContent = '📋 复制机器码' }, 2000)
})

// 浮层内清除授权（二次确认）
popoverClearBtn.addEventListener('click', async () => {
  if (popoverClearBtn.dataset.confirming === 'true') {
    // 第二次点击，执行清除
    await window.yuqueAPI.licenseClear()
    licensePopover.style.display = 'none'
    // 重新检查授权状态，会显示未激活并弹出激活窗口
    initLicense()
    return
  }
  // 第一次点击，显示确认
  popoverClearBtn.dataset.confirming = 'true'
  popoverClearBtn.textContent = '❗ 确认清除？'
  setTimeout(() => {
    popoverClearBtn.dataset.confirming = ''
    popoverClearBtn.textContent = '🗑 清除授权'
  }, 3000)
})

// ========== Tab 切换 ==========
document.querySelectorAll('.tab-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('tab' + target.charAt(0).toUpperCase() + target.slice(1)).classList.add('active')

    // 切到预览/转换页时，如果目录为空且有最近下载路径，自动填入
    if (lastDownloadedBookPath) {
      if (target === 'preview' && !previewDirInput.value) {
        previewDirInput.value = lastDownloadedBookPath
      }
      if (target === 'convert' && !convertDirInput.value) {
        convertDirInput.value = lastDownloadedBookPath
        // 同步更新输出目录提示
        const dirName = lastDownloadedBookPath.split(/[\\/]/).pop()
        const suffix = getConvertFormat() === 'word' ? '_word' : '_pdf'
        convertOutputHint.textContent = dirName + suffix
      }
    }
  })
})

// ========== URL 格式校验 ==========
const urlInput = $('#url')
const urlValidationHint = $('#urlValidationHint')
const YUQUE_URL_RE = /^https?:\/\/[\w.-]*yuque\.com\/.+\/.+/

urlInput.addEventListener('input', () => {
  const val = urlInput.value.trim()
  if (!val || YUQUE_URL_RE.test(val)) {
    urlInput.classList.remove('input-invalid')
    urlValidationHint.classList.remove('visible')
  } else {
    urlInput.classList.add('input-invalid')
    urlValidationHint.classList.add('visible')
  }
})

urlInput.addEventListener('blur', () => {
  const val = urlInput.value.trim()
  if (!val) {
    urlInput.classList.remove('input-invalid')
    urlValidationHint.classList.remove('visible')
  }
})

// ========== 日志筛选 ==========
let logFilterState = {}  // { logArea: 'all', convertLogArea: 'all' }

document.querySelectorAll('.log-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.filter
    const targetId = btn.dataset.target
    const targetArea = document.getElementById(targetId)
    if (!targetArea) return

    // 更新按钮激活状态
    btn.closest('.log-filter-group').querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    logFilterState[targetId] = filter

    // 筛选日志项
    targetArea.querySelectorAll('.log-item').forEach(item => {
      if (filter === 'all') {
        item.classList.remove('log-hidden')
      } else {
        const match = item.classList.contains(`log-${filter}`)
        item.classList.toggle('log-hidden', !match)
      }
    })
  })
})

// 日志添加时自动应用当前筛选状态
function applyLogFilter(item, targetId) {
  const filter = logFilterState[targetId]
  if (filter && filter !== 'all') {
    if (!item.classList.contains(`log-${filter}`)) {
      item.classList.add('log-hidden')
    }
  }
}

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
let lastDownloadedBookPath = '' // 最近一次下载成功的知识库目录

// 选择目录
selectDirBtn.addEventListener('click', async () => {
  const currentDir = $('#distDir').value
  const dir = await window.yuqueAPI.selectDirectory(currentDir)
  if (dir) {
    $('#distDir').value = dir
  }
})

// 启动时设置默认下载路径
window.yuqueAPI.getDefaultDownloadPath().then(p => {
  $('#distDir').value = p
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
  applyLogFilter(div, 'logArea')
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
  progressSection.classList.remove('progress-done')
  resultSection.style.display = 'none'
  progressFill.style.width = '0%'
  progressText.textContent = '准备中...'
  progressPercent.textContent = '0%'
  addLog(`开始下载: ${url}`, 'info')

  const result = await window.yuqueAPI.startDownload(params)

  setDownloading(false)

  if (result.success) {
    resultPath = result.path
    lastDownloadedBookPath = result.path
    resultSection.style.display = 'flex'
    resultSection.className = 'result-section'
    resultText.textContent = `✅ 下载完成!`
    openDirBtn.style.display = 'inline'
    addLog('下载完成!', 'success')
    // 进度条变为完成状态，3秒后淡出
    progressSection.classList.add('progress-done')
    progressText.textContent = '✅ 下载完成'
    setTimeout(() => { progressSection.style.display = 'none' }, 3000)
  } else {
    resultSection.style.display = 'flex'
    resultSection.className = 'result-section error'
    resultText.textContent = `❌ ${result.error}`
    openDirBtn.style.display = 'none'
    addLog(`错误: ${result.error}`, 'error')
    progressSection.style.display = 'none'
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

// ========== 预览功能 ==========
const previewDirInput = $('#previewDir')
const selectPreviewDirBtn = $('#selectPreviewDirBtn')
const previewStartBtn = $('#previewStartBtn')
const previewStopBtn = $('#previewStopBtn')
const previewStatus = $('#previewStatus')
const previewLink = $('#previewLink')
const previewOpenBtn = $('#previewOpenBtn')

let previewRunning = false

selectPreviewDirBtn.addEventListener('click', async () => {
  const dir = await window.yuqueAPI.selectPreviewDirectory()
  if (dir) previewDirInput.value = dir
})

previewStartBtn.addEventListener('click', async () => {
  const dir = previewDirInput.value.trim()
  if (!dir) return

  previewStartBtn.disabled = true
  previewStartBtn.textContent = '启动中...'

  const result = await window.yuqueAPI.previewStart(dir)

  if (result.success) {
    previewRunning = true
    previewStopBtn.disabled = false
    previewStartBtn.textContent = '已启动'
    const url = `http://127.0.0.1:${result.port}`
    previewLink.textContent = url
    previewLink.href = url
    previewStatus.style.display = 'flex'
    previewStatus.className = 'preview-status'
    $('#previewStatusIcon').textContent = '🟢'
    window.yuqueAPI.previewOpen(url)
  } else {
    previewStartBtn.disabled = false
    previewStartBtn.textContent = '启动预览'
    // 在预览页面直接显示错误
    previewStatus.style.display = 'flex'
    previewStatus.className = 'preview-status preview-error'
    $('#previewStatusIcon').textContent = '🔴'
    previewLink.textContent = result.error
    previewLink.href = '#'
  }
})

previewStopBtn.addEventListener('click', async () => {
  await window.yuqueAPI.previewStop()
  previewRunning = false
  previewStartBtn.disabled = false
  previewStartBtn.textContent = '启动预览'
  previewStopBtn.disabled = true
  previewStatus.style.display = 'none'
})

previewOpenBtn.addEventListener('click', () => {
  window.yuqueAPI.previewOpen(previewLink.href)
})

// 阻止预览链接默认行为
previewLink.addEventListener('click', (e) => {
  e.preventDefault()
  window.yuqueAPI.previewOpen(previewLink.href)
})

// ========== 转换功能 ==========
const convertDirInput = $('#convertDir')
const selectConvertDirBtn = $('#selectConvertDirBtn')
const openConvertDirBtn = $('#openConvertDirBtn')
const convertStartBtn = $('#convertStartBtn')
const convertCancelBtn = $('#convertCancelBtn')
const convertProgressSection = $('#convertProgressSection')
const convertProgressText = $('#convertProgressText')
const convertProgressPercent = $('#convertProgressPercent')
const convertProgressFill = $('#convertProgressFill')
const convertLogArea = $('#convertLogArea')
const clearConvertLogBtn = $('#clearConvertLogBtn')
const convertResultSection = $('#convertResultSection')
const convertResultText = $('#convertResultText')
const openConvertResultBtn = $('#openConvertResultBtn')
const convertOutputHint = $('#convertOutputHint')

let isConverting = false
let convertResultPath = ''
let convertStartTime = 0
const concurrencySlider = $('#convertConcurrency')
const concurrencyValueLabel = $('#concurrencyValue')

// 滑块实时更新数字
concurrencySlider.addEventListener('input', () => {
  concurrencyValueLabel.textContent = concurrencySlider.value
})

// 获取当前选中的格式
function getConvertFormat() {
  const checked = document.querySelector('input[name="convertFormat"]:checked')
  return checked ? checked.value : 'pdf'
}

// 格式切换时更新提示 + 自动调整默认并发数
document.querySelectorAll('input[name="convertFormat"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const format = getConvertFormat()
    const suffix = format === 'word' ? '_word' : '_pdf'
    const dir = convertDirInput.value
    if (dir) {
      const dirName = dir.split(/[\\/]/).pop()
      convertOutputHint.textContent = dirName + suffix
    } else {
      convertOutputHint.textContent = 'xxx' + suffix
    }
    // 切换格式时自动调整推荐并发数
    const defaultConcurrency = format === 'word' ? 8 : 3
    concurrencySlider.value = defaultConcurrency
    concurrencyValueLabel.textContent = defaultConcurrency
  })
})

// 选择转换目录
selectConvertDirBtn.addEventListener('click', async () => {
  const dir = await window.yuqueAPI.selectConvertDirectory()
  if (dir) {
    convertDirInput.value = dir
    // 更新输出目录提示
    const dirName = dir.split(/[\\/]/).pop()
    const suffix = getConvertFormat() === 'word' ? '_word' : '_pdf'
    convertOutputHint.textContent = dirName + suffix
  }
})

// 打开输出目录
openConvertDirBtn.addEventListener('click', () => {
  if (convertResultPath) {
    window.yuqueAPI.openDirectory(convertResultPath)
  } else if (convertDirInput.value) {
    const dir = convertDirInput.value
    const dirName = dir.split(/[\\/]/).pop()
    const parentDir = dir.substring(0, dir.length - dirName.length)
    const suffix = getConvertFormat() === 'word' ? '_word' : '_pdf'
    window.yuqueAPI.openDirectory(parentDir + dirName + suffix)
  }
})

// 清空转换日志
clearConvertLogBtn.addEventListener('click', () => {
  convertLogArea.innerHTML = ''
})

// 添加转换日志
function addConvertLog(msg, type = 'info') {
  const div = document.createElement('div')
  div.className = `log-item log-${type}`
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
  convertLogArea.appendChild(div)
  applyLogFilter(div, 'convertLogArea')
  convertLogArea.scrollTop = convertLogArea.scrollHeight
}

// 设置转换状态
function setConverting(converting) {
  isConverting = converting
  convertStartBtn.disabled = converting
  convertCancelBtn.disabled = !converting
  convertStartBtn.textContent = converting ? '转换中...' : '开始转换'
}

// 开始转换
convertStartBtn.addEventListener('click', async () => {
  const dir = convertDirInput.value.trim()
  if (!dir) {
    addConvertLog('请先选择知识库目录', 'error')
    return
  }
  if (isConverting) return

  setConverting(true)
  convertStartTime = Date.now()
  convertProgressSection.style.display = 'block'
  convertProgressSection.classList.remove('progress-done')
  convertResultSection.style.display = 'none'
  convertProgressFill.style.width = '0%'
  convertProgressText.textContent = '准备中...'
  convertProgressPercent.textContent = '0%'
  addConvertLog(`开始转换: ${dir} (${getConvertFormat().toUpperCase()}, 并发${concurrencySlider.value})`, 'info')

  const result = await window.yuqueAPI.startConvert(dir, getConvertFormat(), parseInt(concurrencySlider.value))

  setConverting(false)

  if (result.success) {
    convertResultPath = result.path
    convertResultSection.style.display = 'flex'
    convertResultSection.className = 'result-section'
    const elapsed = Date.now() - convertStartTime
    const elapsedText = formatElapsed(elapsed)
    convertResultText.textContent = `✅ 转换完成! 成功 ${result.successCount} 个，失败 ${result.failCount} 个，耗时 ${elapsedText}`
    openConvertResultBtn.style.display = 'inline'
    addConvertLog(`转换完成! 耗时 ${elapsedText}`, 'success')
    // 进度条变为完成状态，3秒后淡出
    convertProgressSection.classList.add('progress-done')
    convertProgressText.textContent = '✅ 转换完成'
    setTimeout(() => { convertProgressSection.style.display = 'none' }, 3000)
  } else {
    convertResultSection.style.display = 'flex'
    convertResultSection.className = 'result-section error'
    convertResultText.textContent = `❌ ${result.error}`
    openConvertResultBtn.style.display = 'none'
    addConvertLog(`错误: ${result.error}`, 'error')
    convertProgressSection.style.display = 'none'
  }
})

// 取消转换
convertCancelBtn.addEventListener('click', async () => {
  if (!isConverting) return
  await window.yuqueAPI.cancelConvert()
  setConverting(false)
  addConvertLog('已取消转换', 'error')
})

// 打开转换结果目录
openConvertResultBtn.addEventListener('click', () => {
  if (convertResultPath) {
    window.yuqueAPI.openDirectory(convertResultPath)
  }
})

// 监听转换进度
window.yuqueAPI.onConvertProgress((data) => {
  const percent = Math.round((data.current / data.total) * 100)
  convertProgressFill.style.width = `${percent}%`
  convertProgressText.textContent = `${data.title} (${data.current}/${data.total})`
  convertProgressPercent.textContent = `${percent}%`
})

// 监听转换日志
window.yuqueAPI.onConvertLog((msg) => {
  const type = msg.startsWith('✓') ? 'success' : msg.startsWith('✗') ? 'error' : 'info'
  addConvertLog(msg, type)
})

// ========== 工具函数 ==========
function formatElapsed(ms) {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec} 秒`
  const min = Math.floor(sec / 60)
  const remainSec = sec % 60
  return `${min} 分 ${remainSec} 秒`
}
