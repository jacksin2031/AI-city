# 邀请式持久访客 HTTPS 发布记录

2026-10-19，Owner：A / Main。用户审阅 Draft PR #17、本地及 CI 验证结果和新增权限说明后明确回复 ok，批准更新现有预览、专用服务账号的 Firestore 读写与独立 HMAC Secret。没有合并 main、放开客户端 rules、处理真实照片或调用模型。

状态：COMPLETE（批准范围的云端配置、发布及 HTTPS 浏览器验收）。新参加流程的实际手机/平板跨网验收 NOT RUN；原设备联动的用户实机确认保留在上一份发布记录，不跨版本套用。

## 入口与操作

- [手机管理](https://ai-city-link-preview-391632496355.asia-northeast1.run.app/admin)：使用原管理钥匙登录，发出「参加用コード」。代码 3 分钟、一次使用，通过可信渠道交给指定访客，不放入 URL 或日志。
- [访客参加](https://ai-city-link-preview-391632496355.asia-northeast1.run.app/join)：输入代码，只用架空昵称体验。预览后逐项同意才公开，可撤回或删除参加信息。
- [平板展示](https://ai-city-link-preview-391632496355.asia-northeast1.run.app/tablet)：重新配对，管理端选「参加者の街」。设备会话在 revision 替换后失效，访客持久数据不受影响。

管理钥匙沿用 `ai-city-preview-admin:1`，未轮换、未打印。HMAC 秘密不需要交给使用者，也不出现在前端。

## 精确发布身份

| 项目                 | 实际值                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| 项目 / 区域          | ai-city-511822 / asia-northeast1                                                                       |
| 源码                 | 5b06b52c739f2ed9f28f95bdc9339f8d9041b168，PR #17；发布文档不改变已构建源码                             |
| 输入                 | 仅 git archive 的跟踪文件，不上传环境/凭证/未跟踪测试输出                                              |
| 归档 SHA-256         | E6B2AAD07E3422891FE2062390376A2C3BC2D6F0E4CAA1DAB8F74960A476B39E                                       |
| 东京 Cloud Build     | 3968635f-1213-4bb2-8b94-1f3199ebcf56，SUCCESS                                                          |
| 镜像                 | asia-northeast1-docker.pkg.dev/ai-city-511822/ai-city/visitors                                         |
| 固定 digest          | sha256:b555a4cbefe203b02575b78aa1143911f77286bbb22023703851d39304ad4e5c                                |
| 首个 revision        | ai-city-link-preview-visitors5b06b52a，先 0% / tag 健康验证，再提升                                    |
| 最终 revision / 流量 | ai-city-link-preview-visitors5b06b52b / 100%，同一个 digest；实际替换用于恢复验收                      |
| 数据库 / namespace   | STANDARD / FIRESTORE_NATIVE / (default) / preview-visitors-20261019                                    |
| 规格                 | 1 CPU、512Mi、concurrency 20、timeout 30s；service/revision max 1，min 0                               |
| Secret refs          | AI_CITY_ADMIN_KEY → ai-city-preview-admin:1；AI_CITY_VISITOR_HMAC_KEY → ai-city-preview-visitor-hmac:1 |

云端明确设置 visitors/mock/cloud opt-in、project、namespace 与原精确 HTTPS origin，移除 emulator/loopback 变量。首次 gcloud 参数被 PowerShell 未引用逗号展开导致 CLI 拒绝，未创建该次 revision；随后完整引用参数部署成功。阶段 tag 只验证健康/页面，错误 origin 的管理 API 403；完成后已移除 tag。

## 权限与数据边界

新增 custom role `projects/ai-city-511822/roles/aiCityPreviewVisitor` 仅含：

```text
datastore.databases.get
datastore.entities.get
datastore.entities.create
datastore.entities.update
datastore.entities.delete
```

只绑定 `ai-city-preview-runtime@ai-city-511822.iam.gserviceaccount.com`，条件 `resource.name=="projects/ai-city-511822/databases/(default)"`。没有 query/list、数据库管理、索引、备份、Storage 或模型权限；原 `ai-city-runtime` / `ai-city-ci` 未升级。条件按[官方每数据库 IAM 示例](https://firebase.google.com/docs/firestore/manage-databases#configure_per-database_access_permissions)，权限按[官方 API 方法要求](https://docs.cloud.google.com/firestore/native/docs/security/iam#required_permissions_for_api_methods)选择。该条件不是 collection/namespace IAM 隔离；应用层仍必须验证 owner、ADMIN/DISPLAY 和字段白名单。

新 `ai-city-preview-visitor-hmac:1` 为随机 256-bit，东京复制，只授予 preview runtime 此 Secret 的 accessor。临时本地传输文件已删除，未打印值，没有服务账号 JSON key；原管理钥匙不变。客户端 rules 仍 deny-all，未部署任何规则变化。

## 实际验证

使用真实 HTTPS 服务、真实 Firestore 与隔离浏览器 context，只创建两名虚构匿名访客。所有检查 PASS：

| 范围           | 实际结果                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 基础与匿名权限 | health 200；匿名 admin/display 401；远端 bootstrap 403；旧 dev API 404                                                    |
| Admission      | 无邀请及伪造 HMAC cookie 401；管理发邀请码成功；已消费码重放 401                                                          |
| 跨角色         | DISPLAY 发邀请/删除 403；访客读管理 401；另一访客读他人 job 404；跨 origin 管理 403                                       |
| 本人恢复/公开  | 刷新恢复 READY；分项确认后平板同步；未同意性格为非公开、兴趣为空，快照无输入/owner/同意记录                               |
| Cookie / 手机  | HttpOnly、Secure、SameSite Strict、Path=/api/visitor；375px 无横向溢出                                                    |
| 真正云端恢复   | 在住民公开时创建并切换到 revision b；旧管理及显示 session 401，同一 visitor cookie 恢复 PUBLISHED；重配平板后仍显示原住民 |
| 撤回与删除     | 撤回同步到平板，服务端读回 REMOVED；本人删除后 API 401；另一测试访客也已退出                                              |
| UI / JS        | 375px 手机及 1024×768 平板截图已视觉检查，浏览器无非预期 JS/console error                                                 |

测试完成恢复 DEMO、motion enabled；只退出本轮管理及平板，没有撤销其他设备。随后以只读检查目标 namespace metadata：activeSessions、pendingSessions、invitations、public residents 均为 0。保留空状态 metadata/stream，未递归删除真实数据库。临时 tag 已移除；本地临时管理凭证已从环境移除。

截图在忽略目录 `output/playwright/cloud-persistent-visitor.png` / `cloud-persistent-tablet.png`；清理后的验收摘要在 `.artifacts/visitor-cloud-acceptance.json`，只含检查结果，不含 cookie、代码或秘密。这是独立浏览器 context 验证，不是两部物理设备。

源代码本地及 GitHub CI 的 unit 134、rules 119、真实 emulator transaction 4、既有浏览器 15 与访客/Node 重启 2 均 PASS；源码 PR/push workflow 39261993407 / 39261984946 四项全部 SUCCESS。新发布文档不冒充新的实现测试。

## 限制与回退

身份仅匿名设备能力；固定 24h、pending 3min、惰性清理不等于精确物理删除。人物与任务仍为插画 MOCK，无照片、真实模型、Cloud Tasks 或真人核验。入口限流/预算、目标设备睡眠/网络恢复/性能/长时间运作仍待后续；应用有界限流与单实例不是费用上限。

如新功能异常，可将服务流量恢复到保留的原 mock revision（会隐藏新参加入口，但不删除 Firestore 资料）：

```powershell
gcloud run services update-traffic ai-city-link-preview --project ai-city-511822 --region asia-northeast1 --to-revisions ai-city-link-preview-origin746db21=100
```

确认新 revision 无流量/tag 后，再视需要移除上述带条件的 visitor role binding；不要删除既有数据或原管理 Secret。停止公网访问的既有操作仍见设备发布记录。没有自动执行回退或撤权。
