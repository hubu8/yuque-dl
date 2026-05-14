const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')
const { fork } = require('child_process')
const axios = require('axios')
const license = require('./license')

// ============ 参数配置持久化 ============
const CONFIG_FILE = path.join(app.getPath('userData'), 'download-config.json')

function getDefaultConfig() {
  return {
    url: '',
    distDir: path.join(app.getPath('documents'), 'yuque-download'),
    token: '',
    key: '_yuque_session',
    ignoreImg: false,
    ignoreAttachments: false,
    toc: false,
    incremental: false,
    convertMarkdownVideoLinks: false,
    hideFooter: true
  }
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
      return { ...getDefaultConfig(), ...JSON.parse(content) }
    }
  } catch (err) {
    console.error('读取配置文件失败:', err)
  }
  return getDefaultConfig()
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
    return true
  } catch (err) {
    console.error('保存配置文件失败:', err)
    return false
  }
}

// ============ 文档数量检测相关常量与函数 ============
const DEFAULT_COOKIE_KEY = '_yuque_session'

const ARTICLE_TOC_TYPE = {
  TITLE: 'title',
  LINK: 'link',
  DOC: 'doc'
}

const ARTICLE_CONTENT_TYPE = {
  BOARD: 'board',
  TABLE: 'table',
  SHEET: 'sheet',
  DOC: 'doc'
}

function getHeaders(params) {
  const { key = DEFAULT_COOKIE_KEY, token } = params
  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
  if (token) headers.cookie = `${key}=${token};`
  return headers
}

function genCommonOptions(params) {
  return {
    headers: getHeaders(params),
    beforeRedirect: (options) => {
      options.headers = {
        ...(options?.headers || {}),
        ...getHeaders(params)
      }
    }
  }
}

async function getKnowledgeBaseInfo(url, headerParams) {
  const knowledgeBaseReg = /decodeURIComponent\("(.+)"\)\);/m
  const { data: html, status } = await axios.get(url, genCommonOptions(headerParams))
  if (status !== 200 || !html) return {}
  const match = knowledgeBaseReg.exec(html)
  if (!match || !match[1]) return {}
  const jsonData = JSON.parse(decodeURIComponent(match[1]))
  if (!jsonData.book) return {}
  return {
    bookId: jsonData.book.id,
    bookName: jsonData.book.name,
    tocList: jsonData.book.toc || []
  }
}

function countDocs(tocList) {
  let docCount = 0
  for (const item of tocList) {
    if (typeof item.type !== 'string') continue
    const itemType = item.type.toLowerCase()
    if (itemType === ARTICLE_TOC_TYPE.TITLE || item['child_uuid'] !== '' || itemType === ARTICLE_TOC_TYPE.LINK) {
      if (itemType === ARTICLE_CONTENT_TYPE.DOC) {
        docCount++
      }
    } else if (item.url) {
      docCount++
    }
  }
  return docCount
}

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    title: '语雀知识库下载器',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.setMenuBarVisibility(false)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 选择目录
ipcMain.handle('select-directory', async (_, currentDir) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: currentDir || app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// 获取默认下载路径
ipcMain.handle('get-default-download-path', () => {
  return path.join(app.getPath('documents'), 'yuque-download')
})

// 读取下载配置
ipcMain.handle('get-download-config', () => {
  return readConfig()
})

// 保存下载配置
ipcMain.handle('save-download-config', (_, config) => {
  return saveConfig(config)
})

// 打开目录
ipcMain.handle('open-directory', async (_, dirPath) => {
  shell.openPath(dirPath)
})

// 开始下载
let downloadProcess = null

ipcMain.handle('start-download', async (_, params) => {
  if (downloadProcess) {
    downloadProcess.kill()
    downloadProcess = null
  }

  // 30 分钟超时保护，避免 Promise 永久挂起
  const DOWNLOAD_TIMEOUT = 30 * 60 * 1000
  let resolved = false

  return new Promise((resolve) => {
    const safeResolve = (value) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve(value)
    }

    const timer = setTimeout(() => {
      if (downloadProcess) {
        downloadProcess.kill()
        downloadProcess = null
      }
      safeResolve({ success: false, error: '下载超时（30分钟），请检查网络后重试' })
    }, DOWNLOAD_TIMEOUT)

    downloadProcess = fork(path.join(__dirname, 'worker.js'), [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    })

    downloadProcess.send(params)

    downloadProcess.on('message', (msg) => {
      if (msg.type === 'progress') {
        mainWindow.webContents.send('download-progress', msg.data)
      } else if (msg.type === 'log') {
        mainWindow.webContents.send('download-log', msg.data)
      } else if (msg.type === 'doc-count') {
        mainWindow.webContents.send('download-doc-count', msg.data)
      } else if (msg.type === 'done') {
        safeResolve({ success: true, path: msg.data })
      } else if (msg.type === 'error') {
        safeResolve({ success: false, error: msg.data })
      }
    })

    downloadProcess.on('error', (err) => {
      safeResolve({ success: false, error: err.message })
    })

    downloadProcess.on('exit', (code) => {
      downloadProcess = null
      if (code !== 0 && code !== null) {
        safeResolve({ success: false, error: `进程异常退出 (code: ${code})` })
      }
    })
  })
})

ipcMain.handle('cancel-download', async () => {
  if (downloadProcess) {
    downloadProcess.kill()
    downloadProcess = null
    return true
  }
  return false
})

// 检测文档数量（不下载，仅获取信息并统计）
ipcMain.handle('check-doc-count', async (_, params) => {
  try {
    const { url, token, key } = params
    if (!url) {
      return { success: false, error: '请输入知识库 URL' }
    }

    const info = await getKnowledgeBaseInfo(url, { token, key })
    const { bookId, tocList, bookName } = info

    if (!bookId) {
      return { success: false, error: '未找到知识库 ID，请检查 URL 是否正确' }
    }
    if (!tocList || tocList.length === 0) {
      return { success: false, error: '知识库目录为空' }
    }

    const docCount = countDocs(tocList)
    return { success: true, docCount, total: tocList.length, bookName }
  } catch (e) {
    return { success: false, error: e.message || '检测失败' }
  }
})

// ============ 授权相关 ============

// 检查激活状态
ipcMain.handle('license-check', async () => {
  return license.checkActivation(app.getPath('userData'))
})

// 定时复检授权（每 10 分钟），防止不关闭软件绕过过期
setInterval(() => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const status = license.checkActivation(app.getPath('userData'))
  if (!status.activated) {
    mainWindow.webContents.send('license-expired', status)
  }
}, 10 * 60 * 1000)

// 激活授权码
ipcMain.handle('license-activate', async (_, licenseKey) => {
  const machineId = license.generateMachineId()
  const result = license.validateLicense(machineId, licenseKey)
  if (result.valid) {
    if (result.expired) {
      return { success: false, error: `授权码已过期（${license.checkActivation(app.getPath('userData')).expireText || '已过期'}）` }
    }
    license.saveLicense(app.getPath('userData'), machineId, licenseKey, result.expireAt)
    return { success: true, expireText: result.expireAt === 0 ? '永久有效' : new Date(result.expireAt).toLocaleString('zh-CN') }
  }
  return { success: false, error: '授权码无效，请检查后重试' }
})

// 复制机器码到剪贴板
ipcMain.handle('license-copy-machine-id', async () => {
  const machineId = license.generateMachineId()
  clipboard.writeText(machineId)
  return machineId
})

// 清除授权
ipcMain.handle('license-clear', async () => {
  license.clearLicense(app.getPath('userData'))
  return { success: true }
})

// ============ 预览服务（主进程内运行） ============
const previewServer = require('./preview-server')
let previewPort = null
let previewRootPath = null

ipcMain.handle('preview-start', async (_, rootPath) => {
  // 如果目录变了，自动重启服务
  if (previewPort && previewRootPath === rootPath) {
    return { success: true, port: previewPort }
  }
  if (previewPort) {
    previewServer.stop()
    previewPort = null
    previewRootPath = null
  }

  try {
    const port = await previewServer.start(rootPath, 18888)
    previewPort = port
    previewRootPath = rootPath
    return { success: true, port }
  } catch (err) {
    return { success: false, error: err.message || String(err) }
  }
})

ipcMain.handle('preview-stop', async () => {
  previewServer.stop()
  previewPort = null
  previewRootPath = null
  return true
})

ipcMain.handle('preview-open', async (_, url) => {
  shell.openExternal(url)
})

// 选择预览目录
ipcMain.handle('select-preview-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择已下载的知识库目录'
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// 退出时清理预览服务
app.on('before-quit', () => {
  previewServer.stop()
})

// ============ Markdown 格式转换 (PDF / Word) ============
const { marked } = require('marked')
const os = require('os')

// 转换专用的 parse 函数，不使用 preview-server 设置的 highlight 配置
function convertParse(mdContent) {
  return marked.parse(mdContent, { highlight: null })
}

let convertCancelled = false

// 选择转换目录
ipcMain.handle('select-convert-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择已下载的知识库目录'
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// 递归获取所有 .md 文件
function getAllMdFiles(dir, baseDir) {
  const files = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...getAllMdFiles(fullPath, baseDir))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push({
        fullPath,
        relativePath: path.relative(baseDir, fullPath)
      })
    }
  }
  return files
}

// 将单个 md 文件转为 Word (.docx)
async function convertMdToWord(mdFilePath, wordFilePath) {
  const mdContent = fs.readFileSync(mdFilePath, 'utf-8')
  const htmlBody = convertParse(mdContent)

  // 生成 Word 可识别的 HTML 文档 (MHTML 格式)
  const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  body { font-family: "Microsoft YaHei", "SimSun", sans-serif; padding: 20px; line-height: 1.8; color: #333; }
  h1,h2,h3,h4,h5,h6 { margin-top: 1.2em; margin-bottom: 0.6em; color: #1a1a1a; }
  h1 { font-size: 22pt; border-bottom: 1px solid #eee; padding-bottom: 6px; }
  h2 { font-size: 16pt; }
  h3 { font-size: 13pt; }
  p { margin: 0.8em 0; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; font-family: Consolas, monospace; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: 0.5em 1em; color: #666; background: #f9f9f9; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  img { max-width: 100%; height: auto; }
  a { color: #0366d6; text-decoration: none; }
  ul, ol { padding-left: 2em; }
  li { margin: 0.3em 0; }
  hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
</style>
</head>
<body>${htmlBody}</body>
</html>`

  // 确保输出目录存在
  fs.mkdirSync(path.dirname(wordFilePath), { recursive: true })
  fs.writeFileSync(wordFilePath, wordHtml, 'utf-8')
}

// PDF 样式模板
const PDF_STYLE = `
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif; padding: 40px; line-height: 1.8; color: #333; max-width: 800px; margin: 0 auto; }
  h1,h2,h3,h4,h5,h6 { margin-top: 1.2em; margin-bottom: 0.6em; color: #1a1a1a; }
  h1 { font-size: 24px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
  h2 { font-size: 20px; }
  h3 { font-size: 16px; }
  p { margin: 0.8em 0; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: 0.5em 1em; color: #666; background: #f9f9f9; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  img { max-width: 100%; height: auto; }
  a { color: #0366d6; text-decoration: none; }
  ul, ol { padding-left: 2em; }
  li { margin: 0.3em 0; }
  hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
`

// 并发数
const PDF_CONCURRENCY = 3
const WORD_CONCURRENCY = 8

// BrowserWindow 对象池
class PdfWindowPool {
  constructor(size) {
    this.size = size
    this.pool = []     // 空闲窗口
    this.waiting = []  // 等待队列
  }

  init() {
    for (let i = 0; i < this.size; i++) {
      this.pool.push(this._createWindow())
    }
  }

  _createWindow() {
    const win = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: { offscreen: true }
    })
    win.webContents.setMaxListeners(20)
    return win
  }

  acquire() {
    if (this.pool.length > 0) {
      return Promise.resolve(this.pool.pop())
    }
    return new Promise(resolve => {
      this.waiting.push(resolve)
    })
  }

  release(win) {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()
      resolve(win)
    } else {
      this.pool.push(win)
    }
  }

  destroyAll() {
    for (const win of this.pool) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.pool = []
    this.waiting = []
  }
}

// 将单个 md 文件转为 PDF（使用池中的窗口）
// 临时文件目录
const TEMP_DIR = path.join(os.tmpdir(), 'yuque-dl-convert')

async function convertMdToPdf(mdFilePath, pdfFilePath, pool) {
  const mdContent = fs.readFileSync(mdFilePath, 'utf-8')
  const htmlBody = convertParse(mdContent)
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PDF_STYLE}</style></head><body>${htmlBody}</body></html>`

  fs.mkdirSync(path.dirname(pdfFilePath), { recursive: true })
  // 写入临时 HTML 文件，避免 data URL 长度限制
  fs.mkdirSync(TEMP_DIR, { recursive: true })
  const tempFile = path.join(TEMP_DIR, `pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.html`)
  fs.writeFileSync(tempFile, htmlContent, 'utf-8')

  const win = await pool.acquire()
  try {
    await new Promise((resolve, reject) => {
      const onLoad = () => { win.webContents.removeListener('did-fail-load', onFail); resolve() }
      const onFail = (_, code, desc) => { win.webContents.removeListener('did-finish-load', onLoad); reject(new Error(`加载失败: ${desc}`)) }
      win.webContents.once('did-finish-load', onLoad)
      win.webContents.once('did-fail-load', onFail)
      win.loadFile(tempFile)
    })
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    })
    fs.writeFileSync(pdfFilePath, pdfBuffer)
  } finally {
    pool.release(win)
    // 清理临时文件
    try { fs.unlinkSync(tempFile) } catch {}
  }
}

// 并发控制器
async function runWithConcurrency(tasks, concurrency) {
  const results = []
  let index = 0

  async function runNext() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => runNext())
  await Promise.all(workers)
  return results
}

// 开始转换
ipcMain.handle('start-convert', async (_, dirPath, format, userConcurrency) => {
  convertCancelled = false
  const outputFormat = format || 'pdf'
  const outputExt = outputFormat === 'word' ? '.doc' : '.pdf'
  const dirSuffix = outputFormat === 'word' ? '_word' : '_pdf'
  const concurrency = Math.max(1, Math.min(10, userConcurrency || (outputFormat === 'word' ? WORD_CONCURRENCY : PDF_CONCURRENCY)))

  let pool = null

  try {
    // 获取所有 md 文件
    const mdFiles = getAllMdFiles(dirPath, dirPath)
    if (mdFiles.length === 0) {
      return { success: false, error: '未找到 Markdown 文件' }
    }

    // 生成输出目录: 同级目录下创建 xxx_pdf 或 xxx_word 文件夹
    const dirName = path.basename(dirPath)
    const parentDir = path.dirname(dirPath)
    const outputDir = path.join(parentDir, dirName + dirSuffix)
    fs.mkdirSync(outputDir, { recursive: true })

    mainWindow.webContents.send('convert-log', `找到 ${mdFiles.length} 个 Markdown 文件`)
    mainWindow.webContents.send('convert-log', `输出格式: ${outputFormat.toUpperCase()}`)
    mainWindow.webContents.send('convert-log', `并发数: ${concurrency}`)
    mainWindow.webContents.send('convert-log', `输出目录: ${outputDir}`)

    // PDF 模式: 初始化窗口池
    if (outputFormat === 'pdf') {
      pool = new PdfWindowPool(concurrency)
      pool.init()
    }

    let successCount = 0
    let failCount = 0
    let doneCount = 0

    // 构建任务列表
    const tasks = mdFiles.map((mdFile, i) => async () => {
      if (convertCancelled) return

      const outRelPath = mdFile.relativePath.replace(/\.md$/i, outputExt)
      const outFilePath = path.join(outputDir, outRelPath)

      try {
        if (outputFormat === 'word') {
          await convertMdToWord(mdFile.fullPath, outFilePath)
        } else {
          await convertMdToPdf(mdFile.fullPath, outFilePath, pool)
        }
        successCount++
        mainWindow.webContents.send('convert-log', `✓ ${mdFile.relativePath}`)
      } catch (err) {
        failCount++
        mainWindow.webContents.send('convert-log', `✗ ${mdFile.relativePath}: ${err.message}`)
      }

      doneCount++
      mainWindow.webContents.send('convert-progress', {
        current: doneCount,
        total: mdFiles.length,
        title: mdFile.relativePath
      })
    })

    // 并发执行
    await runWithConcurrency(tasks, concurrency)

    if (convertCancelled) {
      mainWindow.webContents.send('convert-log', '✗ 转换已取消')
      return { success: false, error: '用户取消' }
    }

    mainWindow.webContents.send('convert-log', `转换完成: 成功 ${successCount}, 失败 ${failCount}`)
    return { success: true, path: outputDir, successCount, failCount }
  } catch (err) {
    return { success: false, error: err.message || String(err) }
  } finally {
    // 清理窗口池
    if (pool) pool.destroyAll()
  }
})

ipcMain.handle('cancel-convert', async () => {
  convertCancelled = true
  return true
})
