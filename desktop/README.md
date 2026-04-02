# 语雀知识库下载器 - 桌面版

基于 [yuque-dl](https://github.com/gxr404/yuque-dl) 封装的桌面 GUI 应用。

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

打包后的安装文件在 `desktop/release/` 目录下，可直接发送给其他人安装使用。

## 使用说明

1. 输入语雀知识库的完整 URL
2. 选择下载保存目录
3. 如果是私有知识库，展开「认证设置」填写 Token
4. 按需调整高级选项
5. 点击「开始下载」
