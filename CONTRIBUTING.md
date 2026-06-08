# 贡献指南

感谢你有兴趣为 ClipHistory 做贡献！

## 快速开始

```bash
git clone https://github.com/yuqihe88/cliphistory.git
cd cliphistory
npm install
npm run dev
```

## 项目文档

在开始写代码之前，建议先阅读：

| 文档 | 路径 | 内容 |
|------|------|------|
| 需求规格 | [docs/requirements.md](docs/requirements.md) | 功能需求、约束条件 |
| 技术规格 | [docs/tech-spec.md](docs/tech-spec.md) | 架构设计、IPC 接口 |
| 设计规范 | [docs/design-spec.md](docs/design-spec.md) | 色彩、组件、交互 |
| 执行计划 | [docs/execution-plan.md](docs/execution-plan.md) | 里程碑、进度 |

## 开发约定

- **TypeScript** — 所有新增代码使用 TypeScript
- **类型定义** — 共享类型放在 `src/shared/types.ts`
- **IPC 通道** — 通信名称必须使用 `IPC_CHANNELS` 常量
- **颜色** — 使用 Tailwind 的 `primary-*` / `neutral-*` 色值
- **数据库** — 统一通过 `src/main/database.ts` 操作
- **安全** — `contextIsolation: true`，禁用 `nodeIntegration`

## 提交规范

- 使用语义化提交信息：`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`
- 更新 `docs/execution-plan.md` 中对应步骤的状态
- 如有需要，更新当天的 `dev-log/` 日志

## Pull Request 流程

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/my-feature`
3. 确保 `npm run build` 通过
4. 提交 PR 到 `master` 分支
5. 描述清楚改了什么、为什么改
