/**
 * 授权码系统 (RSA 非对称签名模式)
 *
 * 流程:
 * 1. 客户安装软件 → 自动生成机器码 (基于 CPU + 主板 + MAC)
 * 2. 客户把机器码发给你
 * 3. 你用 keygen.js + 私钥 对机器码签名，生成授权码
 * 4. 客户输入授权码，软件用公钥验签
 *
 * 安全性: 公钥打包进软件，私钥只在你本地。
 *         即使反编译拿到公钥也无法伪造授权码。
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

  // MAC 地址
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        parts.push(net.mac)
        return parts.join('|')
      }
    }
  }
  parts.push('no-mac')
  return parts.join('|')
}

/**
 * 生成机器码 (16位 hex，4位一组)
 */
function generateMachineId() {
  const fingerprint = getHardwareFingerprint()
  const hash = crypto.createHash('sha256').update(fingerprint).digest('hex')
  const code = hash.substring(0, 16).toUpperCase()
  return code.match(/.{4}/g).join('-')
}

/**
 * 用公钥验证授权码 (客户端使用)
 * @param {string} machineId  机器码 如 A1B2-C3D4-E5F6-7890
 * @param {string} licenseKey 授权码 (base64 签名)
 * @returns {boolean}
 */
function validateLicense(machineId, licenseKey) {
  try {
    const cleanId = machineId.replace(/-/g, '')
    const verify = crypto.createVerify('SHA256')
    verify.update(cleanId)
    verify.end()
    return verify.verify(PUBLIC_KEY, licenseKey, 'base64')
  } catch {
    return false
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
function saveLicense(userDataPath, machineId, licenseKey) {
  const filePath = getLicenseFilePath(userDataPath)
  const data = {
    machineId,
    licenseKey,
    activatedAt: new Date().toISOString()
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
 * 检查当前机器是否已激活
 */
function checkActivation(userDataPath) {
  const machineId = generateMachineId()
  const saved = loadLicense(userDataPath)
  if (!saved) return { activated: false, machineId }
  if (saved.machineId !== machineId) return { activated: false, machineId }
  if (!validateLicense(machineId, saved.licenseKey)) return { activated: false, machineId }
  return { activated: true, machineId, activatedAt: saved.activatedAt }
}

module.exports = {
  generateMachineId,
  validateLicense,
  saveLicense,
  loadLicense,
  checkActivation
}
