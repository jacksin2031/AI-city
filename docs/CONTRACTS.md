# 共享 Contracts

当前为 `packages/contracts` v0.6.0（含设备联动、持久访客传输及虚构预设住民控制），Zod schema 为字段来源，变更记录见 `packages/contracts/CHANGELOG.md`。全部 fixture 都是虚构信息。它不是完整生产协议或后端授权实现。原 v0.2 导出保持兼容；`development` 子路径提供本地接入专用严格 DTO，要求有效 READY 结果及时间字段。

本地接入入口：`@ai-city/contracts/development`（schema、类型、fixtures）和 `@ai-city/contracts/development-client`（型别化 HTTP client）。权威名单为 `CitySnapshot`，变化为连续序号的 `CityEventPage`；重启由 `streamId` 变化识别。素材为 `REFERENCE_ONLY`，不是已存在的图片。完整接入及限制见 [A/B 本地接入基础](A_B_LOCAL_INTEGRATION.md)。

- `AvatarSpec`：模板 ID、可见外观颜色、色盘、配件与不对称标记；不包含照片或敏感推断。
- `AvatarManifest`：同一素材版本的四方向、Rig 与动画版本、透明帧尺寸、锚点（相对帧 0–1）、atlas 和 fallback 标记；公开引用只接受 `/avatars/` 范围内 PNG/WebP（atlas 数据为 JSON）路径，不接收私有签名 URL 或任意外部网址。由 A 实现授权资产传输；签名 URL 属于独立内部传输接口。
- `GenerationJob`：QUEUED / RUNNING / READY / FAILED / CANCELLED，含 deadline、更新时间、取消标记、READY 才有的结果（版本、FAST/ENHANCED 模式、回退）和 FAILED 才有的错误码。READY 不等于已公开。后续由 A 增加租约及重试语义与标准错误码表。
- `PublicResident`：只允许授权公开的字段，拒绝原始照片、问卷、token 等额外数据；`publicState` 区分显示与隐藏。`publicConsent: true` 只校验结构，真正发布仍需服务端验证同意记录和会话。
- `CityEvent`：居民加入、更新、隐藏、删除事件；`CityModeEvent` 为 LIVE / DEMO / MAINTENANCE 切换；`CityStreamEvent` 是两者联合。`id` 是事件 ID，`eventId` 是所属活动 ID。消费者仍需实现重复、乱序、删除和重连对账。
- `DialogueRequest` / `DialogueResult`：请求只带两个不同居民 ID，公开上下文由服务端查找，不传私人答案；结果必须标明 LIVE 或 PRESET 来源及安全结果，BLOCKED 不带台词。

设备管理 `presetIds` 是固定虚构目录的选择，不进入参与者名册；平板公开快照按展示流版本合并。管理端和服务端需一起更新，重新启动会丢失选择。

Fixtures（`@ai-city/contracts/fixtures`）提供居民、素材清单、五种任务状态、居民与模式事件和预设对话，供 A/B 并行开发；素材路径只是引用，尚无实际图片。

任何字段扩展必须附正向、负向样例与兼容处理，并记录到 CHANGELOG。不能把 `.passthrough()` 或任意 JSON 作为快速集成方式。`pnpm test` 验证关键输入边界；shape tests 不代替规则测试或业务集成测试。
