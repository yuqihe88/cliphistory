# ClipHistory — Windows 桌面历史粘贴板

> 自动记录复制的文字和图片，支持搜索、置顶、删除，可设定存储时长自动清理。

<p align="center">
  <img src="assets/icon.png" alt="ClipHistory Icon" width="128" height="128" />
</p>

## ✨ 功能特性

- **📋 自动记录** — 后台自动捕获文字和图片粘贴板内容，无需手动操作
- **🔍 实时搜索** — 300ms 防抖搜索，快速定位历史记录
- **📌 置顶管理** — 重要内容一键置顶，不会被自动清理
- **🗑️ 安全删除** — 带确认弹窗，防止误删
- **⏱️ 自动清理** — 支持 1/3/5 天存储时长，置顶内容受保护
- **⚡ 全局快捷键** — `Ctrl+Shift+V` 一键呼出/隐藏窗口
- **🔔 系统托盘** — 最小化到托盘后台运行，不占用任务栏
- **🚀 开机自启** — 可选开机自动启动

## 🖥️ 系统要求

| 要求 | 说明 |
|------|------|
| 操作系统 | Windows 10 / 11 x64 |
| 内存 | 建议 4GB+ |
| 磁盘 | < 100MB（不含历史数据） |

## 📸 界面截图

> 待补充 — 运行应用后截取主窗口、搜索、设置页面

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 27+ |
| 前端 | React 18 + TypeScript 5 |
| UI 框架 | Tailwind CSS 3 |
| 数据库 | sql.js（WASM 版 SQLite） |
| 构建 | Vite 5 + electron-builder |
| 辅助 | electron-auto-launch（开机自启） |

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 终端 1：启动 Vite 开发服务器
npm run dev:renderer

# 终端 2：编译主进程 + 启动 Electron
npm run dev:main
```

或一键启动：

```bash
npm run dev
```

打开 DevTools：

```bash
DEV_TOOLS=1 npm run dev:main
```

### 构建打包

```bash
# 构建（TypeScript 编译 + Vite 打包）
npm run build

# 生成解压版 exe（到 release/win-unpacked/）
npm run pack

# 生成 NSIS 安装包（需 GitHub 网络访问）
npm run dist
```

## 📁 项目结构

```
├── docs/                   # 项目文档
│   ├── requirements.md     # 需求规格
│   ├── tech-spec.md        # 技术规格（架构、IPC 接口）
│   ├── design-spec.md      # 设计规范（色彩、组件）
│   └── execution-plan.md   # 执行计划（里程碑）
├── dev-log/                # 开发日志
├── src/
│   ├── main/               # Electron 主进程
│   │   ├── index.ts        # 入口、窗口、IPC、生命周期
│   │   ├── database.ts     # SQLite 数据库（sql.js）
│   │   ├── clipboard.ts    # 粘贴板监听（500ms 轮询）
│   │   ├── tray.ts         # 系统托盘
│   │   ├── shortcut.ts     # 全局快捷键
│   │   ├── auto-launch.ts  # 开机自启
│   │   └── preload.ts      # contextBridge 安全桥接
│   ├── renderer/           # React 渲染进程
│   │   ├── App.tsx         # 主应用组件
│   │   ├── components/     # UI 组件
│   │   └── styles/         # 全局样式
│   └── shared/             # 共享类型与常量
│       └── types.ts        # IPC 通道、数据接口
├── assets/                 # 图标资源
├── package.json
└── tailwind.config.js
```

## 🔒 隐私说明

- **全部本地存储** — 不进行任何网络请求
- **不做密码过滤** — 所有复制内容均被记录（请注意敏感信息安全）
- 历史数据存储在 `%APPDATA%/ClipHistory/` 目录下

## 📄 License

MIT License

---

🤖 部分代码由 Claude Code 辅助生成
