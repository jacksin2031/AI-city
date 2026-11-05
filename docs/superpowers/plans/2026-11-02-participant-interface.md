# 参与者界面实施计划

**目标：** 沿用现有手机界面，实现明确标示为示例的完整参与流程。

**架构：** `/join` 使用客户端组件保存临时步骤、昵称及问卷答案。沿用 `ParticipantShell`、现有城市背景与样式；不上传、不持久化、不发布。

**技术：** Next.js、React、TypeScript、Playwright。设计：`docs/superpowers/specs/2026-11-02-participant-interface-design.md`。

## 约束与重点

- 日语界面；照片不可用、角色示例、未保存及未发布状态均明确显示。
- 空白昵称不得继续，Unicode 输入及返回修改应保留；问卷允许跳过，返回后保留答案。
- 直接访问 `/join` 不能发布或被误认作真实授权；刷新后不得声称已保存。
- 小屏可滚动，键盘可操作；不修改契约或城市展示。

## 任务

1. 在 `tests/e2e/participant.spec.ts` 添加流程、返回、跳过、空白昵称及无真实发布测试；运行确认缺失功能导致失败。
2. 修改 `apps/web/app/join/page.tsx`，新增 `apps/web/app/participant-flow.tsx` 和必要的 `styles.css` 样式，实现昵称、照片说明、六题、示例预览及未发布确认；运行流程测试。
3. 检查小屏、键盘与控制台，运行 `pnpm check`、`pnpm test:rules`、`pnpm test:e2e`；记录环境及现有失败，不将本地测试等同真机或云端验收。
