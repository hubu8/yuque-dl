/**
 * 下载工作进程
 * 在子进程中运行，通过 IPC 与主进程通信
 */
const path = require('path')
const fs = require('fs')
const { mkdirSync, existsSync } = require('fs')
const { mkdir, writeFile, readFile } = require('fs/promises')
const stream = require('stream')
const { promisify } = require('util')
const { createWriteStream } = require('fs')
const axios = require('axios')
const pako = require('pako')
const mdImg = require('pull-md-img')
const mdToc = require('markdown-toc')
const { fromMarkdown } = require('mdast-util-from-markdown')
const { toMarkdown } = require('mdast-util-to-markdown')

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

function removeEmojis(str) {
  return str.replace(/[\ud800-\udbff][\udc00-\udfff]/g, '')
}

function fixPath(dirPath) {
  if (!dirPath) return ''
  const dirNameReg = /[\\/:*?"<>|\n\r]/g
  return removeEmojis(dirPath.replace(dirNameReg, '_').replace(/\s/g, ''))
}

function isValidUrl(url) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function pad(num) {
  return num.toString().padStart(2, '0')
}

function formateDate(d) {
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`
}

function isValidDate(date) {
  return date instanceof Date && !isNaN(date.getTime())
}

function getMarkdownImageList(mdStr) {
  if (!mdStr) return []
  const mdImgReg = /!\[(.*?)\]\((.*?)\)/gm
  let list = Array.from(mdStr.match(mdImgReg) || [])
  list = list
    .map((itemUrl) => {
      itemUrl = itemUrl.replace(mdImgReg, '$2')
      if (!/^http.*/g.test(itemUrl)) return ''
      return itemUrl
    })
    .filter((url) => Boolean(url))
  return list
}

// ============ HTTP 工具 ============
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

async function getDocsMdData(params, isMd) {
  if (isMd === undefined) isMd = true
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

// ============ 表格解析 (parseSheet) ============
function parseSheet(sheetStr) {
  if (!sheetStr) return ''
  const parseStr = pako.inflate(sheetStr, { to: 'string' })
  const sheetList = JSON.parse(parseStr)
  let mdData = ''
  sheetList.forEach((item) => {
    const sheetTitle = `## ${item.name}\n`
    const table = genMarkdownTable(item.data)
    mdData = `${mdData}\n${sheetTitle}\n${table}`
  })
  return mdData
}

function genMarkdownTable(data) {
  let rowList = Object.keys(data)
  rowList = rowList.filter(rowKey => {
    const colList = Object.keys(data[rowKey])
    return colList.some(col => data?.[rowKey]?.[col]?.v)
  })
  let colList = []
  rowList.forEach(rowKey => {
    const cols = data[rowKey]
    if (cols) colList = colList.concat(Object.keys(cols))
  })
  const rowMax = Math.max(...rowList.map(row => Number(row)))
  const colMax = Math.max(...colList.map(col => Number(col)))
  if (rowMax < 0 || colMax < 0) return ''
  let tableMd = ''
  const TITLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let rowTitle = Array(colMax + 1).fill(' ').map((v, i) => {
    const index = i % (TITLE.length)
    return TITLE[index]
  }).join(' | ')
  rowTitle = `| |${rowTitle}|`
  let rowTitleLine = Array(colMax + 2).fill('---').join(' |')
  rowTitleLine = `|${rowTitleLine}|`
  tableMd = `${rowTitle}\n${rowTitleLine}\n`
  for (let row = 0; row < rowMax + 1; row++) {
    const colData = []
    for (let col = 0; col < colMax + 1; col++) {
      const v = data?.[row]?.[col]?.v || null
      if (v && typeof v === 'string') {
        colData.push(v)
      } else if (v && typeof v === 'object') {
        if (v?.class === 'image' && v?.src) {
          colData.push(`![${v?.name}'](${v?.src})`)
        } else if (v?.class === 'checkbox') {
          colData.push(v?.value ? '[x] ' : '[ ] ')
        } else if (v?.class === 'link') {
          colData.push(`[${v?.text}](${v?.url})`)
        } else if (v?.class === 'select') {
          colData.push(v?.value?.join(','))
        }
      } else {
        colData.push(null)
      }
    }
    const rowMd = `| ${row + 1} | ${colData.join(' | ')}|`
    tableMd = `${tableMd}${rowMd}\n`
  }
  return tableMd
}

// ============ Markdown 修复 ============
function fixLatex(mdData) {
  const latexReg = /!\[(.*?)\]\((http.*?latex.*?)\)/gm
  const list = mdData.match(latexReg)
  let fixMaData = mdData
  const rawMaData = mdData
  try {
    list?.forEach(latexMd => {
      latexReg.lastIndex = 0
      const url = latexReg.exec(latexMd)?.[2] ?? ''
      const { pathname, search } = new URL(url)
      const isSvg = pathname.endsWith('.svg')
      if (!isSvg && search) {
        const data = decodeURIComponent(search)
        fixMaData = fixMaData.replace(latexMd, data.slice(1))
      }
    })
  } catch {
    return rawMaData
  }
  return fixMaData
}

function fixMarkdownImage(imgList, mdData, htmlData) {
  if (!htmlData) return mdData
  const htmlDataImgReg = /<card.*?name="image".*?value="data:(.*?)">(.*?)<\/card>/gm
  const htmlImgDataList = []
  let regExec
  let init = true
  while (init || Boolean(regExec)) {
    init = false
    regExec = htmlDataImgReg.exec(htmlData)
    if (regExec?.[1]) {
      try {
        const strData = decodeURIComponent(regExec[1])
        const cardData = JSON.parse(strData)
        htmlImgDataList.push(cardData?.src || '')
      } catch {
        htmlImgDataList.push('')
      }
    }
  }
  const replaceURLCountMap = new Map()
  imgList.forEach((imgUrl) => {
    const { origin, pathname } = new URL(imgUrl)
    const matchURL = `${origin}${pathname}`
    const targetURL = htmlImgDataList.find((item, index) => {
      const reg = new RegExp(`${matchURL}.*?`)
      const isFind = reg.test(item)
      if (isFind) htmlImgDataList.splice(index, 1)
      return isFind
    })
    if (targetURL) {
      const reg = new RegExp(imgUrl, 'g')
      const count = replaceURLCountMap.get(imgUrl) || 0
      let temp = 0
      mdData = mdData.replace(reg, (match) => {
        let res = match
        if (temp === count) { res = targetURL }
        temp = temp + 1
        return res
      })
      replaceURLCountMap.set(imgUrl, count + 1)
    }
  })
  return mdData
}

function containsHtmlTags(str) {
  return /<([a-z][\s\S]*?)>/i.test(str)
}

function containsMarkdownLabel(str) {
  return /(~~|\*\*|_)/g.test(str)
}

function fixInlineCode(mdData, htmlData) {
  const ast = fromMarkdown(mdData)
  const inlineCodeList = []
  eachNode(ast, (node, keyChain) => {
    if (node.type === 'inlineCode') inlineCodeList.push({ node, keyChain })
  })
  if (inlineCodeList.length === 0) return mdData

  inlineCodeList.forEach((item) => {
    const node = item.node
    if (!containsHtmlTags(node.value) && !containsMarkdownLabel(node.value)) return
    const tarnsfromCode = node.value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    if (htmlData.includes(tarnsfromCode)) return
    node.type = 'html'
    node.value = `<code>${node.value}</code>`
  })
  return toMarkdown(ast)
}

function eachNode(node, callback, keyChain) {
  keyChain = keyChain || []
  callback(node, keyChain)
  if (Array.isArray(node.children)) {
    keyChain.push('children')
    node.children.forEach((child, index) => {
      eachNode(child, callback, [...keyChain, String(index)])
    })
  }
}

// ============ 图片签名 ============
const crypto = require('crypto')

function genSign(url) {
  const hash = crypto.createHash('sha256')
  hash.update(`${IMAGE_SING_KEY}${url}`)
  return hash.digest('hex')
}

function captureImageURL(url, imageServiceDomains) {
  imageServiceDomains = imageServiceDomains || []
  try {
    const { host, pathname } = new URL(url)
    if (imageServiceDomains.includes(host)) return url
    if (!pathname) return url
  } catch {
    return url
  }
  return `https://www.yuque.com/api/filetransfer/images?url=${encodeURIComponent(url)}&sign=${genSign(url)}`
}

// ============ 文件下载 ============
const finished = promisify(stream.finished)

async function downloadFile(params) {
  const { fileUrl, savePath, token, key, fileName } = params
  return axios.get(fileUrl, {
    ...genCommonOptions({ token, key }),
    responseType: 'stream'
  }).then(async response => {
    if (response.request?.path?.startsWith('/login')) {
      throw new Error(`"${fileName}" need token`)
    } else if (response.status === 200) {
      const writer = createWriteStream(savePath)
      response.data?.pipe(writer)
      return finished(writer).then(() => ({ fileUrl, savePath }))
    }
    throw new Error(`response status ${response.status}`)
  })
}

// ============ 附件下载 ============
const mdUrlReg = /\[(.*?)\]\((.*?)\)/g
const AttachmentsReg = /\[(.*?)\]\((.*?\.yuque\.com\/attachments.*?)\)/

async function downloadAttachments(params) {
  const { mdData, savePath, attachmentsDir, articleTitle, token, key, ignoreAttachments } = params
  const attachmentsList = (mdData.match(mdUrlReg) || []).filter(item => AttachmentsReg.test(item))
  if (attachmentsList.length === 0) return { mdData }

  const attachmentsDirPath = path.resolve(savePath, attachmentsDir)
  let attachmentsDataList = attachmentsList
    .map(item => {
      AttachmentsReg.lastIndex = 0
      const [, rawFileName, url] = AttachmentsReg.exec(item) || []
      if (!url) return false
      const fileName = rawFileName || url.split('/').at(-1)
      if (!fileName) return false
      return { fileName, url, rawMd: item, currentFilePath: path.join(attachmentsDirPath, fileName) }
    })
    .filter(Boolean)

  if (typeof ignoreAttachments === 'string') {
    const ignoreExtList = ignoreAttachments.split(',')
    attachmentsDataList = attachmentsDataList.filter((item) => {
      const extIndex = item.url.lastIndexOf('.')
      if (extIndex === -1) return true
      const currentExt = item.url.slice(extIndex + 1)
      return !ignoreExtList.find(ext => ext === currentExt)
    })
  }

  if (attachmentsDataList.length === 0) return { mdData }

  mkdirSync(attachmentsDirPath, { recursive: true })
  const promiseList = attachmentsDataList.map((item) => {
    return downloadFile({ fileUrl: item.url, savePath: item.currentFilePath, token, key, fileName: item.fileName })
  })
  const downloadFileInfo = await Promise.all(promiseList)

  let resMdData = mdData
  downloadFileInfo.forEach(info => {
    const replaceInfo = attachmentsDataList.find(item => item.url === info.fileUrl)
    if (replaceInfo) {
      const replaceData = `[附件: ${replaceInfo.fileName}](${attachmentsDir}/${replaceInfo.fileName})`
      resMdData = resMdData.replace(replaceInfo.rawMd, replaceData)
    }
  })
  return { mdData: resMdData }
}

// ============ 音视频下载 ============
function getVideoApi(params) {
  let apiUrl = 'https://www.yuque.com/api/video'
  const { videoId, token, key } = params
  const searchParams = new URLSearchParams()
  searchParams.set('video_id', videoId)
  apiUrl = `${apiUrl}?${searchParams.toString()}`
  return axios.get(apiUrl, genCommonOptions({ token, key }))
    .then(({ data, status }) => {
      const res = data.data
      if (status === 200 && res.status === 'success') return res.info
      return false
    }).catch(() => false)
}

function perParseVideoInfo(url) {
  try {
    const urlObj = new URL(url)
    const encodeData = urlObj.searchParams.get('_lake_card') ?? ''
    const dataStr = decodeURIComponent(encodeData)
    const data = JSON.parse(dataStr)
    return { name: data?.name || '', videoId: data?.videoId || '' }
  } catch {
    return false
  }
}

const audioReg = /name="audio" value="data:(.*?audioId.*?)".*?><\/card>/gm
const videoReg = /name="video" value="data:(.*?videoId.*?)".*?><\/card>/gm

function getVideoList(htmlData, type) {
  const reg = type === 'video' ? videoReg : audioReg
  const list = htmlData.match(reg) || []
  try {
    return list.map(item => item.replace(reg, '$1')).map(item => JSON.parse(decodeURIComponent(item)))
  } catch {
    return []
  }
}

async function downloadVideo(params) {
  const { mdData, htmlData, savePath, attachmentsDir, articleTitle, token, key, ignoreAttachments } = params
  const astTree = fromMarkdown(mdData)
  const linkList = []
  eachNode(astTree, (node, keyChain) => {
    if (node.type === 'link') linkList.push({ node, keyChain })
  })

  let videoLinkList = linkList.filter(link => /_lake_card.*?videoId/.test(link.node.url))
  let htmlAudioLinkList = getVideoList(htmlData, 'audio')
  let htmlVideoLinkList = getVideoList(htmlData, 'video')

  if (videoLinkList.length === 0 && htmlAudioLinkList.length === 0 && htmlVideoLinkList.length === 0) {
    return { mdData }
  }

  if (typeof ignoreAttachments === 'string') {
    const ignoreExtList = ignoreAttachments.split(',')
    const filterByExt = (list, getExt) => list.filter(item => {
      const ext = getExt(item)
      if (!ext) return true
      return !ignoreExtList.find(e => e === ext)
    })
    videoLinkList = filterByExt(videoLinkList, link => {
      const idx = link.node.url.lastIndexOf('.')
      return idx === -1 ? '' : link.node.url.slice(idx + 1)
    })
    htmlAudioLinkList = filterByExt(htmlAudioLinkList, item => {
      const idx = item.audioId?.lastIndexOf('.')
      return idx === -1 ? '' : item.audioId.slice(idx + 1)
    })
    htmlVideoLinkList = filterByExt(htmlVideoLinkList, item => {
      const idx = item.videoId?.lastIndexOf('.')
      return idx === -1 ? '' : item.videoId.slice(idx + 1)
    })
    if (videoLinkList.length === 0 && htmlAudioLinkList.length === 0 && htmlVideoLinkList.length === 0) {
      return { mdData }
    }
  }

  const attachmentsDirPath = path.resolve(savePath, attachmentsDir)
  mkdirSync(attachmentsDirPath, { recursive: true })
  let resMdData = mdData

  try {
    if (videoLinkList.length > 0) {
      const realVideoList = []
      for (const link of videoLinkList) {
        const videoInfo = perParseVideoInfo(link.node.url)
        if (!videoInfo) continue
        const res = await getVideoApi({ videoId: videoInfo.videoId, key, token })
        if (!res) continue
        const fileName = videoInfo.name || videoInfo.videoId.split('/').at(-1) || videoInfo.videoId
        realVideoList.push({ videoInfo: { ...videoInfo, ...res }, astNode: link, fileName, currentFilePath: path.join(attachmentsDirPath, fileName) })
      }
      await Promise.all(realVideoList.map(item => downloadFile({
        fileUrl: item.videoInfo.video, savePath: item.currentFilePath, token, key, fileName: item.videoInfo.name
      })))
      realVideoList.forEach(item => {
        item.astNode.node.url = `${attachmentsDir}${path.sep}${item.fileName}`
        item.astNode.node.children = [{ type: 'text', value: `音视频附件: ${item.videoInfo.name}` }]
      })
      resMdData = toMarkdown(astTree)
    }

    if (htmlAudioLinkList.length > 0 || htmlVideoLinkList.length > 0) {
      const allList = []
      for (const item of htmlAudioLinkList) {
        const res = await getVideoApi({ videoId: item.audioId, key, token })
        if (!res) continue
        const fileName = item.fileName || item.id
        allList.push({ videoInfo: { ...item, ...res }, type: 'audio', fileName, currentFilePath: path.join(attachmentsDirPath, fileName) })
      }
      for (const item of htmlVideoLinkList) {
        const res = await getVideoApi({ videoId: item.videoId, key, token })
        if (!res) continue
        const fileName = item.name || item.id
        allList.push({ videoInfo: { ...item, ...res }, type: 'video', fileName, currentFilePath: path.join(attachmentsDirPath, fileName) })
      }
      await Promise.all(allList.map(item => {
        const dlUrl = item.type === 'audio' ? item.videoInfo.audio : item.videoInfo.video
        const dlName = item.type === 'audio' ? item.videoInfo.fileName : item.videoInfo.name
        return downloadFile({ fileUrl: dlUrl, savePath: item.currentFilePath, token, key, fileName: dlName })
      }))
      allList.forEach(info => {
        const astLinkNode = linkList.find(link => new RegExp(`#${info.videoInfo.id}`, 'gm').test(link.node.url))
        if (astLinkNode) {
          astLinkNode.node.url = `${attachmentsDir}${path.sep}${info.fileName}`
          astLinkNode.node.children = [{ type: 'text', value: `音视频附件: ${info.fileName}` }]
        }
      })
      resMdData = toMarkdown(astTree)
    }
  } catch (e) {
    sendLog(`音视频下载失败: ${e.message}`)
  }

  return { mdData: resMdData }
}

// ============ handleMdData ============
function handleMdData(rawMdData, options) {
  const { articleTitle, articleUrl, toc, convertMarkdownVideoLinks, hideFooter } = options
  let mdData = rawMdData
  mdData = mdData.replace(/<a.*?>(\s*?)<\/a>/gm, '')
  const header = articleTitle ? `# ${articleTitle}\n\n` : ''
  let tocData = toc ? mdToc(mdData).content : ''
  if (tocData) tocData = `${tocData}\n\n---\n\n`

  let footer = ''
  if (!hideFooter) {
    footer = '\n\n'
    if (options.articleUpdateTime) {
      footer += `> 更新: ${options.articleUpdateTime}  \n`
    }
    if (articleUrl) {
      footer += `> 原文: <${articleUrl}>`
    }
  }

  mdData = `${header}${tocData}${mdData}${footer}`
  if (convertMarkdownVideoLinks) {
    mdData = mdData.replace(/\[(.*?)\]\((.*?)\.(mp4|mp3)\)/gm, (match, alt, url, extType) => {
      const htmlTag = extType === 'mp3' ? 'audio' : 'video'
      return `<${htmlTag} controls width="800" alt="${alt}" src="${url + '.' + extType}"></${htmlTag}>`
    })
  }
  return mdData
}

// ============ 增量/断点下载 ============
const PROGRESS_FILE = 'progress.json'

async function getProgress(bookPath) {
  const progressFilePath = path.join(bookPath, PROGRESS_FILE)
  try {
    return JSON.parse(await readFile(progressFilePath, { encoding: 'utf8' }))
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      await writeFile(progressFilePath, JSON.stringify([]), { encoding: 'utf8' })
    }
    return []
  }
}

async function updateProgress(bookPath, progressInfo, progressItem, isSuccess) {
  if (isSuccess) {
    const uuid = progressItem.toc.uuid
    const findItem = progressInfo.find(item => item.toc.uuid === uuid)
    if (findItem) {
      Object.assign(findItem, progressItem)
    } else {
      progressInfo.push(progressItem)
    }
    await writeFile(
      path.join(bookPath, PROGRESS_FILE),
      JSON.stringify(progressInfo),
      { encoding: 'utf8' }
    )
  }
}

function checkProgressItemUpdate(progressItem, oldProgressItem) {
  const defaultRes = { isFirstDownload: true, isUpdateDownload: false, needDownload: true }
  if (!progressItem.contentUpdatedAt || !oldProgressItem || !oldProgressItem?.contentUpdatedAt) {
    return defaultRes
  }
  const currentUpdateDate = new Date(progressItem.contentUpdatedAt)
  const preUpdateDate = new Date(oldProgressItem.contentUpdatedAt)
  if (!isValidDate(currentUpdateDate) || !isValidDate(preUpdateDate)) return defaultRes
  if (currentUpdateDate.getTime() > preUpdateDate.getTime()) {
    return { needDownload: true, isUpdateDownload: true, isFirstDownload: false }
  } else if (currentUpdateDate.getTime() === preUpdateDate.getTime()) {
    return { needDownload: false, isUpdateDownload: false, isFirstDownload: false }
  }
  return defaultRes
}

// ============ 下载单篇文章 ============
async function downloadArticle(articleInfo, options, progressItem, oldProgressItem) {
  const { bookId, itemUrl, savePath, saveFilePath, uuid, articleUrl, articleTitle, host, imageServiceDomains } = articleInfo
  const { token, key, ignoreImg, ignoreAttachments, toc, convertMarkdownVideoLinks, hideFooter } = options
  const reqParams = { articleUrl: itemUrl, bookId, token, host, key }

  const { httpStatus, apiUrl, response } = await getDocsMdData(reqParams)

  progressItem.createAt = response?.data?.created_at || ''
  progressItem.contentUpdatedAt = response?.data?.content_updated_at || ''
  progressItem.publishedAt = response?.data?.published_at || ''
  progressItem.firstPublishedAt = response?.data?.first_published_at || ''

  const { needDownload } = checkProgressItemUpdate(progressItem, oldProgressItem)
  if (!needDownload) return { needDownload, isUpdateDownload: false, isDownloadFinish: true }

  const contentType = response?.data?.type?.toLowerCase()
  let mdData = ''

  if (contentType === ARTICLE_CONTENT_TYPE.SHEET) {
    const { response: rawResp } = await getDocsMdData(reqParams, false)
    try {
      const rawContent = rawResp?.data?.content
      const content = rawContent ? JSON.parse(rawContent) : {}
      const sheetData = content?.sheet
      mdData = sheetData ? parseSheet(sheetData) : ''
    } catch (e) {
      throw new Error(`"表格类型"解析错误 ${e}`)
    }
  } else if ([ARTICLE_CONTENT_TYPE.BOARD, ARTICLE_CONTENT_TYPE.TABLE].includes(contentType)) {
    const typeMap = { board: '画板类型', table: '数据表类型' }
    throw new Error(`暂不支持"${typeMap[contentType]}"的文档`)
  } else if (typeof response?.data?.sourcecode !== 'string') {
    throw new Error(`${apiUrl}, http status ${httpStatus}`)
  } else {
    mdData = response.data.sourcecode
    mdData = fixLatex(mdData)
  }

  const imgList = getMarkdownImageList(mdData)
  const rawData = await getDocsMdData(reqParams, false)
  const htmlData = rawData.response?.data?.content ?? ''

  if (imgList.length && !ignoreImg) {
    mdData = fixMarkdownImage(imgList, mdData, htmlData)
  }

  const handleMdDataOptions = {
    toc,
    articleTitle,
    articleUrl,
    articleUpdateTime: formateDate(response?.data?.content_updated_at ?? ''),
    convertMarkdownVideoLinks,
    hideFooter
  }

  const attachmentsErrInfo = []

  if (!ignoreAttachments || typeof ignoreAttachments === 'string') {
    try {
      const resData = await downloadAttachments({
        mdData, savePath, attachmentsDir: `./attachments/${fixPath(uuid)}`,
        articleTitle, token, key, ignoreAttachments
      })
      mdData = resData.mdData
    } catch (e) {
      attachmentsErrInfo.push(`附件下载失败: ${e.message || 'unknown error'}`)
    }
  }

  if (!ignoreAttachments || typeof ignoreAttachments === 'string') {
    try {
      const resData = await downloadVideo({
        mdData, htmlData, savePath, attachmentsDir: `./attachments/${fixPath(uuid)}`,
        articleTitle, token, key, ignoreAttachments
      })
      mdData = resData.mdData
    } catch (e) {
      attachmentsErrInfo.push(`音视频下载失败: ${e.message || 'unknown error'}`)
    }
  }

  if (imgList.length && !ignoreImg) {
    let errorInfo = []
    let data = mdData
    try {
      const mdImgRes = await mdImg.run(mdData, {
        dist: savePath,
        imgDir: `./img/${uuid}`,
        isIgnoreConsole: true,
        errorStillReturn: true,
        referer: articleUrl || '',
        transform(url) {
          url = url.replace('x-oss-process=image%2Fwatermark%2C', '')
          return captureImageURL(url, imageServiceDomains)
        },
        timeout: 3 * 60 * 1000
      })
      errorInfo = mdImgRes.errorInfo
      data = mdImgRes.data
    } catch (e) {
      errorInfo = [e]
    }
    mdData = data

    if (errorInfo.length > 0) {
      const e = errorInfo[0]
      let errMessage = '图片下载失败(失败的以远程链接保存): '
      errMessage = e.url ? `${errMessage}${e.error?.message} ${e.url.slice(0, 20)}...` : `${errMessage}${e.message}`
      await writeFile(saveFilePath, handleMdData(mdData, handleMdDataOptions))
      throw new Error(errMessage)
    }
  }

  try {
    mdData = fixInlineCode(mdData, htmlData)
    await writeFile(saveFilePath, handleMdData(mdData, handleMdDataOptions))
    if (attachmentsErrInfo.length > 0) {
      throw new Error(attachmentsErrInfo[0])
    }
  } catch (e) {
    throw new Error(`${e.message}`)
  }
}

// ============ 下载列表遍历 ============
async function runDownload(params) {
  const { url, distDir, token, key, ignoreImg, ignoreAttachments,
    toc, incremental, convertMarkdownVideoLinks, hideFooter } = params

  if (!isValidUrl(url)) throw new Error('请输入有效的语雀知识库 URL')

  sendLog('正在获取知识库信息...')
  const info = await getKnowledgeBaseInfo(url, { token, key })
  const { bookId, tocList, bookName, bookSlug, host, imageServiceDomains } = info

  if (!bookId) throw new Error('未找到知识库 ID，请检查 URL 是否正确')
  if (!tocList || tocList.length === 0) throw new Error('知识库目录为空')

  let docCount = 0
  for (const item of tocList) {
    if (typeof item.type !== 'string') continue
    const itemType = item.type.toLowerCase()
    if (itemType === ARTICLE_TOC_TYPE.TITLE || item['child_uuid'] !== '' || itemType === ARTICLE_TOC_TYPE.LINK) {
      if (itemType === ARTICLE_CONTENT_TYPE.DOC) docCount++
    } else if (item.url) {
      docCount++
    }
  }

  sendLog(`知识库: ${bookName} (共 ${tocList.length} 篇，需下载 ${docCount} 篇)`)
  process.send({ type: 'doc-count', data: { docCount, total: tocList.length, bookName } })

  const bookPath = path.resolve(distDir, bookName ? fixPath(bookName) : String(bookId))
  await mkdir(bookPath, { recursive: true })

  const total = tocList.length
  const progressInfo = await getProgress(bookPath)
  let downloaded = incremental ? 0 : progressInfo.length
  let errCount = 0
  const articleUrlPrefix = url.replace(new RegExp(`(.*?/${bookSlug}).*`), '$1')

  const uuidMap = new Map()
  if (!incremental && downloaded > 0 && downloaded !== total) {
    sendLog('根据上次数据继续断点下载')
    progressInfo.forEach(item => uuidMap.set(item.toc.uuid, item))
  } else if (incremental) {
    progressInfo.forEach(item => uuidMap.set(item.toc.uuid, item))
  }

  const downloadOptions = { token, key, ignoreImg, ignoreAttachments, toc, convertMarkdownVideoLinks, hideFooter }

  for (let i = 0; i < total; i++) {
    const item = tocList[i]
    if (typeof item.type !== 'string') continue
    const itemType = item.type.toLowerCase()

    if (itemType === ARTICLE_TOC_TYPE.TITLE || item['child_uuid'] !== '' || itemType === ARTICLE_TOC_TYPE.LINK) {
      let tempItem = item
      const pathTitleList = []
      const pathIdList = []
      while (tempItem) {
        pathTitleList.unshift(fixPath(tempItem.title))
        pathIdList.unshift(tempItem.uuid)
        if (uuidMap.get(tempItem['parent_uuid'])) {
          tempItem = uuidMap.get(tempItem['parent_uuid']).toc
        } else {
          tempItem = undefined
        }
      }

      const progressItem = { path: pathTitleList.map(fixPath).join('/'), pathTitleList, pathIdList, toc: item }

      if (itemType !== ARTICLE_TOC_TYPE.LINK) {
        await mkdir(path.join(bookPath, ...pathTitleList.map(fixPath)), { recursive: true })
      }

      if (itemType === ARTICLE_CONTENT_TYPE.DOC) {
        await docHandle(item)
      } else {
        uuidMap.set(item.uuid, progressItem)
        downloaded++
        await updateProgress(bookPath, progressInfo, progressItem, true)
        sendProgress({ current: downloaded, total, title: item.title })
      }
      continue
    }

    if (item.url) {
      await docHandle(item)
    }
  }

  async function docHandle(item) {
    const itemType = item.type.toLowerCase()
    const parent = uuidMap.get(item['parent_uuid'])
    const parentPathList = parent ? parent.pathTitleList : []
    const parentPathIdList = parent ? parent.pathIdList : []

    const fileName = fixPath(item.title)
    const pathTitleList = [...parentPathList, fileName]
    const pathIdList = [...parentPathIdList, item.uuid]

    let mdPath, savePath, saveFilePath
    if (itemType === ARTICLE_CONTENT_TYPE.DOC && item['child_uuid']) {
      mdPath = [...parentPathList, fileName, 'index.md'].map(fixPath).join('/')
      savePath = pathTitleList.map(fixPath).join('/')
    } else {
      mdPath = [...parentPathList, `${fileName}.md`].map(fixPath).join('/')
      savePath = parentPathList.map(fixPath).join('/')
    }

    const progressItem = {
      path: mdPath,
      savePath,
      pathTitleList,
      pathIdList,
      toc: item
    }

    const saveFilePathAbs = path.resolve(bookPath, progressItem.savePath ? path.join(progressItem.savePath, path.basename(mdPath)) : mdPath)
    const savePathAbs = path.resolve(bookPath, savePath)
    const articleUrl = `${articleUrlPrefix}/${item.url}`

    let isSuccess = true
    try {
      await downloadArticle(
        {
          bookId,
          itemUrl: item.url,
          savePath: savePathAbs,
          saveFilePath: saveFilePathAbs,
          uuid: item.uuid,
          articleTitle: item.title,
          articleUrl,
          host,
          imageServiceDomains: imageServiceDomains || []
        },
        downloadOptions,
        progressItem,
        uuidMap.get(item.uuid)
      )
      sendLog(`✓ ${parentPathList.length > 0 ? parentPathList.join('/') + '/' : ''}${item.title}`)
    } catch (e) {
      isSuccess = false
      errCount++
      sendLog(`✗ ${item.title}: ${e.message}`)
    }

    await updateProgress(bookPath, progressInfo, progressItem, isSuccess)
    uuidMap.set(item.uuid, progressItem)
    downloaded++
    sendProgress({ current: downloaded, total, title: item.title })
  }

  // 生成 index.md 目录文件
  const summary = []
  function findInTree(tree, id) {
    if (!id) return null
    for (const node of tree) {
      if (node.id === id) return node
      if (node.children) {
        const found = findInTree(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  uuidMap.forEach((progressItem) => {
    const toc = progressItem.toc
    const parentId = toc['parent_uuid']
    const tocType = (toc.type || '').toLowerCase()
    const tocText = fixPath(toc.title)
    const node = { text: tocText, id: toc.uuid, level: 1, type: 'link', children: null, link: null }

    if (tocType === ARTICLE_TOC_TYPE.TITLE || toc['child_uuid'] !== '') {
      node.type = 'title'
      if (tocType === ARTICLE_CONTENT_TYPE.DOC) {
        node.link = progressItem.pathTitleList.map(fixPath).join('/') + (toc['child_uuid'] ? '/index.md' : '.md')
      }
    } else {
      node.type = 'link'
      if (tocType === ARTICLE_TOC_TYPE.LINK) {
        node.link = toc.url
      } else if (progressItem.pathTitleList.length > 0) {
        const parts = progressItem.pathTitleList.map(fixPath)
        node.link = parts.slice(0, -1).concat(parts.at(-1) + '.md').join('/')
      }
    }

    const parentNode = findInTree(summary, parentId)
    if (parentNode) {
      if (!parentNode.children) parentNode.children = []
      node.level = parentNode.level + 1
      parentNode.children.push(node)
    } else {
      node.level = 1
      summary.push(node)
    }
  })

  function genSummaryContent(tree) {
    let content = ''
    for (const item of tree) {
      if (item.type === 'title') {
        const hashes = '#'.repeat(item.level + 1)
        if (item.link) {
          content += `\n${hashes} [${item.text}](${item.link.replace(/\s/g, '%20')})\n\n`
        } else {
          content += `\n${hashes} ${item.text}\n\n`
        }
      } else if (item.type === 'link' && item.link) {
        content += `${item.level === 1 ? '\n##' : '-'} [${item.text}](${item.link.replace(/\s/g, '%20')})\n`
      }
      if (item.children) content += genSummaryContent(item.children)
    }
    return content
  }

  let indexMd = `# ${bookName}\n\n`
  if (info.bookDesc) indexMd += `> ${info.bookDesc}\n\n`
  indexMd += genSummaryContent(summary)
  await writeFile(path.join(bookPath, 'index.md'), indexMd, 'utf-8')

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
