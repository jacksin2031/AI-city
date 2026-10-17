# AI City 共同开发基础设计

目标是让两位主要使用 AI 的开发者在同一私人 GitHub repository 中工作，独立启动、验证并提交可以审查的变更。沿用已有 A/B 计划书，不在本阶段实现完整访客上传、生成、城市游戏或部署公众服务。

## 已确认的环境

- GitHub：`jacksin2031/AI-city`，私人空仓库，默认分支 `main`。
- Google Cloud：`ai-city-511822`，项目编号 `391632496355`，已有 billing。
- 主要服务日本公众，所有产品 UI 使用日语；计划与协作文档使用简体中文。
- 协作者账号未知，邀请及个人 IAM 授权保留为明确待办。

## 结构与责任

使用 pnpm workspace 和统一 TypeScript。`apps/web` 提供 Next.js 的最小可运行壳，A 负责参与流程和服务端；`apps/web/app/city` 与 `packages/city` 由 B 负责展示。`packages/contracts` 包含严格解析、版本和无私人数据的 fixture，是双方接口来源。避免两套后端、重复模型 SDK 和多余编排工具。

默认 mock 模式，不需要云端凭证，不收集真实照片，不调用付费模型。基础界面仅显示日语开发状态，不冒充已经完成的产品。真实业务功能另由 P0 issues 实现。

## 云端边界

复用现有项目，使用东京 `asia-northeast1`。启用后续所需 API，建立 Standard Firestore、私有上传与资产桶、空容器仓库、限速任务队列和独立 runtime 身份。默认规则拒绝所有客户端读写，直到相应业务权限经过测试。

GitHub 使用 OIDC/WIF。CI 验证身份只允许指定 repository ID、owner ID、main 分支、development environment；只授予项目元数据和启用服务的读取权，不授予部署权。runtime 不生成 JSON key，不预授予尚未使用的资源权限。本阶段不部署 Cloud Run，不提交模型请求，不承诺预算警报是实时断费开关。

## AI 协作与验证

仓库级 AGENTS、模块级说明、任务模板、PR 清单、责任映射和小任务 handoff 共同约束 AI。每项任务指定一名 owner，必须读取相关源码和 contract，记录修改、验证、剩余限制；禁止把用户数据、token、照片或服务密钥加入源码、fixture、issue 或日志。

CI 执行格式检查、类型检查、contract 测试、构建和 Firestore emulator 拒绝访问测试。Dev Container/Codespaces 配置统一 Node、pnpm、Java 21；不会自动创建收费 Codespace。云端验证必须通过 GitHub 实际 workflow 记录，不能只检查 YAML。

完成标准：本地可启动；必要检查通过；初始源码和两份计划书已推送；GitHub CI 与 OIDC 验证有实际结果；云资源可查询；未完成邀请、预算决策或权限限制如实列出。
