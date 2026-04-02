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
  const articleUrlPrefix = url.replace(new RegExp(`(.*?/${bookSlug}).*`), '$1')

  // uuid → { pathTitleList, toc } 用于还原父子层级路径
  const uuidMap = new Map()

  for (let i = 0; i < total; i++) {
    const item = tocList[i]
    if (typeof item.type !== 'string') continue
    const itemType = item.type.toLowerCase()

    // ---- 目录类型 / 有子节点 / 外链 ----
    if (itemType === ARTICLE_TOC_TYPE.TITLE
      || item['child_uuid'] !== ''
      || itemType === ARTICLE_TOC_TYPE.LINK
    ) {
      // 通过 parent_uuid 向上回溯，构建完整路径
      let tempItem = item
      const pathTitleList = []
      while (tempItem) {
        pathTitleList.unshift(fixPath(tempItem.title))
        const parent = uuidMap.get(tempItem['parent_uuid'])
        tempItem = parent ? parent.toc : undefined
      }

      const progressItem = { pathTitleList, toc: item }

      if (itemType !== ARTICLE_TOC_TYPE.LINK) {
        await mkdir(path.join(bookPath, ...pathTitleList.map(fixPath)), { recursive: true })
      }

      // 即是文档也是目录 → 先建文件夹再下载文档
      if (itemType === ARTICLE_CONTENT_TYPE.DOC) {
        await docHandle(item)
      } else {
        uuidMap.set(item.uuid, progressItem)
        downloaded++
        sendProgress({ current: downloaded, total, title: item.title })
      }
      continue
    }

    // ---- 普通文档 ----
    if (item.url) {
      await docHandle(item)
    }
  }

  async function docHandle(item) {
    const itemType = item.type.toLowerCase()
    // 获取父级路径
    const parent = uuidMap.get(item['parent_uuid'])
    const parentPathList = parent ? parent.pathTitleList : []

    const fileName = fixPath(item.title)
    const pathTitleList = [...parentPathList, fileName]

    // 如果既是标题又是文档（有 child_uuid），文件存为 子目录/index.md
    let mdRelPath, saveRelDir
    if (itemType === ARTICLE_CONTENT_TYPE.DOC && item['child_uuid']) {
      mdRelPath = [...parentPathList, fileName, 'index.md'].map(fixPath).join(path.sep)
      saveRelDir = pathTitleList.map(fixPath).join(path.sep)
    } else {
      mdRelPath = [...parentPathList, `${fileName}.md`].map(fixPath).join(path.sep)
      saveRelDir = parentPathList.map(fixPath).join(path.sep)
    }

    const saveFilePath = path.resolve(bookPath, mdRelPath)
    const savePath = path.resolve(bookPath, saveRelDir)
    const articleUrl = `${articleUrlPrefix}/${item.url}`

    try {
      await downloadArticle({
        bookId, itemUrl: item.url, savePath, saveFilePath,
        uuid: item.uuid, articleTitle: item.title,
        articleUrl, host, imageServiceDomains: info.imageServiceDomains || []
      }, { token, key, ignoreImg, ignoreAttachments, toc,
        convertMarkdownVideoLinks, hideFooter, distDir, incremental })

      sendLog(`✓ ${parentPathList.length > 0 ? parentPathList.join('/') + '/' : ''}${item.title}`)
    } catch (e) {
      errCount++
      sendLog(`✗ ${item.title}: ${e.message}`)
    }

    uuidMap.set(item.uuid, { pathTitleList, toc: item })
    downloaded++
    sendProgress({ current: downloaded, total, title: item.title })
  }

  // 生成 index.md 目录文件
  const summaryLines = [`# ${bookName}\n`]
  for (const [uuid, info] of uuidMap) {
    if (info.toc.url && info.toc.type?.toLowerCase() === 'doc') {
      const relPath = info.pathTitleList.map(fixPath)
      const indent = '  '.repeat(Math.max(0, relPath.length - 1))
      const fileName = info.toc['child_uuid']
        ? relPath.join('/') + '/index.md'
        : relPath.slice(0, -1).concat(relPath.at(-1) + '.md').join('/')
      summaryLines.push(`${indent}- [${info.toc.title}](./${fileName})`)
    }
  }
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
