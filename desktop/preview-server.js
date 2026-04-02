/**
 * 轻量 Markdown 预览服务器
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.md': 'text/html; charset=utf-8',
}
const IGNORE = new Set(['.vitepress', 'img', 'progress.json', 'attachments', 'node_modules'])

let server = null

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function renderMarkdown(md) {
  let h = esc(md)
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
  h = h.replace(/^###### (.+)$/gm, '<h6>$1</h6>')
  h = h.replace(/^##### (.+)$/gm, '<h5>$1</h5>')
  h = h.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
  h = h.replace(/\[([^\]]+)\]\(\.\/([^)]+)\.md\)/g, '<a href="/$2.md">$1</a>')
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>')
  h = h.replace(/^- (.+)$/gm, '<li>$1</li>')
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
  h = h.replace(/^---$/gm, '<hr>')
  h = h.replace(/^(?!<[hluobpi]|<hr|<pre|<img|<a )(.+)$/gm, '<p>$1</p>')
  return h
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

  // 根目录始终渲染，子目录即使为空也显示文件夹
  if (depth > 0 && mdFiles.length === 0 && dirs.length === 0 && !items.includes('index.md')) {
    return '<ul class="nav-list"><li class="nav-empty">（空）</li></ul>'
  }

  let html = '<ul class="nav-list">'

  // index.md
  if (items.includes('index.md')) {
    const lp = subDir ? `/${subDir}/index.md` : '/index.md'
    const cls = currentPath === lp ? ' class="active"' : ''
    html += `<li><a href="${encodeURI(lp)}"${cls}>📄 目录索引</a></li>`
  }

  // 子目录优先显示（文件夹在前）
  for (const d of dirs) {
    const sub = subDir ? `${subDir}/${d}` : d
    const children = buildSidebar(rootPath, sub, currentPath, depth + 1)
    const subPrefix = `/${sub}/`
    // 前两层默认展开，或者当前页面在此目录下时展开
    const isOpen = depth < 1 || currentPath.startsWith(subPrefix) ? ' open' : ''
    html += `<li class="nav-dir">`
    html += `<details${isOpen}><summary>📁 ${esc(d)}</summary>${children}</details>`
    html += `</li>`
  }

  // md 文件
  for (const f of mdFiles) {
    const lp = subDir ? `/${subDir}/${f}` : `/${f}`
    const name = f.replace(/\.md$/, '')
    const cls = currentPath === decodeURIComponent(lp) ? ' class="active"' : ''
    html += `<li><a href="${encodeURI(lp)}"${cls}>${esc(name)}</a></li>`
  }

  html += '</ul>'
  return html
}

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
:root { --bg:#ffffff; --sidebar-bg:#f8f9fb; --border:#e8e8ec; --text:#1d2129; --text2:#4e5969; --text3:#86909c; --accent:#165dff; --accent-bg:#e8f3ff; --code-bg:#f4f5f7; --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; --mono: "Cascadia Code", "Fira Code", Consolas, monospace; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; font-family:var(--font); color:var(--text); background:var(--bg); }
body { display:flex; }

/* 侧边栏 */
.sidebar { width:280px; background:var(--sidebar-bg); border-right:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0; height:100vh; }
.sidebar-header { padding:16px 20px; border-bottom:1px solid var(--border); }
.sidebar-header h2 { font-size:14px; color:var(--text); font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sidebar-body { flex:1; overflow-y:auto; padding:8px 0; }

.nav-list { list-style:none; }
.nav-list a { display:block; padding:5px 16px 5px 20px; font-size:13px; color:var(--text2); text-decoration:none; line-height:1.6; border-left:2px solid transparent; transition: all 0.15s; }
.nav-list a:hover { color:var(--accent); background:var(--accent-bg); }
.nav-list a.active { color:var(--accent); font-weight:600; background:var(--accent-bg); border-left-color:var(--accent); }

/* 子目录折叠 */
.nav-dir details summary { display:flex; align-items:center; padding:6px 16px 6px 20px; font-size:12px; font-weight:600; color:var(--text3); cursor:pointer; user-select:none; list-style:none; }
.nav-dir details summary::-webkit-details-marker { display:none; }
.nav-dir details summary::before { content:'▶'; font-size:9px; margin-right:6px; transition:transform 0.2s; color:var(--text3); }
.nav-dir details[open] summary::before { transform:rotate(90deg); }
.nav-dir details > .nav-list { padding-left:12px; }

/* 侧边栏滚动条 */
.sidebar-body::-webkit-scrollbar { width:4px; }
.sidebar-body::-webkit-scrollbar-thumb { background:#d0d5dd; border-radius:2px; }

/* 主内容 */
.main-wrap { flex:1; overflow-y:auto; display:flex; justify-content:center; }
.main { width:100%; max-width:820px; padding:36px 48px 60px; }

.main h1 { font-size:26px; margin:0 0 20px; padding-bottom:12px; border-bottom:2px solid var(--border); color:var(--text); }
.main h2 { font-size:20px; margin:32px 0 12px; padding-bottom:8px; border-bottom:1px solid #f0f0f0; color:var(--text); }
.main h3 { font-size:17px; margin:24px 0 8px; color:var(--text); }
.main h4 { font-size:15px; margin:20px 0 6px; color:var(--text2); }
.main p { margin:10px 0; line-height:1.85; font-size:15px; color:var(--text); }
.main a { color:var(--accent); text-decoration:none; }
.main a:hover { text-decoration:underline; }
.main img { border-radius:8px; margin:12px 0; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
.main pre { background:var(--code-bg); padding:16px 20px; border-radius:8px; overflow-x:auto; margin:14px 0; font-size:13px; line-height:1.7; font-family:var(--mono); border:1px solid var(--border); }
.main code { background:var(--code-bg); padding:2px 6px; border-radius:4px; font-size:13px; font-family:var(--mono); color:#c7254e; }
.main pre code { background:none; padding:0; color:var(--text); }
.main blockquote { border-left:3px solid var(--accent); padding:10px 18px; margin:14px 0; color:var(--text2); background:#f8f9fb; border-radius:0 6px 6px 0; font-size:14px; }
.main li { margin:4px 0 4px 22px; line-height:1.8; font-size:15px; }
.main hr { border:none; border-top:1px solid var(--border); margin:24px 0; }
.main table { border-collapse:collapse; margin:14px 0; width:100%; }
.main th, .main td { border:1px solid var(--border); padding:10px 14px; font-size:14px; text-align:left; }
.main th { background:var(--sidebar-bg); font-weight:600; color:var(--text2); }
.main strong { color:var(--text); }

/* 主内容滚动条 */
.main-wrap::-webkit-scrollbar { width:5px; }
.main-wrap::-webkit-scrollbar-thumb { background:#d0d5dd; border-radius:3px; }

/* 响应式 */
@media (max-width: 768px) {
  .sidebar { width:220px; }
  .main { padding:24px 20px 40px; }
}
</style>
</head>
<body>
<div class="sidebar">
  <div class="sidebar-header"><h2>📚 ${esc(bookName)}</h2></div>
  <div class="sidebar-body">${sidebar}</div>
</div>
<div class="main-wrap"><div class="main">${body}</div></div>
</body></html>`
}

function startServer(rootPath, port) {
  if (server) { server.close(); server = null }

  server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0])
    if (urlPath === '/') urlPath = '/index.md'

    const filePath = path.join(rootPath, urlPath)
    const ext = path.extname(filePath).toLowerCase()

    if (ext === '.md') {
      try {
        const md = fs.readFileSync(filePath, 'utf-8')
        const title = (md.match(/^# (.+)$/m) || ['', path.basename(filePath, '.md')])[1]
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
    process.send({ type: 'started', data: { port } })
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      startServer(rootPath, port + 1)
    } else {
      process.send({ type: 'error', data: err.message })
    }
  })
}

process.on('message', (msg) => {
  if (msg.action === 'start') {
    startServer(msg.rootPath, msg.port || 18888)
  } else if (msg.action === 'stop') {
    if (server) { server.close(); server = null }
    process.send({ type: 'stopped' })
  }
})
