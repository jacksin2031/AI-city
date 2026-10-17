# 共享 Contracts

当前为 `packages/contracts` v0.2，Zod schema 为字段来源，变更记录见 `packages/contracts/CHANGELOG.md`。全部 fixture 都是虚构信息。它不是完整生产协议或后端授权实现。v0.2 新增字段均为可选，P0 中哪些改为必填需双方确认。

- `AvatarSpec`：模板 ID、可见外观颜色、色盘、配件与不对称标记；不包含照片或敏感推断。
- `AvatarManifest`：同一素材版本的四方向、Rig 与动画版本、透明帧尺寸、锚点（相对帧 0–1）、atlas 和 fallback 标记；公开引用只接受 `/avatars/` 范围内 PNG/WebP（atlas 数据为 JSON）路径，不接收私有签名 URL 或任意外部网址。由 A 实现授权资产传输；签名 URL 属于独立内部传输接口。
- `GenerationJob`：QUEUED / RUNNING / READY / FAILED / CANCELLED，含 deadline、更新时间、取消标记、READY 才有的结果（版本、FAST/ENHANCED 模式、回退）和 FAILED 才有的错误码。READY 不等于已公开。后续由 A 增加租约及重试语义与标准错误码表。
- `PublicResident`：只允许授权公开的字段，拒绝原始照片、问卷、token 等额外数据；`publicState` 区分显示与隐藏。`publicConsent: true` 只校验结构，真正发布仍需服务端验证同意记录和会话。
- `CityEvent`：居民加入、更新、隐藏、删除事件；`CityModeEvent` 为 LIVE / DEMO / MAINTENANCE 切换；`CityStreamEvent` 是两者联合。`id` 是事件 ID，`eventId` 是所属活动 ID。消费者仍需实现重复、乱序、删除和重连对账。
- `DialogueRequest` / `DialogueResult`：请求只带两个不同居民 ID，公开上下文由服务端查找，不传私人答案；结果必须标明 LIVE 或 PRESET 来源及安全结果，BLOCKED 不带台词。

Fixtures（`@ai-city/contracts/fixtures`）提供居民、素材清单、五种任务状态、居民与模式事件和预设对话，供 A/B 并行开发；素材路径只是引用，尚无实际图片。

任何字段扩展必须附正向、负向样例与兼容处理，并记录到 CHANGELOG。不能把 `.passthrough()` 或任意 JSON 作为快速集成方式。`pnpm test` 验证关键输入边界；shape tests 不代替规则测试或业务集成测试。
