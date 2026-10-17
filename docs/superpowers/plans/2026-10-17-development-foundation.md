# AI City Development Foundation Implementation Plan

> For agentic workers: use superpowers:executing-plans for sequential implementation; one focused independent review before publishing the initial foundation.

**Goal:** 建立可复现、默认离线、适合两人使用 AI 协作的 GitHub 与 Google Cloud 基础。

**Architecture:** pnpm monorepo、Next.js 最小壳、共享 strict contracts、B 的 city 模块；云端沿用现有项目，CI 使用仅验证用途的 OIDC。

**Tech Stack:** Node 24、pnpm 11、TypeScript、Next.js、Zod、Vitest、Biome、Firebase emulator、Google Cloud。

**Spec:** `docs/superpowers/specs/2026-10-17-development-foundation-design.md`

## Global Constraints

- 日语产品 UI；简体中文文档；用户数据和密钥不进入 repository。
- 默认 mock，不调用模型、不部署公众服务、不使用 JSON service account key。
- project ID 固定为 `ai-city-511822`；区域 `asia-northeast1`。
- 单任务单 owner；账号未知时不猜测协作者、不扩大 IAM 权限。

## Review Focus

- PublicResident 拒绝嵌套或顶层私人字段；未明确同意展示不能通过 contract。
- 素材必须四方向齐全，事件版本和状态只能取已定义值。
- Firestore 基础规则对匿名、认证客户端均拒绝访问。
- Fork/PR/其他 branch 不能获得云身份；CI 验证身份没有部署权限。
- 无 Java 21 或错误 Node/pnpm 版本时给出明确环境诊断。

## Task 1 可复现本地基础

- [x] 建立 workspace、固定版本、Dev Container 配置、启动脚本与环境示例。
- [x] 编写 strict contract 的负向测试，观察缺失实现的失败，再实现最小 schema 与 fixture。
- [x] 创建日语开发壳与 city 边界；执行 format、typecheck、test、build 和 HTTP 冒烟。

## Task 2 云端基础与权限边界

- [x] 保存可重运行的初始化脚本、云配置和规则。
- [x] 启用 API，查询后创建必要资源；不覆盖已有数据或授权。
- [x] 建立仅验证用途的 OIDC 与自定义只读角色；部署默认拒绝规则并执行 emulator 测试。

## Task 3 团队与 AI 工作流

- [x] 建立 AGENTS、模块责任、AI task/handoff、Issue/PR templates、CI 与手动云验证 workflow。
- [ ] 推送初始 foundation，创建 P0 milestone 与有限任务清单，设置仓库环境变量和审查策略。
- [ ] 运行 GitHub CI 及真实 OIDC 验证，独立审查，修复后记录实际结果。

## Execution ledger

- 2026-10-17：已确认 remote 空仓库、现有 GCP 项目及 owner 权限。系统 npm 依赖损坏，使用已验证 pnpm，不修改全局 npm。协作者账号未知。
- Ruling：这是已授权的协作环境搭建，按现有两份计划书完成基础，不另建产品范围或多次请求相同授权。
- 实测：13 项单元测试、5 项 emulator 权限测试、生产 build、HTTP 与 Chrome Phaser 样例通过；prod dependency audit 无已知漏洞。
- 修正：pnpm 11 使用 allowBuilds；Google Cloud SDK 使用 --edition=standard；Firebase API 初次启用需传播时间。均按实际错误与 CLI 帮助修正。
- 独立审查：修正 WIF pool/provider 完整校验、CI 权限漂移、bucket 防护漂移及公开 manifest 网址边界。新测试先失败后通过，现共 15 项 unit tests；云端初始化重跑通过。
