/**
 * Markdown 预览服务器 — 使用 marked + highlight.js
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const { marked } = require('marked')
const hljs = require('highlight.js')

const renderer = new marked.Renderer()
const _origCode = renderer.code.bind(renderer)
renderer.code = function(code, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try { return `<pre><code class="hljs language-${lang}">${hljs.highlight(code, { language: lang }).value}</code></pre>` } catch {}
  }
  try { return `<pre><code class="hljs">${hljs.highlightAuto(code).value}</code></pre>` } catch {}
  return _origCode(code, lang)
}

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer
})

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
}
const IGNORE = new Set(['.vitepress', 'img', 'progress.json', 'attachments', 'node_modules'])
let server = null

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function renderMarkdown(md) {
  // 把 .md 内链转成预览链接
  let processed = md.replace(/\]\(\.\/([^)]+)\.md\)/g, '](/$1.md)')
  return marked.parse(processed)
}

/** 递归构建树形侧边栏 */
function buildSidebar(rootPath, subDir, currentPath, depth) {
  if (depth === undefined) depth = 0
  const dirPath = path.join(rootPath, subDir)
  let items
  try { items = fs.readdirSync(dirPath) } catch { return '' }
  const filtered = items.filter(i => !IGNORE.has(i) && !i.startsWith('.'))

  const mdFiles = filtered.filter(i => i.endsWith('.md') && i !== 'index.md').sort()
  const dirs = filtered.filter(i => {
    try { return fs.statSync(path.join(dirPath, i)).isDirectory() } catch { return false }
  }).sort()

  if (depth > 0 && mdFiles.length === 0 && dirs.length === 0 && !items.includes('index.md')) {
    return ''
  }

  let html = '<ul class="nav-list">'

  if (items.includes('index.md')) {
    const lp = subDir ? `/${subDir}/index.md` : '/index.md'
    const cls = currentPath === lp ? ' class="active"' : ''
    html += `<li><a href="${encodeURI(lp)}"${cls}>📄 目录索引</a></li>`
  }

  for (const d of dirs) {
    const sub = subDir ? `${subDir}/${d}` : d
    const children = buildSidebar(rootPath, sub, currentPath, depth + 1)
    if (!children) continue
    const subPrefix = `/${sub}/`
    const isOpen = depth < 1 || currentPath.startsWith(subPrefix) ? ' open' : ''
    html += `<li class="nav-dir"><details${isOpen}><summary>📁 ${esc(d)}</summary>${children}</details></li>`
  }

  for (const f of mdFiles) {
    const lp = subDir ? `/${subDir}/${f}` : `/${f}`
    const name = f.replace(/\.md$/, '')
    const cls = currentPath === decodeURIComponent(lp) ? ' class="active"' : ''
    html += `<li><a href="${encodeURI(lp)}"${cls}>${esc(name)}</a></li>`
  }

  html += '</ul>'
  return html
}

// highlight.js CSS (github 主题)
const hljsCssPath = require.resolve('highlight.js/styles/github.css')
const hljsCss = fs.readFileSync(hljsCssPath, 'utf-8')

function buildPage(title, body, rootPath, currentPath) {
  const bookName = path.basename(rootPath)
  const sidebar = buildSidebar(rootPath, '', currentPath)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} - ${esc(bookName)}</title>
<style>
${hljsCss}

:root { --bg:#fff; --sidebar-bg:#f8f9fb; --border:#e8e8ec; --text:#1d2129; --text2:#4e5969; --text3:#86909c; --accent:#165dff; --accent-bg:#e8f3ff; --code-bg:#f6f8fa; --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; --mono: "Cascadia Code", "Fira Code", Consolas, monospace; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; font-family:var(--font); color:var(--text); background:var(--bg); }
body { display:flex; }

.sidebar { width:280px; background:var(--sidebar-bg); border-right:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0; height:100vh; }
.sidebar-header { padding:16px 20px; border-bottom:1px solid var(--border); background:#fff; }
.sidebar-header h2 { font-size:14px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sidebar-body { flex:1; overflow-y:auto; padding:8px 0; }
.nav-list { list-style:none; margin:0; padding:0; }
.nav-list a { display:block; padding:5px 14px 5px 12px; font-size:13px; color:var(--text2); text-decoration:none; line-height:1.6; border-radius:4px; margin:1px 8px; transition:all .15s; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.nav-list a:hover { color:var(--accent); background:var(--accent-bg); }
.nav-list a.active { color:var(--accent); font-weight:600; background:var(--accent-bg); }
.nav-empty { padding:4px 12px; font-size:12px; color:#c0c4cc; font-style:italic; }
.nav-dir { margin:0; }
.nav-dir details summary { display:flex; align-items:center; padding:6px 14px 6px 12px; font-size:13px; font-weight:600; color:var(--text); cursor:pointer; user-select:none; list-style:none; line-height:1.6; margin:1px 8px; border-radius:4px; }
.nav-dir details summary:hover { background:rgba(0,0,0,.04); }
.nav-dir details summary::-webkit-details-marker { display:none; }
.nav-dir details summary::before { content:''; width:0; height:0; border-left:5px solid var(--text3); border-top:4px solid transparent; border-bottom:4px solid transparent; margin-right:6px; transition:transform .15s; flex-shrink:0; }
.nav-dir details[open] summary::before { transform:rotate(90deg); }
.nav-dir details>.nav-list { margin-left:10px; padding-left:10px; border-left:1px solid #e0e2e6; }
.sidebar-body::-webkit-scrollbar { width:5px; }
.sidebar-body::-webkit-scrollbar-thumb { background:#d0d5dd; border-radius:3px; }
</style>
</head>
<body>
<div class="sidebar">
  <div class="sidebar-header"><h2>📚 ${esc(bookName)}</h2></div>
  <div class="sidebar-body">${sidebar}</div>
</div>
<div class="main-wrap"><article class="md-body">${body}</article></div>
</body></html>`
}

// 注入文章区域样式（在 </head> 前追加）
const articleCss = `
<style>
.main-wrap { flex:1; overflow-y:auto; display:flex; justify-content:center; background:var(--bg); }
.md-body { width:100%; max-width:860px; padding:40px 52px 80px; font-size:15px; line-height:1.85; color:var(--text); }
.md-body h1 { font-size:28px; margin:0 0 20px; padding-bottom:12px; border-bottom:2px solid var(--border); }
.md-body h2 { font-size:22px; margin:36px 0 14px; padding-bottom:8px; border-bottom:1px solid #f0f0f0; }
.md-body h3 { font-size:18px; margin:28px 0 10px; }
.md-body h4 { font-size:16px; margin:22px 0 8px; color:var(--text2); }
.md-body h5, .md-body h6 { font-size:14px; margin:18px 0 6px; color:var(--text3); }
.md-body p { margin:12px 0; }
.md-body a { color:var(--accent); text-decoration:none; }
.md-body a:hover { text-decoration:underline; }
.md-body img { max-width:100%; border-radius:8px; margin:14px 0; box-shadow:0 2px 12px rgba(0,0,0,.06); }
.md-body pre { background:var(--code-bg); padding:16px 20px; border-radius:8px; overflow-x:auto; margin:16px 0; font-size:13px; line-height:1.7; font-family:var(--mono); border:1px solid var(--border); }
.md-body code { background:var(--code-bg); padding:2px 6px; border-radius:4px; font-size:13px; font-family:var(--mono); color:#c7254e; }
.md-body pre code { background:none; padding:0; color:inherit; font-size:inherit; }
.md-body blockquote { border-left:4px solid var(--accent); padding:12px 20px; margin:16px 0; color:var(--text2); background:#f8f9fb; border-radius:0 6px 6px 0; }
.md-body blockquote p { margin:4px 0; }
.md-body ul, .md-body ol { padding-left:24px; margin:12px 0; }
.md-body li { margin:6px 0; line-height:1.8; }
.md-body li > ul, .md-body li > ol { margin:4px 0; }
.md-body hr { border:none; border-top:1px solid var(--border); margin:28px 0; }
.md-body table { border-collapse:collapse; margin:16px 0; width:100%; display:block; overflow-x:auto; }
.md-body th, .md-body td { border:1px solid var(--border); padding:10px 14px; font-size:14px; text-align:left; }
.md-body th { background:var(--sidebar-bg); font-weight:600; color:var(--text2); }
.md-body tr:hover td { background:#fafbfc; }
.md-body input[type="checkbox"] { margin-right:6px; }
.md-body del { color:var(--text3); }
.main-wrap::-webkit-scrollbar { width:5px; }
.main-wrap::-webkit-scrollbar-thumb { background:#d0d5dd; border-radius:3px; }
@media (max-width:768px) { .sidebar { width:220px; } .md-body { padding:24px 20px 40px; } }
</style>
`

// 把额外样式注入到 buildPage 输出中
const _buildPage = buildPage
buildPage = function(title, body, rootPath, currentPath) {
  return _buildPage(title, body, rootPath, currentPath).replace('</head>', articleCss + '</head>')
}

function startServer(rootPath, port) {
  return new Promise((resolve, reject) => {
    if (server) { server.close(); server = null }

    server = http.createServer((req, res) => {

      let urlPath = decodeURIComponent(req.url.split('?')[0])
      if (urlPath === '/') urlPath = '/index.md'

      const filePath = path.resolve(path.join(rootPath, urlPath))
      if (!filePath.startsWith(path.resolve(rootPath) + path.sep) && filePath !== path.resolve(rootPath)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Forbidden')
        return
      }
      const ext = path.extname(filePath).toLowerCase()

      if (ext === '.md') {
        try {
          const md = fs.readFileSync(filePath, 'utf-8')
          const titleMatch = md.match(/^# (.+)$/m)
          const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md')
          const body = renderMarkdown(md)
          const html = buildPage(title, body, rootPath, urlPath)
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(html)
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(buildPage('404', '<h1>页面未找到</h1><p>请检查文件路径是否正确</p>', rootPath, ''))
        }
        return
      }

      try {
        const data = fs.readFileSync(filePath)
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
        res.end(data)
      } catch {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    server.listen(port, '127.0.0.1', () => {
      resolve(port)
    })

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        server = null
        startServer(rootPath, port + 1).then(resolve).catch(reject)
      } else {
        reject(err)
      }
    })
  })
}

function stopServer() {
  if (server) { server.close(); server = null }
}

module.exports = {
  start: startServer,
  stop: stopServer
}
