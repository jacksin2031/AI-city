# Contracts 变更记录

每次 schema 变更在此记录版本、owner、兼容性和双方需要的调整。

## 0.5.0（2026-10-19）

Owner：A / Main。`createDevelopmentClient` 新增可选 apiPath（默认 /api/dev 不变；持久访客使用 /api/visitor）与 closeSession；Node cookie jar 根据通道隔离，4 秒请求限时，同时初始化共用同一个请求。新增传输负向及并发测试。

新增 `visitor` 子路径：严格的一次性签名邀请请求/响应 schema 与不可使用的全零 fixture；`device-client.visitorInvitation()` 供管理员发出邀请。`createSession(invitation?)` 保留原本无参数的本地调用。新增权限不改变 B 的快照 shape。

公开 DTO 和原 fixtures 未变，B 的渲染器继续消费原 snapshot；MOCK 标记继续代表角色/生成内容为样例。新访客权限由服务端持久匿名会话校验，不由 `publicConsent` 或 DTO 自行授权；不表示核实真人、照片授权或真实生成。设备控制会话仍为进程内短期会话。

## 0.4.0（2026-10-19）

Owner：A / Main。新增手机管理与平板联动的 `device-link` / `device-client` 子路径；原 v0.3 导出及本地调用方保持兼容。

- 严格的控制状态/revision、管理登录、短期配对、只读显示与管理员视图；复用 CityModeEvent 的 DEMO/LIVE/MAINTENANCE，LIVE 在此仍是 mock 参与者展示。
- deviceControlFixture 是虚构 fixture。显示仅接收公共 snapshot，MAINTENANCE 必须无 snapshot；拒绝额外字段。
- PublishRequest 本地 consentVersion 1 保持有效；新增 version 2 必须带 `publicationScope: HOSTED_PREVIEW`，远端确认另验证管理员会话和同意记录。shape 验证仍不是授权。
- A 手机管理调用 device-client，平板 wrapper 复用 B renderer；不修改 AvatarManifest REFERENCE_ONLY。限制见 `docs/MOBILE_TABLET_LINK.md`。

## 0.3.0（2026-10-18）

Owner：A（仓库负责人 jacksin2031）。新增独立 `development` / `development-client` 导出，保留 v0.2 调用方兼容。

- 新增严格的本地样例任务、分项确认、参与视图、居民快照、连续事件页 schema；READY 必须有结果，任务必须有时间字段。
- B 可使用有唯一素材版本的离线 fixtures 或同源 typed client。素材标记 REFERENCE_ONLY，不冒充实际图片。
- 本地事件使用每次进程启动独立 streamId、活动内连续 eventSeq；加入居民 version 1，移除 version 2。
- 不新增真实身份、照片授权、资产下载或云端能力。见 `docs/A_B_LOCAL_INTEGRATION.md`；共享 DTO 变化仍需 B 兼容审查。

## 0.2.0（2026-10-17）

Owner：jacksin2031。依据计划书第 7 节补齐字段。所有新增字段均为可选，v0.1 文档和现有调用方（`packages/city`）无需修改。

- `AvatarSpec`：新增 `templateId`、`palette`（最多 16 色）、`asymmetryIds`。
- `AvatarManifest`：新增 `animationVersion`、`frameSize`（像素）、`anchor`（相对帧 0–1）、`atlas`（图片与 `/avatars/` 范围内 JSON）、`fallback`。
- `GenerationJob`：新增 `deadline`、`updatedAt`（ISO 8601）、`cancelRequested`、`result`（`avatarVersion`、`mode` FAST/ENHANCED、`fallback`）、`errorCode`（大写机器码）。`result` 只允许 READY，`errorCode` 只允许 FAILED。
- `PublicResident`：新增 `publicState`（VISIBLE / HIDDEN）。删除的居民应离开公开集合，不另设状态。
- `CityModeEvent`（新）：`MODE_CHANGED` 与 `mode`（LIVE / DEMO / MAINTENANCE），不带居民。`CityEvent` 保持只含居民事件；`CityStreamEvent` 为两者的联合，供展示端消费事件流。
- `DialogueRequest` / `DialogueResult`（新）：请求只带两个不同居民 ID、`ja-JP` 与行数上限，公开上下文由服务端从 PublicResident 查找；结果区分 `source` LIVE / PRESET 与 `safety` PASSED / BLOCKED，BLOCKED 不带台词。
- Fixtures：新增素材清单、覆盖五种状态的任务、居民与模式事件、预设对话；均为虚构数据，素材路径只是引用，尚无实际图片。

待双方确认：哪些可选字段在 P0 改为必填、`errorCode` 的标准码表、事件 `version` 的递增规则。

## 0.1.0

初始开发起点。
