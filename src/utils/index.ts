/** 随机生成UA */
export function randUserAgent({ browser = 'chrome', os = 'mac os', device = 'desktop' }) {
  device = device.toLowerCase()
  browser = browser.toLowerCase()
  os = os.toLowerCase()
  
  // 内置的用户代理列表，避免依赖外部包
  const userAgents = [
    // Chrome on Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    // Chrome on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    // Safari on Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    // Firefox on Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/109.0',
    // Firefox on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0'
  ]
  
  // 根据参数过滤用户代理
  let filteredUAs = userAgents
  
  if (browser === 'chrome') {
    filteredUAs = filteredUAs.filter(ua => ua.includes('Chrome'))
  } else if (browser === 'safari') {
    filteredUAs = filteredUAs.filter(ua => ua.includes('Safari') && !ua.includes('Chrome'))
  } else if (browser === 'firefox') {
    filteredUAs = filteredUAs.filter(ua => ua.includes('Firefox'))
  }
  
  if (os === 'mac os') {
    filteredUAs = filteredUAs.filter(ua => ua.includes('Macintosh'))
  } else if (os === 'windows') {
    filteredUAs = filteredUAs.filter(ua => ua.includes('Windows'))
  }
  
  // 随机选择一个用户代理
  const randomIndex = Math.floor(Math.random() * filteredUAs.length)
  return filteredUAs[randomIndex] || userAgents[0]
}

/**
 * 获取md中的img url
 */
export function getMarkdownImageList(mdStr: string) {
  if (!mdStr) return []
  const mdImgReg = /!\[(.*?)\]\((.*?)\)/gm
  let list = Array.from(mdStr.match(mdImgReg) || [])
  list = list
    .map((itemUrl) => {
      itemUrl = itemUrl.replace(mdImgReg, '$2')
      // 如果出现非http开头的图片 如 "./xx.png" 则跳过
      if (!/^http.*/g.test(itemUrl)) return ''
      return itemUrl
    })
    .filter((url) => Boolean(url))
  return list
}

export function removeEmojis(dirName: string) {
  return dirName.replace(/[\ud800-\udbff][\udc00-\udfff]/g, '')
}

export function isValidUrl(url: string): boolean {
  if (typeof URL.canParse === 'function') {
    return URL.canParse(url)
  }
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function pad(num: number) {
  return num.toString().padStart(2, '0')
}

export function formateDate(d: string) {
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

export function isValidDate(date: Date) {
  return date instanceof Date && !isNaN(date.getTime())
}

export * from './log'
export * from './ProgressBar'
