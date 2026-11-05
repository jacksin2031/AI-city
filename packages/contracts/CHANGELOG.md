# Contracts 变更记录

每次 schema 变更在此记录版本、owner、兼容性和双方需要的调整。

## 0.12.0（2026-11-05）

Owner：A / Main。新增 `focus-link` 子路径与访客、显示设备客户端方法，包含请求 ID、排队状态及平板渲染确认。旧聚焦接口和旧 DTO 保持不变；新客户端需配合新服务端部署。聚焦记录在持久访客存储中保存，60 秒后过期，状态记录在 5 分钟后可于后续新请求时清理；这是 MOCK 展示，不代表真实设备或生产环境验收。

## 0.10.0（2026-11-05）

Owner：Main。新增本机照片制作任务的版本 2 同意、状态和响应契约，分别要求照片处理、外部 AI 发送与自动公开同意；不含个人照片或认证凭据。旧版版本 1 记录仍可读取，但不满足新照片入口要求。旧客户端需升级后才可使用新入口。

## 0.9.0（2026-11-05）

Owner：Main。新增只含 Spine 运行包的头像清单和本机测试快照类型，旧含四方向图的清单仍有效。旧版严格客户端不能读取新快照或无方向图清单；发布前须先升级所有展示与管理客户端。该类型不证明生产授权。

## 0.8.1（2026-11-05）

Owner：Main。Spine 运行包 PNG 页面上限由 16 提高至 32，以兼容工具实际输出；旧客户端不接受超过 16 页的包，发布前须升级消费者。资源总字节和完整性仍由消费者单独验证。

## 0.8.0（2026-11-05）

Owner：Main。`AvatarManifest` 可选携带 Spine 4.3 运行包描述，引用限制在同一公开角色版本目录，摘要对应 `build-manifest.json`。新版读取旧 manifest；旧版严格 schema 不接受新增字段，发布方必须待城市消费者升级后才能发送。此字段只描述素材，不验证文件内容、授权或发布资格；生产者必须实际核验摘要及全部素材，播放器尚未接入。

## 0.7.0（2026-11-02）

Owner：A / Main。对话请求新增可选的固定地点代号，不包含坐标或自由文本；旧请求仍可由新服务读取。旧版严格服务会拒绝新字段，平板与服务必须一起更新。

## 0.6.0（2026-11-02）

Owner：A / Main。设备管理新增固定的虚构住民目录、严格的管理员增删请求及管理响应 `presetIds`。新客户端可读取没有该字段的旧响应；旧版严格客户端不能读取带新字段的响应，服务和管理端须一起更新。公开参与者 DTO 不变，预设仅在 MOCK 展示中合并，不能作为真人同意或真实 AI 生成的证据。

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
