# 手机管理控制

Owner：A / Main。基于现有 `/admin`、ADMIN cookie 与 device-link API 扩充；不改变共享 schema、权限、Firestore 存储或三端入口隔离。

## 功能与状态

- **开场 / 休场**：一次带 `expectedRevision` 的请求同时设置 LIVE + motion enabled，或 MAINTENANCE + motion disabled。原单独模式与动作控制保留；设备 reduced motion 优先，旧 revision 仍返回 409。
- **通信状态**：显示管理端最后成功通信的时间，支持手动读取当前状态。它不是平板逐角色绘制回执；离线、超时与会话过期沿用原重连流程。
- **配对倒数**：按服务端返回的 expiresAt 计算剩余秒数，到期隐藏旧码并提示重新发码。服务器的单次使用、3 分钟有效期及限流不变；倒数依赖手机时钟，不能取代服务端有效性检查。
- **住民管理**：仅使用已授权公开的 snapshot；昵称搜索支持 NFKC 标准化，按参加顺序、逆序或日语名称排序。可选中当前搜索结果、取消选择、逐项或批次撤回。确认时固定目标 ID 集合并列出全部目标昵称，包括被新搜索条件隐藏的选择；新加入的住民不会自动加入这次操作。
- **部分失败**：逐项移除，第一项无法确认的请求后立即停止；不自动重试破坏性请求。显示已确认成功及未完成数量，再读取当前名单。请求成功但响应丢失时，结果仍是“未确认”；只有重新对账才能确认最终状态。未完成选择保留，自动轮询不会抹去操作错误。
- **解除展示连接**：先显示注册台数与再次确认，取消不发请求；确认后调用原 revoke API。解除不删除住民，重新连接需要新配对码。

## AI会话开关（2026-11-06）

管理页新增「AI会話の設定」面板，显示当前状态（オン／オフ），操作走原控制 API，要求 ADMIN cookie、来源校验及 expectedRevision。状态作为 DeviceControl 的 `dialogueEnabled` 一同通过平板 `/api/link/display` 轮询传送，不需要重新配对。关闭时，对话 GET 返回 `available: false`，POST 拒绝并返回 `DIALOGUE_DISABLED` (503)，不开始新的模型生成；在异步生成期间关停时，服务端丢弃已返回结果，平板也会丢弃关停后的响应。打开后平板重新检测对话来源是否可用。初始值是 true，以维持既有设置，但对话来源（云模型或预生成内容）仍可能未配置。

**限制**：设备控制只保存在单个服务进程内；服务重启会恢复默认，Cloud Run 多实例之间没有共享状态保证。背景对话 Worker 独立运行，关停平板 AI 会话**不等于**停止 Worker 或保证节省所有模型费用。未进行生产环境和真实平板验收。

## 本地验收（2026-10-20）

- `pnpm check`：PASS，lint、类型、140 unit、production build。
- `AI_CITY_JAVA_HOME=<已有 Java 21 目录> pnpm test:rules`：PASS，demo emulator 119 项；首次未指定 Java 目录时启动失败，指定现有环境后通过。
- `CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e --workers=1 --retries=0`：17 PASS。新增开场/休场、手动同步、配对码 UI 到期、解除取消、搜索/排序/选择、批次中断、人工重试与错误保留；原隔离平板同步和撤销回归通过。
- `AI_CITY_JAVA_HOME=<已有目录> CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:join:e2e`：4 PASS。真实 Firestore emulator 下两名虚构 owner 的批次撤回持久化为 REMOVED；免代码入场、三端无互链、隔离平板同步及实际 Node 重启恢复通过。
- 浏览器红→绿：新增开场按钮不存在时失败；实现后通过。批次单元测试先因模块尚不存在失败，再实现成功/中断语义。
- 首轮浏览器测试的排序定位器与 select 的 label 文本不匹配，导致虚构样例未清理、影响后续通用名单断言；改用 combobox role，并为样例增加 finally 撤回清理，完整重跑 17 PASS。
- 375px 手机完整截图已查看，未横向溢出；本地模拟 503 是故障注入，不是真实云端故障或物理断网验收。

云端发布、真实设备及持续运行需分别记录，不能从以上本地结果推断。

独立 Luna Max 静态审查发现批次确认缺少完整名单，已加入全部目标昵称与搜索隐藏项回归。配对 UI 没有服务端消费回执：已使用的单次码仍可能显示至到期；服务端会拒绝重用，不以连接台数推测该码是否被消费。到期后计时器停止。

修正后重新执行 `pnpm check` 全通过，并重跑 admin-controls + device-link 共 3 项 E2E（34.6 秒）PASS；独立复核未发现残余 mustfix。

## 写真生成（照片恢复面板）

管理页「写真生成」面板用于发现并修复卡住或失败的照片生成任务。以下内容均对应代码实际行为（`apps/web/app/admin/spine-panel.tsx`、`spine-labels.ts`、`apps/web/lib/visitor/device-http.ts`、`apps/web/lib/spine/*`）。面板每 10 秒轮询一次；一次轮询失败时保留已显示内容与未保存的滑块值，并提示「最新の状態を取得できません。再試行しています」。

### Worker 心跳

- Worker 每 30 秒向访客存储文档 `meta/spine-worker` 写一次心跳。
- 超过 2 分钟没有心跳即判定离线；心跳时间比当前时间晚 5 分钟以上（时钟偏差或异常值）同样判定离线。
- 面板顶部显示「Worker 稼働中」（绿）或「Worker 停止？ 最終確認 HH:MM」/「Worker 停止？ 最終確認なし」（红），并显示「順番待ち N人・作成中 N人」（只统计已列出的任务）。

### 任务清单

- 状态标签：QUEUED 順番待ち、RUNNING 作成中、PREPARED 公開準備中、UNKNOWN 状態不明、REQUIRES_REVIEW 要確認、FAILED 失敗、PUBLISHED 公開中、WITHDRAWN 取り下げ済み。每行显示 8 位短码和状态持续时间。
- `needsAttention`：状态为 FAILED、UNKNOWN、REQUIRES_REVIEW，或 RUNNING 超过 15 分钟（以 `stateSince` 计）。需要关注的任务排在前面。
- 清单最多 200 条；超出时 `truncated` 为真，面板提示「一覧は200件までです。それ以降は表示されません。」。
- PUBLISHED 任务带角色缩略图（来自公开的 bundle 描述，非照片）。

### 修复动作

| 按钮 | 效果 | 费用 |
|---|---|---|
| 取り消す | 先弹确认（「取り消しを確定」/「やめる」）。确认后撤回任务并开始照片清理，无法撤销。对已是 WITHDRAWN 的任务再次取消返回 409（`INVALID_TRANSITION`），界面按错误显示。 | 无 |
| 作り直す | 仅 UNKNOWN / REQUIRES_REVIEW / FAILED / RUNNING 可用，且仅限云端照片（CLOUD_PRIVATE）。必须通过费用确认（「費用を了承して作り直す」，请求带 `confirmCost: true`，未带返回 400 `COST_UNCONFIRMED`）。仅当原照片仍存在时才可执行。执行后任务回到 QUEUED，重置 liveIntent / worker / toolFlow 并删除 `requests/spine-live-<task>`；实时预算计数不回退，Worker 再次领取时重新计入 `meta/spine-live-budget`。 | 会调用付费外部 AI，受实时预算约束 |
| 見本キャラクターに変更 | 从 6 个预置角色中选一个，用该参加者自己已公开的资料（昵称等）发布，没有资料则用「ゲスト」；随后撤回原任务。参加者会话已结束返回 409 `SESSION_REQUIRED`；该参加者已有居民返回 409 `ACTIVE_JOB_EXISTS`。 | 无 |
| 位置调整（5 个部位 × 上下/左右/大きさ） | 部位：髪、左手、右手、左足、右足。`dx`/`dy` 范围为角色高度的 ±0.15（步进 0.01），`scale` 范围 0.5–1.5（步进 0.05）。调整值作为独立字段保存在任务记录旁，已发布的 bundle 文件不被修改。仅对 PUBLISHED 任务有意义。 | 无 |
| 元に戻す | 删除该调整值，恢复原样。 | 无 |

作り直す 在照片已不存在、或照片存储未接入（离线 mock / 未启用云端收件）时都返回 `PHOTO_GONE`，界面统一显示「再生成できません（写真が残っていない、または未接続）」，不声称照片已被删除。

管理页增量修复（2026-11-06）：`取り消す` 对所有未撤回的任务可用，包括 QUEUED、RUNNING、PREPARED、PUBLISHED。已撤回任务仍不列出。POST 操作期间及其前后启动的旧轮询结果不能覆盖操作确认结果，并阻止重复点击导致重复请求。单个任务的 `stateSince` 如损坏或超出有效日期范围，该任务继续展示，时间显示「不明」；不能把这种数据异常误当成任务不存在。

### 修复记录

- 保存在 `meta/spine-repair-log`，最多保留最近 50 条；面板显示最近 20 条（时间、动作名、任务短码）。
- 只含时间、动作、短码，不含操作者身份。动作名：取り消し、作り直し、見本キャラクターへの変更、調整の保存、調整のリセット。

### API

- `GET /api/link/spine-admin`：返回管理视图（worker、queued、running、tasks、truncated、repairs）。
- `POST /api/link/spine-admin`：body 为 `cancel` / `requeue` / `preset` / `adjust` / `resetAdjust` 之一（严格 schema，多余字段被拒），成功后返回最新管理视图。
- 仅 GET、POST；带查询字符串返回 400；需要 ADMIN cookie（`authorizeParticipant`）并通过来源校验（`validateRequestOrigin`）。响应均为 `Cache-Control: no-store`。
- 错误体为 `{ mode: "MOCK", error: { code, message } }`，`message` 为固定日语文案。

| code | HTTP | 说明 |
|---|---|---|
| `INVALID_REQUEST` | 400 | schema 或查询字符串不合法（含未知 presetId、超范围调整值） |
| `COST_UNCONFIRMED` | 400 | 作り直す 未带费用确认 |
| `PAIR_REQUIRED` | 401 | 无有效管理会话 |
| `ADMIN_REQUIRED`、`LOCAL_ONLY` | 403 | 非 ADMIN 角色 / 来源不合法 |
| `JOB_NOT_FOUND` | 404 | 任务不存在（含调整时记录缺失） |
| `PHOTO_GONE` | 409 | 照片不存在或未接入 |
| `INVALID_TRANSITION` | 409 | 当前状态不允许（含重复取消、非云端照片） |
| `SESSION_REQUIRED` | 409 | 参加者会话已结束（服务内部 401 被改映射为 409，避免被当作管理员会话过期） |
| `ACTIVE_JOB_EXISTS` | 409 | 参加者已有居民 |
| `LOCAL_CAPACITY` | 429 | 街的容量已满 |
| `RATE_LIMITED` / `CAPACITY` | 429 | 设备链接层限流 |
| `CLOUD_PHOTO_UNAVAILABLE` | 503 | 照片存储暂不可用 |
| `VISITORS_DISABLED` | 503 | 未启用访客存储（离线 mock） |
| `STORE_UNAVAILABLE` | 503 | 其他未知错误 |

### 隐私

任何响应都不含照片、照片路径、`owner`、`photoSha256`、`photoGeneration`、`consent`、存储路径。缩略图和预览只用已公开的 bundle 描述与调整值绘制。

### 权限

所有管理员权限相同，沿用同一个 ADMIN 会话；没有角色区分，修复记录也不记录是谁操作的。

### 未接続 / offline mock

默认离线 mock 下访客存储未启用，路由返回 `VISITORS_DISABLED`（503），面板只显示「未接続」，不显示任务也不提供按钮。真实行为需要接入真实 Firestore、Worker 与平板验证，见 `docs/superpowers/plans/2026-11-06-admin-photo-recovery-checklist.md`（目前全部 NOT RUN）。
