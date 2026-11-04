# Spine 角色生产整合 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 将参与者授权照片、持久生成任务、Spine 运行包及自动发布接入 AI City。

**Architecture:** AI City 服务端管理会话、同意、私有数据和发布，隔离 worker 复用现有 Spine pipeline，城市只消费验证后的公开素材。先完成向后兼容的素材接口，再逐步接通本地合成流程及受控真实适配器。

**Tech Stack:** TypeScript、Zod、Next.js、现有 visitor store、Python Spine pipeline、Spine Runtime、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-05-spine-production-integration-design.md`

## Global Constraints

- 日语用户界面；不提交照片、密钥或私有素材；真实模型默认关闭。
- 不绕过用户会话、同意、撤回、完整性及工具已有审核条件。
- 合成数据和 mock 验证不代表真实模型、生产部署或目标设备验收。

## Review Focus

- 非法资源路径或混合版本：契约测试拒绝穿越、外部来源和重复资源。
- 未授权或撤回后回调：服务端事务测试证明不公开。
- 未知外部结果：worker 测试证明不重复发送。
- 坏图片和超大输入：上传边界测试证明不进入存储。
- 资源损坏或浏览器加载失败：完整性与渲染测试证明不冒充真实角色。

### Task 1: 公开 Spine 素材契约

**Files:** `packages/contracts/src/index.ts`, `packages/contracts/src/v02.test.ts`, `packages/contracts/CHANGELOG.md`, `docs/CONTRACTS.md`。

- [ ] 为旧 AvatarManifest 增加可选、严格限制 `/avatars/` 范围的 Spine Runtime 描述，版本固定支持 4.3，限制 JSON、atlas、PNG 和方向守卫的路径及一致性。
- [ ] 用正负样例验证有效描述、旧 manifest 兼容、外部 URL、穿越和跨角色资源拒绝。
- [ ] 更新契约文档并运行对应 Vitest。

### Task 2: 私有照片与持久任务

**Files:** 参与端、服务端、visitor store、contracts、对应 tests。

- [ ] 定义与会话绑定的版本化处理及自动发布同意、受限图片输入、任务状态与取消／撤回语义。
- [ ] 先用合成图片验证大小、类型、解码、同意、存储、并发及撤回；实现事务化记录和私有存储适配器。
- [ ] 处理工具 `photo_import.py` 按原图 SHA 保存原始 `.bin`、按像素去重并共用工作图的事实：必须先设计并测试隔离、引用计数及撤回后的安全删除，不能以清除任务中的摘要冒充照片删除。

### Task 3: 受控 worker 与自动发布

**Files:** 新 worker 适配器、任务服务及对应 tests。

- [ ] 模拟 worker 完成、失败、未知、恢复、重复投递和撤回竞争，保证不重复外部调用及不发布无效结果。
- [ ] 接入现有 Python pipeline 并保留其审核、限额和结果完整性；默认不调用真实模型。

### Task 4: 城市播放与端到端验证

**Files:** `packages/city/src`、参与页面、相关 contract fixtures、浏览器 tests。

- [ ] 加载完整性校验后的 Spine 资源，映射方向和动作并应用方向守卫；失败显示明确占位。
- [ ] 使用合成数据验证从授权提交到自动发布及撤回的浏览器流程；运行 `pnpm check`、`pnpm test:rules` 和 `pnpm test:e2e` 并报告限制。
- [x] 城市 renderer 接受每位居民独立的动画画布；`/animation-test` 用明确标示的合成图形验证 three.js 城市场景、方向映射及纹理刷新，不包含 Spine Runtime，也不是生成角色。
- [ ] 确认 Spine Runtime 使用与再分发许可后，接入实际 Spine 播放器、方向守卫与经过授权的运行包；不得将合成画布的验证标为 Spine 端到端通过。

### Task 5: 真实环境验收

- [ ] 确认授权素材、运行环境、部署位置和保留策略，明确获得真实调用和部署授权。
- [ ] 测试真实角色、目标设备性能及故障恢复；未实测的项目保持未验收。
