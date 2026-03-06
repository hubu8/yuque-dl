import { createHash, createVerify } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

// 授权文件路径
const LICENSE_FILE = join(os.homedir(), '.yuque-dl-license');

// 公钥（用于验证签名）
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAm0wCq3/6vxxE/gZo1r+o
insjOMvj+/sXTLxgmkbfIQzynDLIYCmx1KQPzHAiVK+k/Q0HKg07u3+IhP5JJcaT
V9ILTsxIjHBJPma46AqT3vw1PIK01SV9T5g+xjecqq6rA/GYCLIj+A4QlrXMDrOY
Xa2h/DdjTxhnTE508FyvgqEjGjLLo0OBrNQcNmJvrhoXRf3UDnvVjiBxz24GYZ0e
72shSNa/eoAvU/e+SH4MdvNpSJsTLVwIVfznXk7a3NmAazH5KUyfkwHQKNNmv3nF
56ef1K2az2KDVHYO1yO+tbfv+uOoLFwSiZ0VKaxsLLbIXgcC7m0I8RsJH0aNViRz
9wIDAQAB
-----END PUBLIC KEY-----`;

/**
 * 获取机器唯一标识
 * 基于所有MAC地址、主机名、平台、架构等生成
 */
export function getMachineId() {
  const interfaces = os.networkInterfaces();
  const macAddresses = [];
  
  // 获取所有非本地MAC地址并排序，确保顺序一致
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac) {
        macAddresses.push(iface.mac);
      }
    }
  }
  
  // 排序MAC地址，确保顺序一致
  macAddresses.sort();
  
  // 组合机器信息生成唯一标识
  const machineInfo = [
    macAddresses.join(','),
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || '',
    os.totalmem().toString()
  ].join('|');
  
  // 使用SHA256生成机器码
  const machineId = createHash('sha256')
    .update(machineInfo)
    .digest('hex')
    .substring(0, 16)
    .toUpperCase();
  
  // 格式化：XXXX-XXXX-XXXX-XXXX
  return machineId.match(/.{4}/g).join('-');
}

/**
 * 验证授权码
 * @param {string} licenseCode - 授权码（格式：base64数据.base64签名）
 * @returns {object} 验证结果
 */
export function verifyLicenseCode(licenseCode) {
  try {
    // 分离数据和签名
    const parts = licenseCode.split('.');
    if (parts.length !== 2) {
      return {
        valid: false,
        message: '授权码格式错误'
      };
    }
    
    const [dataBase64, signatureBase64] = parts;
    const data = Buffer.from(dataBase64, 'base64').toString('utf8');
    const signature = Buffer.from(signatureBase64, 'base64');
    
    // 验证签名
    const verify = createVerify('SHA256');
    verify.update(data);
    verify.end();
    
    const isValid = verify.verify(PUBLIC_KEY, signature);
    
    if (!isValid) {
      return {
        valid: false,
        message: '授权码签名验证失败'
      };
    }
    
    // 解析授权数据
    const licenseData = JSON.parse(data);
    const currentMachineId = getMachineId().replace(/-/g, '');
    
    // 验证机器码是否匹配
    if (licenseData.machineId !== currentMachineId) {
      return {
        valid: false,
        message: '授权码与当前设备不匹配'
      };
    }
    
    // 验证是否过期
    if (licenseData.expireDays > 0) {
      const expireTime = licenseData.createdAt + (licenseData.expireDays * 24 * 60 * 60 * 1000);
      if (Date.now() > expireTime) {
        return {
          valid: false,
          message: '授权码已过期'
        };
      }
      
      const remainDays = Math.ceil((expireTime - Date.now()) / (24 * 60 * 60 * 1000));
      return {
        valid: true,
        message: `授权有效，剩余 ${remainDays} 天`,
        expireDays: remainDays
      };
    }
    
    return {
      valid: true,
      message: '永久授权有效',
      expireDays: -1
    };
  } catch (error) {
    console.error('验证授权码失败:', error);
    return {
      valid: false,
      message: '授权码格式错误'
    };
  }
}

/**
 * 保存授权码到本地
 */
export function saveLicenseCode(licenseCode) {
  try {
    writeFileSync(LICENSE_FILE, licenseCode, 'utf8');
    return true;
  } catch (error) {
    console.error('保存授权码失败:', error);
    return false;
  }
}

/**
 * 从本地读取授权码
 */
export function loadLicenseCode() {
  try {
    if (existsSync(LICENSE_FILE)) {
      return readFileSync(LICENSE_FILE, 'utf8');
    }
    return null;
  } catch (error) {
    console.error('读取授权码失败:', error);
    return null;
  }
}

/**
 * 检查是否已授权
 */
export function isLicensed() {
  const licenseCode = loadLicenseCode();
  if (!licenseCode) {
    return false;
  }
  
  const result = verifyLicenseCode(licenseCode);
  return result.valid;
}

/**
 * 获取授权信息
 */
export function getLicenseInfo() {
  const licenseCode = loadLicenseCode();
  if (!licenseCode) {
    return {
      licensed: false,
      message: '未授权'
    };
  }
  
  const result = verifyLicenseCode(licenseCode);
  return {
    licensed: result.valid,
    message: result.message,
    expireDays: result.expireDays
  };
}