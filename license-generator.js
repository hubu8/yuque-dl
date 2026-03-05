// 授权码生成工具（使用RSA私钥签名）
// 使用方法: node license-generator.js <机器码> [有效期天数]

import { readFileSync, writeFileSync } from 'fs';
import { createSign } from 'crypto';

// 私钥（用于签名）- 请从 generate-keys.js 生成的密钥中替换
const PRIVATE_KEY = readFileSync('./private-key.pem', 'utf8');

const machineId = process.argv[2];
const expireDays = parseInt(process.argv[3]) || 0;

if (!machineId) {
  console.log('使用方法: node license-generator.js <机器码> [有效期天数]');
  console.log('示例: node license-generator.js ABCD-EFGH-IJKL-MNOP 365');
  console.log('      node license-generator.js ABCD-EFGH-IJKL-MNOP 0  # 永久授权');
  console.log('\n注意：请先运行 node generate-keys.js 生成密钥对');
  process.exit(1);
}

// 准备授权数据
const data = {
  machineId: machineId.replace(/-/g, ''),
  expireDays: expireDays,
  createdAt: Date.now()
};

// 使用RSA私钥签名
const sign = createSign('SHA256');
sign.update(JSON.stringify(data));
sign.end();
const signature = sign.sign(PRIVATE_KEY, 'base64');

// 将数据和签名组合成授权码
const dataBase64 = Buffer.from(JSON.stringify(data)).toString('base64');
const licenseCode = `${dataBase64}.${signature}`;

console.log('\n========== 授权码生成成功 ==========');
console.log('机器码:', machineId);
console.log('有效期:', expireDays === 0 ? '永久' : `${expireDays} 天`);
console.log('授权码:', licenseCode);
console.log('=====================================\n');

console.log('请将授权码提供给客户完成软件激活。');
