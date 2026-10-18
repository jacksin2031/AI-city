# A/B 本地接入基础

Owner：A。对应 Issues #1、#2、#5 的本地 mock 增量，不是完整云端或实机验收。

## B 从这里开始

当前交付分支为 `codex/a-local-integration`。PR 合并前，B 在自己的干净 clone 从该分支建立独立分支，例如：

```sh
git fetch origin codex/a-local-integration
git switch --no-track -c codex/b-city-integration origin/codex/a-local-integration
```

之后运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 `/join`，使用虚构昵称和既有样例创建任务，预览后选择显示字段并明确确认。打开 `/integration` 可看到居民与新增/删除事件；撤回后名单会移除居民。

`/city` 仍由 B 负责，本次没有改动其 Phaser 实现，不代表它已经消费新接口。B 可先使用离线 fixtures，或在自己的浏览器端模块中使用同源 client。

```ts
import {
  developmentCitySnapshot,
  developmentCityEventPage,
  type CitySnapshot,
} from "@ai-city/contracts/development";
import { createDevelopmentClient } from "@ai-city/contracts/development-client";

// 离线：两个虚构居民，以及对应的有序加入事件。
const fixture: CitySnapshot = developmentCitySnapshot;
const fixtureEvents = developmentCityEventPage.events;

// 本地在线：与 apps/web 同源，不需要云账号或 API key。
const client = createDevelopmentClient();
const snapshot = await client.snapshot();
// 用 snapshot.residents 重建当前名单；之后才消费新事件。
const page = await client.events(snapshot.streamId, snapshot.eventSeq);
```

Node 工具可传 `baseUrl: "http://127.0.0.1:3000"`；同一个 client 会在内存中保存本地会话 cookie，默认 fetch 也可先 createSession 再操作自己的任务。浏览器保持同源，不开放跨域、其他活动或局域网访问。名单读取不需要参与者 cookie；私有任务操作需要服务端设置的 HttpOnly cookie。不要把 cookie/token 写入 URL、日志、fixture 或前端存储。

## 已固定的接口与状态

共享包版本为 0.3.0，旧 v0.2 导出保持兼容。新接口在 `development` 子路径验证业务必要字段，B 原有调用方无需立即修改。

| 能力 | HTTP | 结果 |
| --- | --- | --- |
| 建立/复用会话 | `POST /api/dev/session`，body `{}` | `mode: MOCK`，服务器设置 cookie |
| 创建样例任务 | `POST /api/dev/jobs` | `ParticipationView`；同一会话/requestId/内容复用，内容冲突返回 409 |
| 刷新恢复 | `GET /api/dev/jobs/current` | 当前 `ParticipationView` 或 `null` |
| 查询任务 | `GET /api/dev/jobs/{jobId}` | 仅本人会话可读 |
| 确认显示 | `POST /api/dev/jobs/{jobId}/confirm` | 验证本人会话、READY 及分项同意，创建一个居民和加入事件 |
| 取消/重试/撤回 | `POST /api/dev/jobs/{jobId}/cancel`、`retry`、`remove`，body `{}` | 已显示任务须 remove；终止后不复活 |
| 当前名单 | `GET /api/dev/city/snapshot?eventId=fixture-event` | `CitySnapshot` |
| 增量事件 | `GET /api/dev/city/events?eventId=fixture-event&streamId=...&afterSeq=0` | `CityEventPage` |

创建字段：`eventId: fixture-event`、`requestId`、虚构 `nickname`、`sampleId`（sora/haru）、`answers`（六个 0–2 整数，或 null 跳过）、`scenario`。拒绝照片、额外字段及其他活动。具体类型以 schema 为准。

确认字段：`avatarPublicConsent: true`、`consentVersion: 1`、`fields: { nickname, personality, interests }`。三个显示字段默认不选。服务端将同意关联本人会话、具体任务、素材版本及时间；单独传 `publicConsent: true` 不被接受。未授权昵称为“ゲスト”，性格为“非公開”，兴趣为空数组。

正常状态为 QUEUED → RUNNING → READY。FAIL_ONCE 首次失败后可重试；ALWAYS_FAIL 连续失败；TIMEOUT 到 deadline 后失败。最多两次尝试，沿用原始 30 秒截止时间。进度在查询时按时间推进，是模拟处理，不是云队列或模型。问卷为原创娱乐偏好，跳过取中性值；当前仅部分答案影响简单称号，完整六维计分留待后续。

READY 必须有结果引用、deadline、updatedAt，不代表已显示。重复确认返回同一居民；用不同同意选项重复确认返回 CONSENT_CONFLICT，须撤回后重新建样例。取消和撤回是终态。

## B 的快照与事件消费规则

- 首次连接/刷新：读取 snapshot，重建名单，以其 `streamId/eventSeq` 为游标；不重播历史欢迎动画。
- 后续：按游标读取 events，处理后推进至 `latestSeq`，再读取 snapshot 对账。名单以 snapshot 为准；事件用于变化通知，不包含完整居民、照片或私人答案。
- `eventSeq` 在单活动流内连续递增；按事件 id/序号去重，旧居民 version 不覆盖新版本。本服务产生 JOINED（version 1）、REMOVED（version 2）；重复操作不增加事件。原 schema 的 UPDATED/HIDDEN 保留，但本服务暂不产生。
- 删除时卸载对应资源；旧 JOINED 不得使已删居民复活。STREAM_RESET/CURSOR_AHEAD（409）时丢弃旧游标与名单，重新读快照。新 `streamId` 表示进程已重启。
- `avatars` 以唯一 `avatarVersion` 关联居民。`assetStatus: REFERENCE_ONLY` 表示路径只有接口样例，尚无实际 PNG/WebP/atlas，不能当作下载成功。B 提供素材并协商接口后才增加可加载状态。
- `/integration` 的 client 消费代码是实际接入样例：每秒轮询、无重叠请求、卸载停止更新、错误时隐藏旧名单。B 负责城市动画、资源加载、镜头、离线策略及性能。

## 运行与边界

- `pnpm dev` 仅绑定 127.0.0.1，启用本地接口。生产构建默认关闭；本地运行生产构建时显式设置 `AI_CITY_ENABLE_LOCAL_MOCK=1` 再 `pnpm start`。开启后仍拒绝非 loopback Host、跨源 POST 和超过 4 KiB 的 JSON，不提供 CORS。
- 连接层边界依赖上述 loopback 绑定。Host/Origin 检查不是来源 IP 验证，不能把 opt-in 开关当作公开部署的安全机制；不得对外绑定、公开转发端口或经公网 reverse proxy 提供此样例。
- store 为单 Node.js 进程内存；重启清空任务和名单。会话一小时失效，下一次 API 访问时取消任务并发移除事件。每进程最多 200 个会话、200 个累计任务，达到任务上限需重启。
- 本地 cookie 只提供 mock 隔离，不是 Firebase Auth 验收，不适用于真实照片或公开部署。尚无真实照片处理授权、持久化、分布式幂等、Cloud Tasks、真实生成或付费调用。
- Firestore/Storage 默认拒绝规则不变。真实身份、私有上传、B 生成模块、云端发布与目标平板是后续独立任务。

## 验证

```sh
pnpm check
pnpm test:rules
pnpm test:e2e
```

本机已有 Chrome 可设 `PLAYWRIGHT_CHANNEL=chrome`。Playwright 启动生产构建并仅为测试开启 mock。测试覆盖未确认不显示、字段选择、恢复、撤回、失败重试、取消及 375px 布局，不代表手机实机、真实模型或展场通过。

原 CI `/city` 失败来自已观察的 `GPU stall due to ReadPixels` driver warning。仅 CI 精确匹配这一诊断时记录为 annotation；其他 warning、JS error、CSP violation 仍失败，原 trace 保留。分类器有正负测试，不概括忽略所有 WebGL 警告。

### 本次实际结果（2026-10-18）

| 验证 | 结果 |
| --- | --- |
| `pnpm check` | PASS：格式、三个包类型检查、68 项测试、生产构建 |
| `pnpm test:rules` | PASS：demo-ai-city 本地 Firestore/Storage emulator，98 项 |
| `CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`（Windows 用相应环境变量语法） | PASS：11 项，含会话丢失后页面内恢复 |
| 生产构建 `AI_CITY_ENABLE_LOCAL_MOCK=0` | 实际请求返回 404 MOCK_DISABLED |
| 浏览器截图检查 | 375px 预览和问卷无横向溢出；名单读取与撤回已验证，证据在忽略目录 `output/playwright/` |
| Luna Max 独立只读审查 | 0 Critical；Node cookie 和 session recovery 两项由 A 修正，分别完成真实 HTTP 与浏览器红→绿回归 |

独立 reviewer 没有复审修正后的代码；修正后完整测试由 A 运行并核对。没有剩余已知 Critical/Important finding。B 对契约及素材兼容性的人工审查、真实图片/生成/云端接入、手机实机与目标平板验收均未完成。真实生成 P95、费用和展场效果未测量，不能使用本地模拟延迟代替。
