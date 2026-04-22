/**
 * 授权码系统 (RSA 非对称签名模式 + 过期时间)
 *
 * 授权码格式:
 *   新格式: "expireAt:base64signature"  签名内容 = machineId|expireAt
 *   旧格式: "base64signature"           签名内容 = machineId (视为永久授权)
 *
 *   expireAt = 0 表示永久授权
 *   expireAt > 0 表示过期时间戳 (ms)
 */

const crypto = require('crypto')
const os = require('os')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// 公钥 (打包进客户端)
const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'keys', 'public.pem'), 'utf-8')

/**
 * 获取硬件指纹
 */
function getHardwareFingerprint() {
  const parts = []

  // CPU
  const cpus = os.cpus()
  if (cpus.length > 0) parts.push(cpus[0].model)

  // 主板序列号
  try {
    if (process.platform === 'win32') {
      const board = execSync('wmic baseboard get serialnumber', { encoding: 'utf-8' })
      const serial = board.split('\n').map(s => s.trim()).filter(s => s && s !== 'SerialNumber')[0]
      if (serial) parts.push(serial)
    } else if (process.platform === 'darwin') {
      const serial = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformSerialNumber/ { print $3 }'",
        { encoding: 'utf-8' }
      ).trim().replace(/"/g, '')
      if (serial) parts.push(serial)
    } else {
      const serial = execSync('cat /sys/class/dmi/id/board_serial 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim()
      if (serial) parts.push(serial)
    }
  } catch {
    parts.push('no-board-serial')
  }

  // MAC 地址 — 只取物理网卡，排除虚拟网卡
  const nets = os.networkInterfaces()

  // 已知虚拟网卡 MAC 前缀 (OUI)
  const virtualMacPrefixes = [
    '00:05:69', // VMware
    '00:0c:29', // VMware
    '00:1c:14', // VMware
    '00:50:56', // VMware
    '08:00:27', // VirtualBox
    '0a:00:27', // VirtualBox
    '00:15:5d', // Hyper-V
    '00:03:ff', // Microsoft Virtual
    '7c:1e:52', // Docker
    '02:42:ac', // Docker
    'ea:63:e5', // WSL
  ]

  // 虚拟网卡名称关键词
  const virtualNameKeywords = [
    'vmware', 'vmnet', 'virtualbox', 'vbox',
    'hyper-v', 'vethernet', 'docker', 'br-',
    'veth', 'virbr', 'wsl', 'loopback',
    'vpn', 'tap', 'tun', 'zerotier',
    'hamachi', 'npcap', 'winpcap'
  ]

  function isVirtualNic(name, mac) {
    const lowerName = name.toLowerCase()
    if (virtualNameKeywords.some(kw => lowerName.includes(kw))) return true
    const macPrefix = mac.substring(0, 8).toLowerCase()
    if (virtualMacPrefixes.includes(macPrefix)) return true
    // 本地管理位 MAC（第一字节第二位为1）通常是虚拟/随机生成的
    const firstByte = parseInt(mac.substring(0, 2), 16)
    if (firstByte & 0x02) return true
    return false
  }

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.internal) continue
      if (!net.mac || net.mac === '00:00:00:00:00:00') continue
      if (isVirtualNic(name, net.mac)) continue
      parts.push(net.mac)
      return parts.join('|')
    }
  }
  parts.push('no-mac')
  return parts.join('|')
}

/**
 * 生成机器码 (16位 hex，4位一组)
 * 结果会缓存，避免重复调用 execSync 获取硬件信息
 */
let _cachedMachineId = null
function generateMachineId() {
  if (_cachedMachineId) return _cachedMachineId
  const fingerprint = getHardwareFingerprint()
  const hash = crypto.createHash('sha256').update(fingerprint).digest('hex')
  const code = hash.substring(0, 16).toUpperCase()
  _cachedMachineId = code.match(/.{4}/g).join('-')
  return _cachedMachineId
}

/**
 * 解析授权码格式
 * @returns {{ expireAt: number, signature: string, isLegacy: boolean }}
 */
function parseLicenseKey(licenseKey) {
  const colonIdx = licenseKey.indexOf(':')
  if (colonIdx === -1) {
    // 旧格式: 纯 base64 签名，视为永久授权
    return { expireAt: 0, signature: licenseKey, isLegacy: true }
  }
  const expirePart = licenseKey.substring(0, colonIdx)
  const signature = licenseKey.substring(colonIdx + 1)
  const expireAt = parseInt(expirePart, 10)
  if (isNaN(expireAt)) {
    return { expireAt: 0, signature: licenseKey, isLegacy: true }
  }
  return { expireAt, signature, isLegacy: false }
}

/**
 * 用公钥验证授权码 (客户端使用)
 * @param {string} machineId  机器码 如 A1B2-C3D4-E5F6-7890
 * @param {string} licenseKey 授权码
 * @returns {{ valid: boolean, expireAt: number, expired: boolean }}
 */
function validateLicense(machineId, licenseKey) {
  try {
    const cleanId = machineId.replace(/-/g, '')
    const { expireAt, signature, isLegacy } = parseLicenseKey(licenseKey)

    // 构建验签 payload
    const payload = isLegacy ? cleanId : `${cleanId}|${expireAt}`
    const verify = crypto.createVerify('SHA256')
    verify.update(payload)
    verify.end()
    const valid = verify.verify(PUBLIC_KEY, signature, 'base64')

    if (!valid) return { valid: false, expireAt: 0, expired: false }

    // 检查是否过期 (expireAt=0 表示永久)
    const expired = expireAt > 0 && Date.now() > expireAt
    return { valid: true, expireAt, expired }
  } catch {
    return { valid: false, expireAt: 0, expired: false }
  }
}

/**
 * 授权信息存储路径
 */
function getLicenseFilePath(userDataPath) {
  return path.join(userDataPath, 'license.json')
}

/**
 * 保存授权信息
 */
function saveLicense(userDataPath, machineId, licenseKey, expireAt) {
  const filePath = getLicenseFilePath(userDataPath)
  const now = Date.now()
  const data = {
    machineId,
    licenseKey,
    expireAt: expireAt || 0,
    activatedAt: new Date().toISOString(),
    lastCheckTime: now
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * 读取已保存的授权信息
 */
function loadLicense(userDataPath) {
  const filePath = getLicenseFilePath(userDataPath)
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * 更新最后校验时间
 */
function updateLastCheckTime(userDataPath) {
  const filePath = getLicenseFilePath(userDataPath)
  const saved = loadLicense(userDataPath)
  if (!saved) return
  saved.lastCheckTime = Date.now()
  fs.writeFileSync(filePath, JSON.stringify(saved, null, 2), 'utf-8')
}

/**
 * 检查当前机器是否已激活（含过期检查 + 时间回调检测）
 */
function checkActivation(userDataPath) {
  const machineId = generateMachineId()
  const saved = loadLicense(userDataPath)
  if (!saved) return { activated: false, machineId }
  if (saved.machineId !== machineId) return { activated: false, machineId }

  const result = validateLicense(machineId, saved.licenseKey)
  if (!result.valid) return { activated: false, machineId }

  // 时间回调检测：如果当前时间 < 上次校验时间，说明系统时间被往回调了
  const now = Date.now()
  if (result.expireAt > 0 && saved.lastCheckTime && now < saved.lastCheckTime - 60000) {
    return {
      activated: false,
      machineId,
      expired: true,
      tampered: true,
      expireAt: result.expireAt,
      expireText: '检测到系统时间异常，请校正系统时间后重试'
    }
  }

  if (result.expired) {
    return {
      activated: false,
      machineId,
      expired: true,
      expireAt: result.expireAt,
      expireText: formatExpireText(result.expireAt)
    }
  }

  // 校验通过，更新 lastCheckTime
  updateLastCheckTime(userDataPath)

  return {
    activated: true,
    machineId,
    activatedAt: saved.activatedAt,
    expireAt: result.expireAt,
    expireText: formatExpireText(result.expireAt)
  }
}

/**
 * 格式化过期时间显示文本
 */
function formatExpireText(expireAt) {
  if (!expireAt || expireAt === 0) return '永久有效'
  const d = new Date(expireAt)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/**
 * 清除授权信息
 */
function clearLicense(userDataPath) {
  const filePath = getLicenseFilePath(userDataPath)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

module.exports = {
  generateMachineId,
  validateLicense,
  saveLicense,
  loadLicense,
  checkActivation,
  clearLicense
}
