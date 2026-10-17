# 共享 Contracts

当前起点为 `packages/contracts` v0.1，Zod schema 为字段来源。全部 fixture 都是虚构信息。它不是完整生产协议或后端授权实现。

- `AvatarSpec`：模板 ID、可见外观颜色与配件；不包含照片或敏感推断。
- `AvatarManifest`：同一素材版本的四方向与 Rig；公开引用只接受 `/avatars/` 范围内 PNG/WebP 路径，不接收私有签名 URL 或任意外部网址。后续由 B 增加锚点及动画兼容字段，由 A 实现授权资产传输；签名 URL 属于独立内部传输接口。
- `GenerationJob`：QUEUED / RUNNING / READY / FAILED / CANCELLED；后续由 A 增加 deadline、结果、租约及重试语义。
- `PublicResident`：只允许授权公开的字段，拒绝原始照片、问卷、token 等额外数据。`publicConsent: true` 只校验结构，真正发布仍需服务端验证同意记录和会话。
- `CityEvent`：事件 ID、活动、顺序、居民和版本。消费者仍需实现重复、乱序、删除和重连对账。

任何字段扩展必须附正向、负向样例与兼容处理。不能把 `.passthrough()` 或任意 JSON 作为快速集成方式。`pnpm test` 验证关键输入边界；shape tests 不代替规则测试或业务集成测试。
