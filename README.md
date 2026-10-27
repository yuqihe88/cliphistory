<p align="center">
  <img src="assets/icon.png" alt="ClipHistory" width="96" height="96" />
</p>

<h1 align="center">ClipHistory</h1>

<p align="center">
  <strong>📋 Windows 桌面历史粘贴板 · 轻量 · 离线 · 零配置</strong>
</p>

<p align="center">
  <a href="https://github.com/yuqihe88/cliphistory/releases"><img src="https://img.shields.io/github/v/release/yuqihe88/cliphistory?color=2196F3&style=flat-square" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/yuqihe88/cliphistory?style=flat-square" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-blue?style=flat-square" alt="Platform" /></a>
  <a href="#"><img src="https://img.shields.io/badge/electron-27%2B-9cf?style=flat-square" alt="Electron" /></a>
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
</p>

---

## 📸 预览

> 🚧 截图待补充 — 运行 `npm run dev` 后截取以下画面：
>
> | 画面 | 说明 |
> |------|------|
> | 主窗口 | 历史记录列表 + 搜索栏 + 卡片 |
> | 搜索 | 输入关键词实时过滤 |
> | 置顶 | 置顶卡片蓝色左边框 |
> | 设置 | 存储天数 / 开机自启 / 清空 |
> | 托盘 | 系统托盘图标 + 右键菜单 |

---

## ✨ 功能亮点

| 功能 | 说明 |
|------|------|
| 📋 **自动捕获** | 后台静默记录文字和图片粘贴板，无需手动操作 |
| 🔍 **即时搜索** | 300ms 防抖全文搜索，快速定位历史记录 |
| 📁 **项目素材** | 按项目永久保存文字、图片、视频和文件，支持搜索、导入副本和一键复制 |
| 📌 **置顶保护** | 重要内容置顶显示，自动清理时保留 |
| ⏱️ **智能清理** | 1/3/5 天可调，每小时后台静默清理 |
| 🖱️ **一键回写** | 点击卡片瞬间复制回粘贴板 |
| ⚡ **全局快呼** | `Ctrl+Shift+V` 任意位置弹出/隐藏窗口 |
| 🔔 **托盘驻留** | 关闭窗口缩小到系统托盘，首次关闭弹气泡提示 |
| 🚀 **开机自启** | 可选开机自动启动，设置页面一键开关 |
| 🔒 **完全离线** | 零网络请求，数据 100% 本地 SQLite 存储 |
| 🎨 **简洁界面** | Tailwind CSS 淡蓝主题，380×560 小窗口 |

---

## 🖥️ 系统要求

- **操作系统**：Windows 10 / 11 x64
- **内存**：空闲 100MB+
- **磁盘**：安装 < 200MB

---

## 📦 快速安装

### 下载安装包（推荐）

> 🚧 即将发布 — 在 [Releases](https://github.com/yuqihe88/cliphistory/releases) 页面下载 `ClipHistory-Setup-1.0.0.exe`

### 开发者运行

```bash
# 1. 克隆仓库
git clone https://github.com/yuqihe88/cliphistory.git
cd cliphistory

# 2. 安装依赖
npm install

# 3. 启动开发模式
npm run dev
```

---

## 📁 使用项目素材

点击顶部「项目」→「新建项目」，可以按客户、工作事项或创作任务分类。
在项目中「添加文字」直接输入正文，无需标题；也可以「导入图片 / 视频 / 文件」。
单击素材卡片即可复制，到其他应用粘贴；聚焦卡片后按 Enter 或空格也能复制。
历史记录右侧的文件夹按钮可以「移动或复制到项目」，项目素材也有同样入口，
选择「复制到项目」保留原内容，选择「移动到项目」则在目标保存成功后移除原位置的内容。
项目支持重命名、搜索、类型筛选和手动删除。

原“提示词”分类已合并到项目；旧提示词自动保存在「常用文本」项目，保留原内容。

项目素材不会被历史自动清理或「清空全部历史」删除。导入的文件保存在应用数据目录的 `project-files/` 下，
每份素材保存独立副本并保留原文件名，因此移动原文件不会影响项目；删除项目时仅移除保存的副本。

## 🛠️ 技术架构

```
┌─────────────────────────────────────────┐
│               Electron 27               │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │  主进程      │  │  渲染进程 (React) │  │
│  │  • clipboard │  │  • App.tsx       │  │
│  │  • database  │  │  • ClipCard      │  │
│  │  • tray      │  │  • SearchBar     │  │
│  │  • shortcut  │  │  • Settings      │  │
│  │  • preload   │  │  • ...           │  │
│  └──────┬───────┘  └────────┬─────────┘  │
│         │    IPC (安全桥)     │            │
│         └────────────────────┘            │
│              │                            │
│     ┌────────┴────────┐                   │
│     │  sql.js (WASM)  │                   │
│     │  SQLite 本地库   │                   │
│     └─────────────────┘                   │
└─────────────────────────────────────────┘
```

| 层级 | 技术选型 | 选型原因 |
|------|---------|---------|
| 框架 | Electron 27 | Windows 桌面应用最佳方案 |
| UI | React 18 + TypeScript 5 | 类型安全，生态丰富 |
| 样式 | Tailwind CSS 3 | 原子化 CSS，快速开发 |
| 数据库 | sql.js (SQLite WASM) | 避免原生编译依赖，纯 JS 运行 |
| 构建 | Vite 5 + electron-builder | 极速 HMR，一键打包 NSIS |
| 安全 | contextIsolation + preload | 渲染进程隔离，安全 IPC 桥接 |

---

## 📁 项目结构

```
src/
├── main/                  # Electron 主进程
│   ├── index.ts           # 入口 · 窗口 · IPC · 生命周期
│   ├── database.ts        # SQLite CRUD · 清理 · 防抖写入
│   ├── clipboard.ts       # 粘贴板 500ms 轮询监听
│   ├── tray.ts            # 系统托盘 · 气泡通知
│   ├── shortcut.ts        # 全局快捷键 Ctrl+Shift+V
│   ├── auto-launch.ts     # Windows 开机自启
│   └── preload.ts         # contextBridge 安全桥接
├── renderer/              # React 渲染进程
│   ├── App.tsx            # 根组件 · 状态管理 · 事件处理
│   ├── components/        # 8 个 UI 组件
│   │   ├── TitleBar.tsx       # 标题栏
│   │   ├── SearchBar.tsx      # 搜索栏（300ms 防抖）
│   │   ├── ClipCard.tsx       # 历史卡片（文字/图片）
│   │   ├── ClipList.tsx       # 滚动列表
│   │   ├── EmptyState.tsx     # 空状态提示
│   │   ├── ConfirmDialog.tsx  # 确认弹窗
│   │   ├── Settings.tsx       # 设置页面
│   │   └── ErrorBoundary.tsx  # 错误边界
│   └── styles/index.css   # 全局样式 · 动画
└── shared/types.ts        # IPC 通道 · 数据模型 · 类型
```

---

## 🔒 隐私

- **零网络通信** — 不发送任何请求，不收集任何数据
- **本地存储** — 所有数据保存在 `%APPDATA%/ClipHistory/`
- **无密码过滤** — 所有复制内容均被记录，请注意敏感信息安全

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！详见 [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📄 License

[MIT](LICENSE) © 2026 yuqihe88

---

<p align="center">
  <sub>🤖 部分代码由 Claude Code 辅助生成</sub>
</p>
