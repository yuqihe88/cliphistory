# CLAUDE.md — ClipHistory 项目指引

> 本文件为 AI 助手（Claude Code）提供项目工作指引。
> 每次对话开始时，AI 助手应首先阅读本文件以了解项目上下文。

---

## 项目简介

**ClipHistory** 是一款 Windows 桌面历史粘贴板应用。自动记录用户复制的文字和图片，支持搜索、置顶、删除，可设定 1/3/5 天存储时长自动清理。

## 技术栈

- **桌面框架**：Electron 28+
- **前端**：React 18 + TypeScript 5 + Tailwind CSS 3
- **数据库**：sql.js（WASM 版 SQLite，替代 better-sqlite3 以避免原生编译依赖）
- **构建打包**：electron-builder（Windows exe）
- **辅助库**：electron-auto-launch（开机自启）

---

## 项目标准文件路径

所有开发必须遵循以下标准文档。**开始任何开发任务前，先查阅对应的标准文档。**

| 文档 | 路径 | 用途 |
|------|------|------|
| 📋 需求规格 | [docs/requirements.md](docs/requirements.md) | 功能需求、非功能需求、约束条件 |
| 🔧 技术规格 | [docs/tech-spec.md](docs/tech-spec.md) | 架构设计、数据模型、IPC 接口 |
| 🎨 设计规范 | [docs/design-spec.md](docs/design-spec.md) | 色彩、排版、组件规范、交互 |
| 📐 执行计划 | [docs/execution-plan.md](docs/execution-plan.md) | 里程碑、步骤状态、进度追踪 |

---

## 开发日志规范

- 日志目录：[dev-log/](dev-log/)
- 命名格式：`YYYY-MM-DD.md`
- 每次开发会话开始：创建当天的日志文件（如不存在）
- 每次开发会话结束：更新日志，记录完成事项和待办事项
- 日志模板包含：✅ 今日完成、📋 待办、🚧 问题、💡 备注

---

## 工作流程

### 开始新任务时

1. 阅读 [docs/execution-plan.md](docs/execution-plan.md)，了解当前进度
2. 找到下一个待完成的步骤
3. 阅读该步骤所属里程碑对应的标准文档
4. 创建/更新当日开发日志

### 编码规范

- 所有新增代码使用 TypeScript，类型定义放在 `src/shared/types.ts`
- IPC 通信名称必须与 `IPC_CHANNELS` 常量一致
- UI 颜色使用 Tailwind 的 `primary-*` 和 `neutral-*` 色值，不写硬编码颜色
- 组件遵循 [docs/design-spec.md](docs/design-spec.md) 中的组件规范
- 数据库操作统一通过 `src/main/database.ts` 模块，不在其他地方直接操作 SQLite

### 提交规范

- 每个步骤完成后标记状态
- 更新 `docs/execution-plan.md` 中对应步骤的状态为 ✅
- 更新当日 dev-log 文件

---

## 项目目录结构

```
d:\information\copy\
├── CLAUDE.md             ← 本文件
├── docs/
│   ├── requirements.md   ← 需求规格
│   ├── tech-spec.md      ← 技术规格
│   ├── design-spec.md    ← 设计规范
│   └── execution-plan.md ← 执行计划
├── dev-log/
│   └── YYYY-MM-DD.md     ← 开发日志
├── src/
│   ├── main/             ← Electron 主进程
│   └── renderer/         ← React 渲染进程
└── package.json
```

---

## 关键约束

- 平台：仅 Windows 10/11 x64
- 安全：`contextIsolation: true`，禁用 `nodeIntegration`
- 隐私：不进行任何网络请求，数据全部本地存储
- 用户要求：所有复制内容都记录，不做密码过滤

---

## 当前项目状态（2026-06-04）

**M0 ✅ | M1 ✅ | M2 ✅ | M3 ✅ | M4 ✅ | M5 ✅ | M6 🔵 进行中**

### 已完成
- Electron + React + TypeScript + Tailwind + Vite 完整项目骨架
- 8 个主进程模块：入口 / 数据库(sql.js) / 粘贴板监听 / 托盘 / 快捷键 / preload / 开机自启 / auto-launch
- 8 个 React 组件：App / TitleBar / SearchBar / ClipCard / ClipList / EmptyState / ConfirmDialog / Settings / ErrorBoundary
- TypeScript 编译 ✅ | Vite 构建 ✅ | 开发模式运行 ✅
- M4.4 开机自启（electron-auto-launch 注册/注销 + Settings 联动）
- M5.2 定时清理（setInterval 每小时检查过期记录）
- 应用图标 assets/icon.png（256×256 PNG）
- 打包测试：release/win-unpacked/ClipHistory.exe 生成成功

### 启动方式
```bash
npm run dev:renderer   # 终端1：Vite 开发服务器 (localhost:5173)
npm run dev:main       # 终端2：编译主进程 + 启动 Electron
# 需要 DevTools：DEV_TOOLS=1 npm run dev:main
```

### 待完成
- [ ] 交互功能实测（复制/搜索/置顶/删除/设置全流程）
- [ ] NSIS 安装包制作（需 GitHub 可访问的网络）
- [ ] 生产模式验证（NODE_ENV=production）
- [ ] 性能优化（大列表虚拟滚动/数据库查询优化）
- [ ] UI 微调（对照设计规范）

详见 [docs/execution-plan.md](docs/execution-plan.md) 和 [dev-log/2026-06-04.md](dev-log/2026-06-04.md)。