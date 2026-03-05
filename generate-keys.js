// 生成RSA密钥对
// 使用方法: node generate-keys.js

import { generateKeyPairSync } from 'crypto';

console.log('正在生成RSA密钥对...\n');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

console.log('========== 公钥（用于客户端验证） ==========');
console.log(publicKey);
console.log('\n========== 私钥（用于生成授权码，请妥善保管） ==========');
console.log(privateKey);
console.log('\n注意：请将公钥复制到 electron/license.js 文件中的 PUBLIC_KEY 变量');
console.log('私钥用于生成授权码，不要泄露给任何人！');