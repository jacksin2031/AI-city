# Google Cloud 开发基础

以 `infra/cloud.json` 为配置来源。现有项目为 `ai-city-511822`，project number `391632496355`，东京 `asia-northeast1`。当前是开发环境，不是生产环境。已建立独立 gcloud configuration `ai-city`，但没有切换用户全局 active configuration。

## 资源设计

| 资源 | 用途及限制 |
| --- | --- |
| Standard Firestore `(default)` | 东京，启用删除保护；初始规则拒绝所有客户端访问 |
| `ai-city-511822-private` | 私有临时照片输入，uniform access / public access prevention |
| `ai-city-511822-assets` | 受控素材，仍为私有；没有对外开放 bucket |
| Artifact Registry `ai-city` | 已存放设备联动预览镜像；正式运行版本使用 digest 固定 |
| Cloud Tasks `avatar-generation-dev` | 并发 2、每秒最多 1 次、最多 2 次尝试；当前无处理器或任务 |
| `ai-city-runtime` | 无 key 的未来 runtime 身份，目前不预授予数据/模型权限 |
| `ai-city-ci` | 仅项目元数据和启用 API 列表读取；不能部署、读取数据或调用 Gemini |
| Cloud Run `ai-city-link-preview` | 2026-10-19 经用户确认部署的 HTTPS mock 预览；单实例、应用层管理/配对鉴权 |
| `ai-city-preview-builder` / `ai-city-preview-runtime` | 独立预览构建及运行身份；不升级原 CI/runtime，不使用默认 compute 身份 |
| `ai-city-511822-preview-builds` | 东京私有源码暂存桶，UBLA/PAP，一天异步生命周期清理 |
| Secret `ai-city-preview-admin` | 随机管理钥匙，仅预览 runtime 可读，值不进入 Git/前端/聊天 |

`infra/bootstrap.ps1` 可由项目 owner 运行，先查询再创建；检查 project number、bucket 安全与区域、CI 角色权限与额外绑定，以及 WIF 唯一 provider、issuer、mapping 和条件。发生漂移时停止，不静默扩大权限。不覆盖已有数据库，不运行模型或应用部署。资源是否创建成功以 `SETUP_STATUS.md` 的实际记录为准。

## GitHub OIDC

pool `github-ai-city`、provider `github`；绑定 repository ID `1422735194`、owner ID `78193899`、`refs/heads/main` 与 `development` environment。只允许 `ai-city-ci` 的 workloadIdentityUser。自定义 `aiCityCiVerifier` 只有三个元数据读取权限。

GitHub environment variables 包含项目、区域、WIF provider 和 CI SA email，均不是密钥。普通 PR 的 CI 无 `id-token` 权限；手动 `Cloud identity verification` 只读取元数据，没有部署动作。后续部署需要另行设计、审查最小权限，不能直接把此只读身份升级成 Owner/Editor。

## Firebase

Firebase 已添加到同一 GCP 项目。默认 alias 是 `demo-ai-city`，真实 development alias 指向真实项目。所有部署命令必须显式 `--project ai-city-511822`。本阶段仅部署 Firestore 拒绝访问规则，不部署 Hosting、Storage 或 Auth 功能。GCS 两个 bucket 用 IAM 管理；仓库中的 Storage rules 当前用于 emulator 基础，不应误称已保护任意 GCS REST 访问。

## 费用与数据清理

已有 billing。空资源和 API 启用不代表后续使用免费；2026-10-19 用户明确确认后已使用 Cloud Build、Artifact Registry、Secret Manager 和 Cloud Run 部署 mock 预览，可能产生构建、存储和运行费用。没有模型请求或真实用户数据。预算金额和提醒接收人尚未决定，不虚构已建立硬消费上限。单实例上限也不是费用上限，浏览器持续轮询会保持请求负载。预算提醒不是可靠实时断费开关。

私有桶的一天生命周期是清理兜底，GCS 生命周期异步执行，不能当作精确 24 小时删除保证。真实业务仍需生成后清理、保留期限和撤回机制。当前只有预览管理钥匙 Secret，没有 Gemini API key；后续模型接入优先使用 Vertex AI + ADC 的 runtime 身份。预览 runtime 没有 Firestore、Storage 或模型权限。资源范围、验收和停止访问步骤见[设备联动预览记录](releases/2026-10-19-device-link-preview.md)。

## 新协作者

账号确定后，GitHub 邀请使用 Write 权限；Google Cloud 按工作需要授予窄范围开发权限，不能直接给 Owner/Editor。B 默认只需本地 fixture，不要求云管理员权限。所有个人邀请和 IAM 授权均需实际账号，当前保留待办。
