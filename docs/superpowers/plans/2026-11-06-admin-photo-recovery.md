# 管理端照片生成监控与紧急修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员在手机上能看到照片 Worker 是否在线和每个任务的状态，并能取消、重做、改成预设角色，或调整已生成角色的头发、手、脚位置。

**Architecture:** Worker 向参加者存储写心跳；管理 API 在 `device-http.ts` 里新增一组受管理员令牌保护的路由，读取任务并执行修复动作（全部走存储事务，沿用 `jobs.ts` 的不变量）；位置调整是挂在任务记录上的一份「调整值」，随公开快照下发，平板在绘制时叠加，原始 bundle 不变。

**Tech Stack:** TypeScript、Next.js（`apps/web`）、zod、Firestore（`FirestoreVisitorStore`）、Spine canvas（`packages/city`）、vitest、Playwright、biome。

**Spec:** `docs/superpowers/specs/2026-11-06-admin-photo-recovery-design.md`

## Global Constraints

- 面向管理员的 UI 全部为日语；文档与代码注释外的项目文档为简体中文。
- 管理员权限单一，沿用 `device.authorizeParticipant(token)` 与 `validateRequestOrigin`；不新增角色。
- 任何响应不得包含照片、`photoSha256`、`photoGeneration`、`owner`、`consent`、存储路径。
- 重做（会调用付费模型）必须带 `confirmCost: true`，并受 `meta/spine-live-budget` 约束；不得绕过。
- 不得放宽 `apps/web/lib/spine/jobs.ts` 中 `recordSchema` 的状态不变量。
- 已发布 bundle 文件不可改；调整值是独立字段。
- 默认离线 mock 必须可运行：未启用访客存储时，新增路由返回 `VISITORS_DISABLED`（503），界面显示「未接続」。
- 心跳间隔 30 秒；离线判定 2 分钟；`RUNNING` 异常阈值 15 分钟；任务清单最多 200 条。
- 修复记录保留最近 50 条，只含时间、动作、任务短码，不含操作者身份。
- 运行 `pnpm exec biome check --write <改动文件>`；提交信息结尾加 `Co-Authored-By` 行；工作树里其他人的改动不要顺手提交。

## Review Focus

1. 管理响应泄露内部字段（owner、哈希、同意、路径）→ Task 3 的隐私测试逐字段断言。
2. 两位管理员同时点「重做」→ 第二次得到 `INVALID_TRANSITION`，预算只扣一次 → Task 4。
3. Worker 恢复上线／心跳时间在未来（时钟偏差）→ 未来超过 5 分钟视为无效、判离线 → Task 2。
4. 手工构造的调整值（超范围、NaN、未知部位、未发布的任务）→ 一律拒绝 → Task 6、8。
5. 参加者 session 已过期时「改成预设角色」→ 拒绝且不写任何东西 → Task 5。
6. 任务超过 200 条 → 只返回 200 条并带 `truncated: true`，不崩溃 → Task 1、3。

---

### Task 1: 存储层的任务列表

**Files:**
- Modify: `apps/web/lib/visitor/store.ts`、`apps/web/lib/visitor/test-store.ts`、`apps/web/lib/visitor/firestore.ts`
- Test: `apps/web/lib/visitor/test-store.test.ts`（新建）

**Interfaces:**
- Produces: `VisitorStore.listJobs(limit: number): Promise<Array<{ id: string; value: StoredDocument }>>`。`id` 是文档名去掉 `jobs/` 前缀（如 `spine-<uuid>`）；`limit` 为 1–201（多取 1 条用来判断是否被截断）；返回顺序不保证。

- [ ] **Step 1: 写失败测试** `test-store.test.ts`：`MemoryVisitorStore` 写入 `jobs/spine-a`、`jobs/spine-b`、`sessions/x` 后，`listJobs(10)` 只返回两个 job 且 `id` 为 `spine-a`、`spine-b`；`listJobs(1)` 返回 1 条；`listJobs(0)` 和 `listJobs(202)` 抛出。
- [ ] **Step 2: 运行确认失败** `pnpm exec vitest run apps/web/lib/visitor/test-store.test.ts`，预期 `listJobs is not a function`。
- [ ] **Step 3: 实现。** 接口加方法；`MemoryVisitorStore` 遍历 `documents` 取 `jobs/` 前缀；`FirestoreVisitorStore` 用 `this.db.collection(\`visitorExhibitions/${ns}/jobs\`).limit(limit).get()`（非事务读取）。两处都校验 `Number.isInteger(limit) && 1 <= limit <= 201`。
- [ ] **Step 4: 运行确认通过**，并跑 `pnpm exec vitest run apps/web/lib/visitor`，预期全绿。
- [ ] **Step 5: 提交** `feat(visitor): list job documents from the store`

### Task 2: Worker 心跳与在线判定

**Files:**
- Create: `apps/web/lib/spine/heartbeat.ts`
- Modify: `packages/contracts/src/spine.ts`、`scripts/cloud-spine-worker.ts`
- Test: `apps/web/lib/spine/heartbeat.test.ts`

**Interfaces:**
- Produces: `HEARTBEAT_PATH = "meta/spine-worker"`；`HEARTBEAT_INTERVAL_MS = 30_000`；`OFFLINE_AFTER_MS = 120_000`；`type Heartbeat = { seenAt: number; running: number }`；`evaluateWorker(heartbeat: Heartbeat | null, now: number): { online: boolean; lastSeenAt: number | null }`；contracts 的 `SpineWorkerStatusSchema = z.strictObject({ online: z.boolean(), lastSeenAt: z.iso.datetime().nullable() })`。

- [ ] **Step 1: 写失败测试**：无心跳 → `online:false, lastSeenAt:null`；`seenAt = now - 119_000` → 在线；`now - 121_000` → 离线且 `lastSeenAt` 为该时间；`seenAt = now + 6 * 60_000`（未来）→ 离线、`lastSeenAt:null`；`seenAt` 为 `NaN` 或负数 → 离线。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现 `evaluateWorker` 与 `SpineWorkerStatusSchema`。** 未来超过 5 分钟视为无效。
- [ ] **Step 4: Worker 写心跳。** 在 `scripts/cloud-spine-worker.ts` 的轮询循环里，用已有的 `db` 每 `HEARTBEAT_INTERVAL_MS` 写 `visitorExhibitions/${namespace}/meta/spine-worker` = `{ seenAt: Date.now(), running }`（`running` 为本轮正在处理的任务数）；写失败只记日志，不中断轮询；进程退出时不清除。
- [ ] **Step 5: 运行 `heartbeat.test.ts` 通过；人工验证** 启动 Worker 一次（预备模式，不带 `--live`）后，在 Firestore 看到该文档更新。
- [ ] **Step 6: 提交** `feat(spine): worker heartbeat and online status`

### Task 3: 任务状态时间戳与管理视图

**Files:**
- Modify: `apps/web/lib/spine/jobs.ts`、`packages/contracts/src/spine.ts`
- Create: `apps/web/lib/spine/admin-view.ts`
- Test: `apps/web/lib/spine/jobs.test.ts`、`apps/web/lib/spine/admin-view.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的 `listJobs`；Task 2 的 `HEARTBEAT_PATH`、`evaluateWorker`。
- Produces: `recordSchema` 新增可选字段 `stateSince: number`，在 `makeSpineJob` 及每个改变 `state` 的 `SpineJobs` 方法里用 `this.now()` 写入（旧记录无该字段，视为未知）。contracts：`SpineAdminTaskSchema = z.strictObject({ task: SpineTaskIdSchema, code: z.string().length(8), state: SpineTaskStateSchema, stateSince: z.iso.datetime().nullable(), needsAttention: z.boolean() })`；`SpineAdminViewSchema = z.strictObject({ worker: SpineWorkerStatusSchema, queued: z.number().int(), running: z.number().int(), tasks: z.array(SpineAdminTaskSchema).max(200), truncated: z.boolean(), repairs: z.array(SpineRepairEntrySchema).max(20) })`，并在此任务里定义 `SpineRepairEntrySchema = z.strictObject({ at: z.iso.datetime(), action: z.enum(["cancel","requeue","preset","adjust","resetAdjust"]), code: z.string().length(8) })`，`buildAdminView` 先读取 `meta/spine-repair-log`（Task 8 才会写入，缺失时为空数组）。`buildAdminView(store: VisitorStore, now: number): Promise<SpineAdminView>`；`STUCK_AFTER_MS = 15 * 60_000`。

- [ ] **Step 1: 写失败测试（jobs.test.ts）**：创建任务后 `stateSince` 等于注入的 `now`；`claim` 后更新为新的 `now`；旧记录（无 `stateSince`）仍通过 `recordSchema` 解析。
- [ ] **Step 2: 写失败测试（admin-view.test.ts）**：用 `MemoryVisitorStore` 放入 5 个不同状态的任务和心跳，断言 `tasks` 中 `FAILED`/`UNKNOWN`/`REQUIRES_REVIEW` 的 `needsAttention` 为真且排在最前；`RUNNING` 且 `stateSince` 早于 15 分钟的 `needsAttention` 为真；`WITHDRAWN` 不出现；`queued`、`running` 计数正确；`code` 是任务 uuid 的前 8 位十六进制。
- [ ] **Step 3: 隐私断言**：对 `JSON.stringify(view)` 断言不含 `owner`、`photoSha256`、`photoGeneration`、`consent`、`worker`、`bundle`、`CLOUD_PRIVATE` 这些字符串，并且字段集合恰好是 schema 声明的那些。
- [ ] **Step 4: 截断断言**：放入 201 个任务，`tasks.length === 200` 且 `truncated === true`。
- [ ] **Step 5: 运行确认失败。**
- [ ] **Step 6: 实现。** `stateSince` 通过一个私有帮助函数 `stamp(record)` 统一写入；`buildAdminView` 调用 `listJobs(201)`：返回 201 条则 `truncated: true` 并只保留 200 条（访客名册上限为 200，超出极少见，不保证保留的是最新的）。
- [ ] **Step 7: 运行 `pnpm exec vitest run apps/web/lib/spine` 全绿。**
- [ ] **Step 8: 提交** `feat(spine): admin view of photo tasks without private fields`

### Task 4: 取消与重做

**Files:**
- Modify: `apps/web/lib/spine/lifecycle.ts`、`apps/web/lib/spine/jobs.ts`、`apps/web/lib/visitor/service.ts`
- Test: `apps/web/lib/spine/lifecycle.test.ts`、`apps/web/lib/spine/jobs.test.ts`、`apps/web/lib/visitor/service.test.ts`

**Interfaces:**
- Produces: lifecycle 事件 `{ type: "REQUEUE" }`：允许从 `UNKNOWN`、`REQUIRES_REVIEW`、`FAILED`、`RUNNING` 转到 `QUEUED`，其他状态抛 `INVALID_TRANSITION`。`SpineJobs.requeue(task: string): Promise<void>`：在一个事务中把任务置为 `QUEUED`，`worker:null`、`toolFlow:null`、`liveIntent:false`，删除 `requests/spine-live-<task>`；任务必须是 `photoStorage === "CLOUD_PRIVATE"`，且调用方先确认照片仍存在。`SpineJobs.adminWithdraw(task: string): Promise<void>`：读取记录里的 owner，走与参加者撤回相同的 `withdrawSpineJobRecord` 与名册清理。`VisitorService.spineAdminAction(input)` 中的 `cancel`、`requeue` 分支（`requeue` 要求 `confirmCost === true`）。
- Consumes: `CloudPhotoStorage` 需要 `exists(task: string): Promise<boolean>`（若不存在则新增并测试）。

- [ ] **Step 1: 写失败测试（lifecycle）**：四个允许的状态转 `QUEUED`；`PUBLISHED`、`WITHDRAWN`、`QUEUED` 抛出。
- [ ] **Step 2: 写失败测试（jobs）**：`FAILED` 任务 `requeue` 后记录通过 `recordSchema`（`QUEUED` 要求 `worker === null`），`liveIntent` 为假，预留标记被删除；`PUBLISHED` 任务 `requeue` 抛出；并发调用两次，第二次抛 `INVALID_TRANSITION`，且 `meta/spine-live-budget.reserved` 不因 `requeue` 本身改变。
- [ ] **Step 3: 写失败测试（service）**：未带 `confirmCost` 的重做被拒绝，不改动任何记录，也不调用模型；照片已不存在时返回 `PHOTO_GONE`，任务不变；`cancel` 后任务为 `WITHDRAWN` 且名册条目被移除。
- [ ] **Step 4: 运行确认失败。**
- [ ] **Step 5: 实现。** `lifecycle` 加事件；`SpineJobs` 加两个方法，均在 `store.run` 事务内，并更新 `stateSince`；`VisitorService.spineAdminAction` 先 `parse` 输入（Task 8 定义的 schema），再分派。
- [ ] **Step 6: 运行 `pnpm exec vitest run apps/web/lib` 全绿。**
- [ ] **Step 7: 提交** `feat(spine): admin cancel and requeue with cost confirmation`

### Task 5: 改成预设角色

**Files:**
- Modify: `apps/web/lib/visitor/service.ts`
- Test: `apps/web/lib/visitor/service.test.ts`

**Interfaces:**
- Consumes: `avatarForSample(sampleId)`（`@ai-city/contracts/development`）、`StoredResident`（`service.ts` 中 `residents` 条目：`{ ownerDigest, jobId, expiresAt, resident }`）、参加者资料文档 `requests/spine-profile-<owner>`（昵称、性格标签、兴趣）。
- Produces: `spineAdminAction` 的 `preset` 分支：`{ action: "preset", task, presetId }`。效果：为该任务的参加者在 `residents` 中新增一个 `avatarVersion = sample-<presetId>-v1` 的公开住民（昵称、性格标签、兴趣取自参加者资料，缺失时用 `ゲスト`／`非公開`／`[]`；`expiresAt` 与其 session 一致），随后按 `cancel` 处理原任务（含照片清理）。两步在同一个事务里。

- [ ] **Step 1: 写失败测试**：`FAILED` 任务 + 有效 session → 快照中出现 `avatarVersion === "sample-aoi-v1"` 的住民、原任务为 `WITHDRAWN`、`spineResidents` 不再含它；参加者资料存在时昵称沿用；参加者 session 已过期 → 抛错且 `meta/state`、任务记录均未改变；未知 `presetId` 被 schema 拒绝；同一参加者重复执行 → 第二次拒绝（该 owner 已有住民）。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** 事务内先校验 session（沿用已有的 `validSession`）和容量上限（`MAX_ACTIVE_SESSIONS`），再写住民与撤回；任何一步失败整体回滚。
- [ ] **Step 4: 运行 `pnpm exec vitest run apps/web/lib/visitor` 全绿。**
- [ ] **Step 5: 提交** `feat(visitor): replace a failed photo character with a prepared one`

### Task 6: 调整值的数据与应用

**Files:**
- Modify: `packages/contracts/src/spine.ts`、`packages/city/src/spine-player.ts`、`packages/city/src/spine-bundle.ts`、`packages/city/src/index.ts`
- Create: `packages/city/src/spine-adjustment.ts`
- Test: `packages/contracts/src/spine.test.ts`、`packages/city/src/spine-adjustment.test.ts`

**Interfaces:**
- Produces: contracts：`SPINE_PARTS = ["hair","handLeft","handRight","footLeft","footRight"] as const`；`SpineAdjustmentSchema = z.strictObject({ version: z.literal(1), parts: z.record(z.enum(SPINE_PARTS), z.strictObject({ dx: z.number().min(-0.15).max(0.15), dy: z.number().min(-0.15).max(0.15), scale: z.number().min(0.5).max(1.5) })) })`（`dx`/`dy` 是角色高度的比例，用 `z.number()` 并拒绝 `NaN`/`Infinity`）；`type SpineAdjustment`。city：`SPINE_PART_BONES: Record<SpinePart, string[]>` = `{ hair: ["hair-front","hair-back-long-middle"], handLeft: ["arm-down-l"], handRight: ["arm-down-r"], footLeft: ["leg-target-l"], footRight: ["leg-target-r"] }`；`applySpineAdjustment(skeleton: Skeleton, adjustment: SpineAdjustment | null | undefined, height: number): void`（在 `state.apply` 之后、`updateWorldTransform` 之前对骨骼的 `x`/`y`/`scaleX`/`scaleY` 叠加）；`bundle.create(adjustment?: SpineAdjustment)`。

- [ ] **Step 1: 确认骨骼名称。** 用 `apps/web/public/chibi-demo/chibi-stickers.json` 核对上表的骨骼名存在（它们来自官方样本，已核对存在）。**再用一个真实生成并发布的角色的 `skeleton.json` 核对一次**，不一致则改 `SPINE_PART_BONES` 并在测试里记录；左右以参加者在屏幕上看到的为准（平板对官方样本有左右镜像，见 `chibiAnimationForScreen`）。
- [ ] **Step 2: 写失败测试（contracts）**：合法值通过；`dx: 0.2`、`scale: 2`、`scale: NaN`、未知部位、`version: 2`、多余字段都被拒绝。
- [ ] **Step 3: 写失败测试（city）**：用最小骨架（`SkeletonJson` 读入一个只有 `root`→`hair-front` 两根骨骼的 JSON）调用 `applySpineAdjustment`：`dy: 0.1`、高度 200 时 `hair-front` 的 `y` 增加 20；`scale: 1.2` 使 `scaleX`/`scaleY` 乘 1.2；`null`/`undefined` 不改变任何值；骨骼不存在时忽略而不抛错。
- [ ] **Step 4: 运行确认失败。**
- [ ] **Step 5: 实现。** `createSpinePlayer` 的 `guard` 之后追加应用调整；`prepareSpineBundle` 返回的对象 `create(adjustment?)` 把调整值传给播放器。高度取 `bounds.height`（播放器内已计算）。
- [ ] **Step 6: 运行 `pnpm exec vitest run packages` 全绿。**
- [ ] **Step 7: 提交** `feat(spine): per-part position adjustment applied at render time`

### Task 7: 调整值的存储与下发到平板

**Files:**
- Modify: `apps/web/lib/spine/jobs.ts`、`packages/contracts/src/index.ts`、`packages/contracts/src/development.ts`、`apps/web/lib/visitor/service.ts`、`apps/web/app/tablet/city.tsx`
- Test: `apps/web/lib/spine/jobs.test.ts`、`apps/web/lib/visitor/service.test.ts`、`packages/contracts/src/development.test.ts`

**Interfaces:**
- Consumes: Task 6 的 `SpineAdjustmentSchema`。
- Produces: `recordSchema` 新增可选 `adjustment: SpineAdjustmentSchema.nullable().optional()`；`SpineJobs.setAdjustment(task: string, adjustment: SpineAdjustment | null): Promise<void>`（仅 `PUBLISHED` 任务允许，否则 `INVALID_TRANSITION`）；`AvatarManifestSchema` 新增可选 `adjustment`（与 `spine` 并列，不进入带哈希的 bundle 描述）；`VisitorService.snapshot()` 为 Spine 头像带上该任务的调整值；平板按 `${avatarVersion}:${JSON.stringify(adjustment ?? null)}` 作为 bundle 缓存键，调整值变化时重建该角色的播放器。

- [ ] **Step 1: 写失败测试**：`setAdjustment` 对 `PUBLISHED` 成功、对 `QUEUED`/`FAILED` 抛错、传 `null` 清除；快照中该角色的头像带有 `adjustment`，清除后消失；`CitySnapshotSchema` 解析仍然成功；旧快照（无该字段）仍通过。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** 同步更新 `fixtures` 与 `development.test.ts` 中构造的头像数据。
- [ ] **Step 4: 平板验证。** 在已发布角色上保存一个 `hair` 的 `dy: 0.1`，已打开的平板在一个快照轮询周期内（≤5 秒）看到变化，**无需刷新页面**；清除后恢复。这一步是浏览器验证，记录截图或描述。
- [ ] **Step 5: 运行 `pnpm exec vitest run` 全绿，`cd apps/web && pnpm exec tsc --noEmit` 无错误。**
- [ ] **Step 6: 提交** `feat(spine): deliver saved adjustments to the tablet`

### Task 8: 管理 API 与修复记录

**Files:**
- Modify: `apps/web/lib/visitor/device-http.ts`、`apps/web/lib/visitor/service.ts`、`packages/contracts/src/spine.ts`、`packages/contracts/src/device-client.ts`
- Test: `apps/web/lib/visitor/device-http.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `buildAdminView`；Task 4、5、7 的动作实现。
- Produces: `SpineAdminActionSchema = z.discriminatedUnion("action", [cancel{task}, requeue{task, confirmCost: z.literal(true)}, preset{task, presetId: DevicePresetIdSchema}, adjust{task, adjustment: SpineAdjustmentSchema}, resetAdjust{task}])`；路由 `GET /api/link/spine-admin` → `SpineAdminView`；`POST /api/link/spine-admin` → 执行动作后返回最新的 `SpineAdminView`；`VisitorService.appendRepairLog`（在每个动作的同一个事务里写 `meta/spine-repair-log`，最多 50 条）；device client 方法 `spineAdmin(): Promise<SpineAdminView>`、`spineAdminAction(action: SpineAdminAction): Promise<SpineAdminView>`。

- [ ] **Step 1: 写失败测试**：无管理员 cookie → 401/403；显示用令牌（平板）→ 被拒；跨源 `Origin` → 403；带查询参数 → 400；`requeue` 缺少 `confirmCost` → 400 且不改动；`adjust` 超范围 → 400；对未发布任务 `adjust` → 409；每个成功动作后 `repairs` 增加一条且不含任何身份字段；访客存储未启用 → 503 `VISITORS_DISABLED`。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** 路由放在 `device-http.ts` 现有 `/api/link/remove` 同一风格的分支里（`validateRequestOrigin` → 解析 cookie → `device.authorizeParticipant(token)` → 调用 `visitor`）；响应带 `Cache-Control: no-store`。
- [ ] **Step 4: 运行 `pnpm exec vitest run apps/web/lib` 全绿。**
- [ ] **Step 5: 提交** `feat(admin): spine admin API with repair log`

### Task 9: 管理页「照片生成」区块（手机优先，日语）

**Files:**
- Create: `apps/web/app/admin/spine-panel.tsx`、`apps/web/app/admin/spine-labels.ts`
- Modify: `apps/web/app/admin/controller.tsx`、`apps/web/app/styles.css`
- Test: `apps/web/app/admin/spine-labels.test.ts`、`tests/e2e/admin-spine.spec.ts`

**Interfaces:**
- Consumes: Task 8 的 device client 方法与 schema。
- Produces: `spine-labels.ts`：`describeState(state: SpineTaskState): { label: string; tone: "ok" | "wait" | "alert" }`（日语，如 `FAILED` → 「失敗」alert、`QUEUED` → 「順番待ち」wait）；`formatSince(stateSince: string | null, now: number): string`（「3分前」「1時間以上」，`null` → 「不明」）。`SpinePanel` 默认导出，组件 props `{ busy: boolean }`，内部每 10 秒轮询 `spineAdmin()`。

- [ ] **Step 1: 写失败测试（labels）**：8 种状态都有非空日语标签；`FAILED`/`UNKNOWN`/`REQUIRES_REVIEW` 为 `alert`；`formatSince` 对 `null`、30 秒、5 分钟、2 小时的输出。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现组件。** 顶部 Worker 状态条（绿「Worker 稼働中」／红「Worker 停止？最終確認 hh:mm」）+ 排队与处理中人数；任务列表（异常置顶，显示短码、状态标签、停留时间；`PUBLISHED` 的任务显示一个小缩图，进入视口时才加载，加载失败就留空）；点开详细：异常任务显示「取り消す」「作り直す」（点击后弹出确认文案：「外部のAIサービスを再び使用し、費用がかかります」，确认才发送 `confirmCost: true`）和「見本キャラクターに変更」（6 选 1）；`PUBLISHED` 任务显示预览画布（用 `fetchSpineBundle` + `bundle.create(adjustment)` 绘制）和 5 个部位的滑杆（上下、左右、大小），拖动即时预览，「保存」「元に戻す」；底部显示最近的修复记录。访客存储未启用时整个区块显示「未接続」。
- [ ] **Step 4: Playwright 测试**：用 `page.route` 拦截 `/api/link/spine-admin` 返回固定数据，断言手机视口（390×844）下无横向滚动、Worker 离线显示红色、异常任务置顶、点「作り直す」出现费用确认且取消后不发送 `POST`。
- [ ] **Step 5: 运行 `pnpm exec vitest run apps/web/app/admin` 与 `pnpm exec playwright test tests/e2e/admin-spine.spec.ts`。**
- [ ] **Step 6: 提交** `feat(admin): photo generation panel for phones`

### Task 10: 文档与实机验收清单

**Files:**
- Modify: `docs/ADMIN_CONTROLS.md`
- Create: `docs/superpowers/plans/2026-11-06-admin-photo-recovery-checklist.md`

- [ ] **Step 1:** 在 `ADMIN_CONTROLS.md` 补充新区块的用途、心跳阈值、各修复动作的效果与是否花钱、调整值范围。
- [ ] **Step 2:** 写实机验收清单：停掉 Worker 2 分钟后管理页变红；人为让一个任务失败后能取消、改预设；已发布角色调头发位置后平板（真机）即时变化、还原后恢复；确认管理端任何位置看不到照片；确认「作り直す」未确认时不调用模型。**这些项目必须在真实平板和手机上做，不能用 mock 测试代替；未做的项目在 PR 中如实标注。**
- [ ] **Step 3:** 运行 `pnpm exec vitest run`、`cd apps/web && pnpm exec tsc --noEmit`，记录结果。
- [ ] **Step 4: 提交** `docs(admin): photo recovery controls and device checklist`
