#!/usr/bin/env node
/**
 * 授权码生成工具 (仅你自己使用，不要分发)
 * 使用私钥对机器码进行 RSA-SHA256 签名
 *
 * 用法:
 *   node keygen.js <机器码>
 *
 * 示例:
 *   node keygen.js A1B2-C3D4-E5F6-7890
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const PRIVATE_KEY = fs.readFileSync(
  path.join(__dirname, 'keys', 'private.pem'), 'utf-8'
)

const machineId = process.argv[2]

if (!machineId) {
  console.log('用法: node keygen.js <机器码>')
  console.log('示例: node keygen.js A1B2-C3D4-E5F6-7890')
  process.exit(1)
}

const clean = machineId.replace(/[^A-Fa-f0-9]/g, '').toUpperCase()
if (clean.length !== 16) {
  console.error('错误: 机器码应为16位十六进制 (如 A1B2-C3D4-E5F6-7890)')
  process.exit(1)
}

// 用私钥签名
const sign = crypto.createSign('SHA256')
sign.update(clean)
sign.end()
const signature = sign.sign(PRIVATE_KEY, 'base64')

const formatted = clean.match(/.{4}/g).join('-')

console.log('')
console.log('机器码:  ', formatted)
console.log('授权码:  ', signature)
console.log('')
console.log('请将授权码发送给客户进行激活')
