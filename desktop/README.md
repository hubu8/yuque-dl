# 语雀知识库下载器 - 桌面版

基于 [yuque-dl](https://github.com/gxr404/yuque-dl) 封装的 Electron 桌面 GUI 应用，支持授权码激活。

## 功能概览

- 📥 **知识库下载**：输入语雀知识库 URL，批量下载为 Markdown 文件
- 🌐 **Web 预览**：内置本地预览服务，在浏览器中阅读下载的文档
- 🔄 **格式转换**：将 Markdown 批量转换为 PDF 或 Word 格式，支持并发控制
- 🔑 **授权管理**：RSA 非对称签名授权，支持多种授权时长（30分钟/1天/1年/3年/永久）

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

采用 RSA 非对称签名模式，公钥打包进客户端，私钥仅在本地保留。支持设置授权有效期。

### 文件说明

| 文件 | 用途 | 是否打包进安装包 |
|------|------|:---:|
| `keys/public.pem` | 公钥，客户端验证授权码 | ✅ |
| `keys/private.pem` | 私钥，生成授权码 | ❌ |
| `keygen.js` | 授权码生成工具（Web 版） | ❌ |
| `license.js` | 授权逻辑（生成机器码、验签、过期检查） | ✅ |

### 授权码格式

- **新格式**：`过期时间戳:Base64签名`，签名内容 = `机器码|过期时间戳`
- **旧格式**：纯 Base64 签名（自动兼容为永久授权）
- `expireAt = 0` 表示永久授权，`expireAt > 0` 为过期时间戳（毫秒）

### 生成授权码

运行 Web 版授权码生成工具：

```bash
cd desktop
node keygen.js
```

浏览器自动打开 `http://127.0.0.1:19999`，在页面中：

1. 输入客户的机器码（16位十六进制，如 `A1B2-C3D4-E5F6-7890`）
2. 选择授权时长：
   - **30 分钟** - 测试用
   - **1 天** - 短期试用
   - **1 年** - 标准授权
   - **3 年** - 长期授权
   - **永久** - 买断授权
3. 点击「生成授权码」
4. 复制授权码发给客户

### 激活流程

1. 客户安装软件后启动，界面显示机器码（基于 CPU + 主板序列号 + MAC 地址生成）
2. 客户将机器码发送给你
3. 你在本地运行 `node keygen.js`，在网页中生成授权码
4. 将授权码发给客户，客户输入后点击「激活」
5. 激活后 Tab 栏右侧显示授权到期时间，过期后会弹出重新激活窗口

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

### 下载知识库

1. 输入语雀知识库的完整 URL
2. 选择下载保存目录
3. 如果是私有知识库，展开「认证设置」填写 Token
4. 按需调整高级选项（默认隐藏页脚信息）
5. 点击「开始下载」

### Web 预览

1. 切换到「🌐 预览」标签页
2. 选择已下载的知识库文件夹（包含 .md 文件的目录）
3. 点击「启动预览」，浏览器自动打开预览页面
4. 预览服务运行在本地 18888 端口，关闭软件时自动停止

### 格式转换

1. 切换到「🔄 转换」标签页
2. 选择输出格式（PDF 或 Word）
3. 选择已下载的知识库目录
4. 调整并发数（PDF 建议 2~4，Word 建议 5~10）
5. 点击「开始转换」
6. 转换结果保存在知识库目录同级的 `xxx_pdf` 或 `xxx_word` 文件夹中

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
