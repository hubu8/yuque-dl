/**
 * 下载工作进程
 * 在子进程中运行，通过 IPC 与主进程通信
 */
const path = require('path')
const axios = require('axios')
const { mkdirSync, existsSync, writeFileSync, readFileSync } = require('fs')
const { mkdir, writeFile, readFile } = require('fs/promises')
const crypto = require('crypto')

// ============ 常量 ============
const DEFAULT_COOKIE_KEY = '_yuque_session'
const DEFAULT_DOMAIN = 'https://www.yuque.com'
const IMAGE_SING_KEY = 'UXO91eVnUveQn8suOJaYMvBcWs9KptS8N5HoP8ezSeU4vqApZpy1CkPaTpkpQEx2W2mlhxL8zwS8UePwBgksUM0CTtAODbTTTDFD'

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

// ============ 工具函数 ============
function sendLog(msg) {
  process.send({ type: 'log', data: msg })
}

function sendProgress(data) {
  process.send({ type: 'progress', data })
}

function fixPath(str) {
  if (!str) return str
  return str.replace(/[\\/:*?"<>|]/g, '_').trim()
}

function isValidUrl(url) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
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

// ============ API ============
async function getKnowledgeBaseInfo(url, headerParams) {
  const knowledgeBaseReg = /decodeURIComponent\("(.+)"\)\);/m
  const { data: html, status } = await axios.get(url, genCommonOptions(headerParams))
  if (status !== 200 || !html) return {}
  const match = knowledgeBaseReg.exec(html)
  if (!match || !match[1]) return {}
  const jsonData = JSON.parse(decodeURIComponent(match[1]))
  if (!jsonData.book) return {}
  const info = {
    bookId: jsonData.book.id,
    bookSlug: jsonData.book.slug,
    bookName: jsonData.book.name,
    bookDesc: jsonData.book.description,
    tocList: jsonData.book.toc || [],
    host: jsonData.space?.host,
    imageServiceDomains: jsonData.imageServiceDomains || []
  }
  return info
}

async function getDocsMdData(params, isMd = true) {
  const { articleUrl, bookId, token, host, key } = params
  const domain = host || DEFAULT_DOMAIN
  const mode = isMd ? '&mode=markdown' : ''
  const apiUrl = `${domain}/api/docs/${articleUrl}?book_id=${bookId}&merge_dynamic_data=false${mode}`
  try {
    const { data, status } = await axios.get(apiUrl, genCommonOptions({ token, key }))
    return { apiUrl, httpStatus: status, response: data }
  } catch (e) {
    return { apiUrl, httpStatus: e?.response?.status || 0 }
  }
}

// ============ 下载核心逻辑 ============
async function downloadArticle(articleInfo, options) {
  const { bookId, itemUrl, savePath, saveFilePath, articleTitle, host } = articleInfo
  const { token, key, hideFooter } = options
  const { httpStatus, apiUrl, response } = await getDocsMdData({
    articleUrl: itemUrl, bookId, token, host, key
  })

  const contentType = response?.data?.type?.toLowerCase()

  if (['board', 'table'].includes(contentType)) {
    throw new Error(`暂不支持"${contentType}"类型的文档`)
  }

  let mdData = ''
  if (typeof response?.data?.sourcecode === 'string') {
    mdData = response.data.sourcecode
  } else if (contentType === 'sheet') {
    // 简化处理 sheet 类型
    mdData = `> 表格类型文档，请在语雀中查看\n\n原文链接: ${articleInfo.articleUrl}`
  } else {
    throw new Error(`下载文章失败: ${apiUrl}, HTTP ${httpStatus}`)
  }

  // 添加页脚
  if (!hideFooter) {
    const updateTime = response?.data?.content_updated_at || ''
    const footer = `\n\n---\n> 原文地址: ${articleInfo.articleUrl}\n`
    mdData += footer
  }

  await mkdir(path.dirname(saveFilePath), { recursive: true })
  await writeFile(saveFilePath, mdData, 'utf-8')
  return true
}

async function runDownload(params) {
  const { url, distDir, token, key, ignoreImg, ignoreAttachments,
    toc, incremental, convertMarkdownVideoLinks, hideFooter } = params

  if (!isValidUrl(url)) throw new Error('请输入有效的语雀知识库 URL')

  sendLog('正在获取知识库信息...')
  const info = await getKnowledgeBaseInfo(url, { token, key })
  const { bookId, tocList, bookName, bookSlug, host } = info

  if (!bookId) throw new Error('未找到知识库 ID，请检查 URL 是否正确')
  if (!tocList || tocList.length === 0) throw new Error('知识库目录为空')

  sendLog(`知识库: ${bookName} (共 ${tocList.length} 篇)`)

  const bookPath = path.resolve(distDir, bookName ? fixPath(bookName) : String(bookId))
  await mkdir(bookPath, { recursive: true })

  const total = tocList.length
  let downloaded = 0
  let errCount = 0
  const errors = []
  const articleUrlPrefix = url.replace(new RegExp(`(.*?/${bookSlug}).*`), '$1')

  for (let i = 0; i < total; i++) {
    const item = tocList[i]
    if (typeof item.type !== 'string') continue
    const itemType = item.type.toLowerCase()

    // 目录类型或外链类型 - 创建文件夹
    if (itemType === ARTICLE_TOC_TYPE.TITLE || item['child_uuid'] !== '' || itemType === ARTICLE_TOC_TYPE.LINK) {
      if (itemType !== ARTICLE_TOC_TYPE.LINK) {
        const dirPath = path.join(bookPath, fixPath(item.title))
        await mkdir(dirPath, { recursive: true })
      }
      downloaded++
      sendProgress({ current: downloaded, total, title: item.title })
      if (itemType !== ARTICLE_CONTENT_TYPE.DOC) continue
    }

    // 文档类型 - 下载
    if (item.url) {
      const savePath = bookPath
      const saveFilePath = path.join(bookPath, `${fixPath(item.title)}.md`)
      const articleUrl = `${articleUrlPrefix}/${item.url}`

      try {
        await downloadArticle({
          bookId, itemUrl: item.url, savePath, saveFilePath,
          uuid: item.uuid, articleTitle: item.title,
          articleUrl, host, imageServiceDomains: info.imageServiceDomains || []
        }, { token, key, ignoreImg, ignoreAttachments, toc,
          convertMarkdownVideoLinks, hideFooter, distDir, incremental })

        sendLog(`✓ ${item.title}`)
      } catch (e) {
        errCount++
        errors.push({ title: item.title, error: e.message })
        sendLog(`✗ ${item.title}: ${e.message}`)
      }

      downloaded++
      sendProgress({ current: downloaded, total, title: item.title })
    }
  }

  // 生成 index.md 目录文件
  const summaryLines = [`# ${bookName}\n`]
  tocList.forEach(item => {
    if (item.type?.toLowerCase() === 'doc' && item.url) {
      summaryLines.push(`- [${item.title}](./${fixPath(item.title)}.md)`)
    }
  })
  await writeFile(path.join(bookPath, 'index.md'), summaryLines.join('\n'), 'utf-8')

  const msg = errCount > 0
    ? `完成! 成功 ${downloaded - errCount} 篇, 失败 ${errCount} 篇`
    : `全部完成! 共 ${downloaded} 篇`
  sendLog(msg)
  return bookPath
}

// ============ 进程消息处理 ============
process.on('message', async (params) => {
  try {
    const resultPath = await runDownload(params)
    process.send({ type: 'done', data: resultPath })
  } catch (e) {
    process.send({ type: 'error', data: e.message || '未知错误' })
  }
})
