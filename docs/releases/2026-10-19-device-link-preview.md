# 设备联动 HTTPS 预览部署记录

2026-10-19，Owner：A / Main。用户在具体 PR #15 成品和部署/费用说明后明确回复 yes，授权在现有 AI-city Google Cloud 项目部署独立 HTTPS mock 预览。没有合并 main，没有修改 Firestore/Storage 客户端规则，没有真实照片、匿名公众参与或模型调用。

状态：COMPLETE（本轮基础手机管理、配对平板展示与跨网连动）。云端部署及 HTTPS 浏览器验收已完成；用户随后确认实机及不同网络连动成功。浏览器隔离 context 与用户实机回报为不同证据来源，不混为代理独立实机测试。

## 使用入口

- 手机：[管理页面](https://ai-city-link-preview-391632496355.asia-northeast1.run.app/admin)。项目负责人从 [Secret Manager](https://console.cloud.google.com/security/secret-manager/secret/ai-city-preview-admin/versions?project=ai-city-511822) 的 ai-city-preview-admin 版本 1 查看管理钥匙，输入后发出 8 位配对码。
- 平板：[展示页面](https://ai-city-link-preview-391632496355.asia-northeast1.run.app/tablet)。输入该配对码，只获得展示权限。配对码 3 分钟、单次使用；管理员会话 1 小时、展示会话 8 小时。
- 两端使用上述同一个 HTTPS origin；可在同 Wi-Fi 或各自网络访问，无需互相知道局域网 IP。实际跨网设备验收见后文。
- 管理钥匙只给可信管理者，不放进链接、二维码、Git、聊天或前端环境变量。远端 /setup 不能领取钥匙。

## 精确发布身份

| 项目 | 实际值 |
| --- | --- |
| Google Cloud 项目 / 区域 | ai-city-511822 / asia-northeast1 |
| 源码 | 746db211d515f8365b1a1e3f914d2978b1f4cc95，PR #15 |
| 构建输入 | git archive 只包含该 commit 的跟踪文件，不上传本地环境或未跟踪文件 |
| 源码归档 SHA-256 | 8B1954A652800BA337991B8AE1C02E93DF22BCF2D67BF51734A90F5D19C27ADF |
| Cloud Build | fa386bc0-6803-400d-a034-e9eeb26aa6e3，SUCCESS |
| 镜像 tag | asia-northeast1-docker.pkg.dev/ai-city-511822/ai-city/device-link:746db21 |
| 镜像 digest | sha256:7379d425c31302314da5c53d5b57d168f950f4c3fa6ac27553d380c4340d536c |
| Cloud Run 服务 | ai-city-link-preview |
| Ready revision / 流量 | ai-city-link-preview-origin746db21 / 100% |
| 运行规格 | 1 CPU、512Mi、concurrency 20、请求 timeout 30 秒、port 8080 |
| 实例限制 | service 和 revision 均 max 1，min 0；内存 mock，不支持多实例 |
| Secret 注入 | AI_CITY_ADMIN_KEY → ai-city-preview-admin:1；未打印其值 |
| 环境 | AI_CITY_ENABLE_LOCAL_MOCK=1；AI_CITY_PUBLIC_ORIGIN 为上面的精确 HTTPS origin |

构建实际运行 infra/app/Dockerfile，Node 24.18.0、pnpm 11.9.0，frozen lockfile 安装后 build，非 root node 启动 scripts/start-remote.mjs。Cloud Build 使用 CLOUD_LOGGING_ONLY；成功状态与镜像 digest 已核对，没有声称已读到不存在的 stdout 日志。

先部署为私有服务和无效占位 origin；再配置实际 HTTPS origin，通过带 Cloud IAM 身份的 API 验收后，才在这个服务上授予 allUsers 的 roles/run.invoker。未认证页面可打开，但管理、展示和参与 API 仍由应用会话与角色限制。不要使用 Cloud Run 的另一别名域名，否则精确 origin 检查会拒绝请求。

## 新增资源与权限范围

| 身份 / 资源 | 本次权限 |
| --- | --- |
| ai-city-preview-builder | 项目 logging.logWriter；仅 ai-city 仓库 artifactregistry.writer；仅新源码桶 storage.objectViewer |
| ai-city-preview-runtime | 仅 ai-city-preview-admin Secret 的 secretmanager.secretAccessor；无项目级角色，无数据或模型角色 |
| ai-city-511822-preview-builds | 东京、uniform bucket-level access、public access prevention enforced；对象 age 1 天异步删除 |
| ai-city-preview-admin | 东京复制，版本 1；64 字符随机钥匙；没有服务账号 JSON key |
| ai-city-link-preview | 仅该服务允许公网 invoker；应用管理/展示会话仍必需 |

原 ai-city-ci、ai-city-runtime、GitHub OIDC 和两个原私有数据桶未修改；默认 compute 身份没有用于本次构建/运行。源码暂存桶保留创建时的项目 owner/editor/viewer 继承访问，没有额外开放公网。没有设置或更改全局 gcloud configuration / ADC。

## 验证证据

源码 746db21：pnpm check PASS（91 unit、lint、typecheck、build）；pnpm test:rules PASS（98）；Chrome pnpm test:e2e --retries=0 PASS（15）。GitHub push/PR 两组共 8 个检查 SUCCESS，runs 39222955560 / 39222963240。发布记录只修改文档，不把源码测试冒充对文档的新一轮运行。

云端真实 HTTPS 验证：

| 检查 | 结果 |
| --- | --- |
| 私有阶段无 Cloud IAM 身份访问 | 403 |
| 公开阶段 /api/health、/admin、/tablet | 200 |
| 未登录管理/展示 API | 401 / 401 |
| 未登录远端参与快照、远端 bootstrap | 403 / 403 |
| 管理登录、管理员状态、跨 origin 控制 | 200 / 200 / 403 |
| 独立 cookie context 平板配对 | PASS；只读 DISPLAY 控制请求 403 |
| DEMO / LIVE / MAINTENANCE、动作开关 | PASS；休止时清除 canvas，恢复后只有一个 canvas |
| 虚构样例准备、分项确认、公开同步 | PASS；确认前 0，确认后 1；consentVersion 2，未同意性格/兴趣不公开 |
| 手机删除、平板刷新、参与页删除状态 | PASS；公开快照恢复 0，参与页显示删除 |
| 挂起展示请求 4 秒限时 | PASS；清除旧画面并显示重连，解除拦截后恢复一个 canvas |
| 手机解除全部平板、管理退出 | PASS；展示/管理 API 均返回 401，平板 canvas 为 0 |
| Cookie 属性 | HttpOnly、Secure、SameSite Strict、Path=/api |
| 375px 管理 / 1024×768 展示 | document width 分别 375 / 1024，无横向溢出 |
| CSP / JS | 无异常；199 条控制台记录均为登录前/撤销后的预期 401/403 网络拒绝 |

HTTPS Chrome 使用两个隔离 BrowserContext，不是两部真实设备。截图位于忽略目录 output/playwright/cloud-phone-admin.png、cloud-tablet-live.png、cloud-phone-clean.png、cloud-tablet-demo.png，已逐张实际检查；管理截图中的配对码已消费且过期。

验证结束：虚构测试住民接続テスト・そら 已删除；恢复 DEMO、motion enabled；测试平板全部撤销、当前测试管理会话退出，浏览器关闭。用于测试的本地管理钥匙和 cookie 临时文件已删除；Secret Manager 保留运行所需版本。任何较早测试管理会话最多 1 小时自动失效。

## 用户实机验收与后续限制

- 2026-10-19 用户先回报“實機沒有問題”，在追问网络条件后确认“不同網絡也成功”。本轮基本实机跨网连动 USER CONFIRMED，完成对应验收；没有要求用户重复测试。
- 用户未提供型号、运营商或具体网络组合、截图及逐项日志；不推断所有 iPhone/Android、同 Wi-Fi/移动数据组合都经过测试。
- 正式展览前另测目标设备的休眠/网络恢复、全屏、FPS、耗电及持续运行。用户基本连动回报不能替代这些专项验证。
- 单进程内存会因重启或缩至零丢失住民与所有会话，需重新登录/配对；不可宣称持久化或正式展场可用。max 1 不能把重启/替换实例变成可靠存储保证。
- 只有插画和预设对话；远端参与仅限管理员创建虚构样例，不处理真实照片或付费生成。
- 基础限流不是完整防 DDoS；正式公开运营的边缘治理与持久化另行设计。构建、镜像、Secret 和请求可产生费用，持续轮询会产生运行负载；min 0 / max 1 不是费用上限。

## 停止访问与回退

需要停止公开预览时，由负责人执行：

```powershell
gcloud run services remove-iam-policy-binding ai-city-link-preview --project ai-city-511822 --region asia-northeast1 --member=allUsers --role=roles/run.invoker
```

再从无 Cloud IAM 身份的浏览器确认服务 403。此步骤只停止公网访问，不删除镜像、Secret 或服务。若有问题，不回退到占位 origin 的初始 revision；重新构建并验证所需 commit，保持唯一精确 origin、Secret 引用与单实例限制，先私有验收再重新开放。没有自动执行停止访问或删除资源。
