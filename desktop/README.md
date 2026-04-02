# 语雀知识库下载器 - 桌面版

基于 [yuque-dl](https://github.com/gxr404/yuque-dl) 封装的 Electron 桌面 GUI 应用，支持授权码激活。

## 开发

```bash
cd desktop
npm install
npm start
```

## 打包分发

```bash
# Windows 安装包 (.exe)
npm run build:win

# macOS 安装包 (.dmg)
npm run build:mac

# Linux 安装包 (.AppImage)
npm run build:linux
```

打包后的安装文件在 `desktop/release/` 目录下，可直接发送给客户安装使用。

## 授权码体系

采用 RSA 非对称签名模式，公钥打包进客户端，私钥仅在本地保留。

### 文件说明

| 文件 | 用途 | 是否打包进安装包 |
|------|------|:---:|
| `keys/public.pem` | 公钥，客户端验证授权码 | ✅ |
| `keys/private.pem` | 私钥，生成授权码 | ❌ |
| `keygen.js` | 授权码生成工具 | ❌ |
| `license.js` | 授权逻辑（生成机器码、验签） | ✅ |

### 激活流程

1. 客户安装软件后启动，界面显示机器码（基于 CPU + 主板序列号 + MAC 地址生成）
2. 客户将机器码发送给你
3. 你在本地运行：
   ```bash
   node keygen.js <机器码>
   # 示例: node keygen.js A1B2-C3D4-E5F6-7890
   ```
4. 将生成的授权码发给客户，客户输入后点击「激活」

### 重新生成密钥对

如需更换密钥（比如私钥泄露），运行：

```bash
node -e "
const crypto = require('crypto');
const fs = require('fs');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
fs.writeFileSync('keys/public.pem', publicKey);
fs.writeFileSync('keys/private.pem', privateKey);
console.log('密钥对已重新生成');
"
```

> ⚠️ 更换密钥后，之前发出的所有授权码将失效，客户需要重新激活。

## 使用说明

1. 输入语雀知识库的完整 URL
2. 选择下载保存目录
3. 如果是私有知识库，展开「认证设置」填写 Token
4. 按需调整高级选项
5. 点击「开始下载」

## 打包问题排查

### 1. npm install 时 electron 下载失败 (ECONNRESET)

**原因**：国内网络无法直连 GitHub Releases 下载 Electron 二进制文件。

**解决**：在 `desktop/.npmrc` 中配置国内镜像：

```ini
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 2. electron-builder 版本兼容问题 (Invalid Version)

**原因**：`electron-builder@25` 的依赖 `7zip-bin` 在部分 npm 版本下存在 semver 解析异常。

**解决**：使用 `electron-builder@24.13.3` + `electron@28`，兼容性更好。

### 3. winCodeSign 解压失败 (Cannot create symbolic link)

**原因**：electron-builder 的 winCodeSign 组件包含 macOS 符号链接文件，Windows 普通用户没有创建 symlink 的权限，导致 7zip 解压失败并无限重试。

**解决**：跳过代码签名（无签名证书时本来也不需要）：

- `package.json` 的 build.win 中设置：
  ```json
  "signAndEditExecutable": false,
  "sign": null
  ```
- build 脚本中设置环境变量：
  ```json
  "build:win": "set CSC_IDENTITY_AUTO_DISCOVERY=false&& electron-builder --win"
  ```
- 如果缓存已损坏，先清理：
  ```powershell
  Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
  ```
