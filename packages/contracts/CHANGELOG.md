# Contracts 变更记录

每次 schema 变更在此记录版本、owner、兼容性和双方需要的调整。

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
