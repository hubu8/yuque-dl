// 测试授权系统
import { getMachineId, verifyLicenseCode } from './electron/license.js';
import { createSign } from 'crypto';
import { readFileSync } from 'fs';

async function testLicenseSystem() {
  console.log('=== 测试授权系统 ===\n');
  
  // 1. 获取机器码
  const machineId = getMachineId();
  console.log('1. 机器码:', machineId);
  
  // 2. 读取私钥
  const privateKey = readFileSync('./private-key.pem', 'utf8');
  
  // 3. 生成授权码
  const data = {
    machineId: machineId.replace(/-/g, ''),
    expireDays: 365,
    createdAt: Date.now()
  };
  
  const sign = createSign('SHA256');
  sign.update(JSON.stringify(data));
  sign.end();
  const signature = sign.sign(privateKey, 'base64');
  
  const dataBase64 = Buffer.from(JSON.stringify(data)).toString('base64');
  const licenseCode = `${dataBase64}.${signature}`;
  
  console.log('2. 生成的授权码:', licenseCode);
  
  // 4. 验证授权码
  console.log('\n3. 验证授权码...');
  const result = verifyLicenseCode(licenseCode);
  console.log('验证结果:', result);
  
  if (result.valid) {
    console.log('\n✅ 授权验证成功！');
  } else {
    console.log('\n❌ 授权验证失败！');
  }
}

testLicenseSystem().catch(console.error);
