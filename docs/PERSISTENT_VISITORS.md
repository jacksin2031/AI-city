# 邀请式持久访客（虚构样例）

Owner：A。分支 `codex/persistent-visitors`，基于设备发布文档分支；不修改 B 的 renderer 或公开 snapshot shape。当前线上设备 preview 尚未部署本功能。

## 使用流程

管理员在 `/admin` 登录并发出参加用代码；访客在 `/join` 输入该代码。同意只覆盖当前展示的虚构头像及逐项勾选的公开字段。管理员切到「参加者の街」后，已配对 `/tablet` 才显示访客。撤回立即从公开快照移除；本人退出删除会话及其任务资料。

邀请码为 3 分钟、一次性，最多 10 个同时有效。复制给指定访客，勿放入 URL、日志或 Git。兑换响应丢失时，管理员重新发出代码；已消费代码不能再次兑换，避免把他人会话交给重放者。初次会话的 3 分钟 pending lease 要在本人第一次有效 API 访问时确认；没有收到 cookie 的会话到期失效，后续合法操作会回收容量。

身份是本浏览器的匿名设备凭证，**不代表真人核验或 Firebase Auth**。HttpOnly/SameSite=Strict cookie 只作用于 `/api/visitor`；HTTPS 加 Secure，服务端检查所有权、同源和严格请求 schema。浏览器关闭后能否恢复仍取决于其 cookie 保留；原始凭证不写入 Firestore。固定 24 小时从创建时计时，访问不延长。

## 本地启动和验证

Node/pnpm/Java 版本沿用 DEVELOPMENT.md。只使用 `demo-ai-city` 与 loopback emulator。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:rules
pnpm test:persistence
pnpm test:e2e
pnpm test:visitor:e2e
```

最后一项使用上一条命令产生的生产 build，在 3001 端口启动独立测试服务；另于 3002 停止及重启 Node，核对访客恢复、管理会话失效和删除。两者使用固定的虚构测试 key，trace 关闭，不含真实凭证。持久化、rules、访客 E2E 都使用 8080 emulator，不能同时运行。Windows 可用 `AI_CITY_JAVA_HOME` 指向已有 Java 21。

手动本地预览：先在一个终端 `pnpm emulators`，另一个终端设置下面的本地环境后运行 `pnpm dev`。将独立随机 HMAC key 放在忽略的 `apps/web/.env.local`，不要复制测试 key 到公开服务。loopback marker 由本地 launcher 提供。

```dotenv
AI_CITY_ENABLE_LOCAL_MOCK=1
AI_CITY_ENABLE_VISITORS=1
AI_CITY_VISITOR_PROJECT_ID=demo-ai-city
AI_CITY_VISITOR_NAMESPACE=local-exhibition
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
# AI_CITY_VISITOR_HMAC_KEY: 本地独立随机秘密，32–256 字符
```

## 存储和权限

服务器 SDK 使用 Firestore STANDARD / Native 事务，文档在 `visitorExhibitions/{namespace}/meta|sessions|jobs|requests/{id}`；客户端 rules 对这些路径维持 deny-all。会话仅存 SHA-256，公开快照不含输入、所有者 digest 或同意记录。最多 200 个活动会话，每会话最多 32 次任务创建，失败不部分提交。确认幂等、撤回和管理员删除防止旧重试令住民复活。未授权管理/展示请求不读取访客集合。

独立 HMAC key 按 namespace、用途签名，随机伪造凭证在读取 Firestore 前拒绝。已发出的有效凭证有单进程 60 次/分钟限制、最多 1024 个限流桶；这不是多实例全局限流或公网 DDoS/成本上限。会话过期即时失去访问权限及公开可见性；物理资料在后续合法操作时惰性清理，没有后台 TTL 删除承诺。

没有数据库内存 fallback。SDK 故障返回日语 503。原 `/api/dev` 在持久模式关闭，不能绕过新权限。管理员和 DISPLAY 沿用原角色验证，DISPLAY 不可发邀请或删除。控制 revision、管理员登录、配对和展示模式仍属进程内状态；重启要重新登入/配对并选择参加者模式，访客资料独立保留。

## 云端发布边界

本轮只在 demo emulator 写入，真实项目仅只读确认版别。原线上设备联动与用户实机确认不覆盖此功能。云端要求明确 `AI_CITY_VISITOR_ALLOW_CLOUD=1`、project `ai-city-511822`、独立 exhibition namespace、原精确 HTTPS origin、mock opt-in、稳定 ADMIN_KEY 和独立 `AI_CITY_VISITOR_HMAC_KEY`。缺一失败关闭；HMAC 轮换会使现有 cookie 全部失效，不复用管理 key。

发布前另需批准：为专用 preview runtime 配置最小 Firestore 数据访问权限、在 Secret Manager 保存新 HMAC 秘密及其限定访问权，并更新 Cloud Run；沿用现有公共服务，不扩大其他项目权限。配置公网入口限流和预算、再测新版本实际跨网设备。Firestore server IAM 会绕过客户端 rules，所以不能以 rules PASS 代替真实 runtime/IAM 验收。

尚未包含：照片上传、真人身份核验、真实头像/文字模型、Cloud Tasks、设备会话持久化、正式生产展览与目标平板长时间性能。所有人物、插画和生成任务仍明确标记 MOCK。

## 本轮证据（2026-10-19）

- `pnpm check`：格式、全 workspace 类型、134 个 unit tests、生产构建 PASS；最后追加 cloud ADMIN key 缺失/过短的负向断言后，config 5 tests 单独 PASS。
- `pnpm test:rules`：119 PASS，包含新 visitor collection 的匿名及已登录客户端拒绝测试。
- `pnpm test:persistence`：4 PASS，包含两个独立 Firestore client 竞兑同一邀请只成功一次、事务失败回滚、重建 SDK/service 恢复、并发确认及字段隔离。
- `CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e --retries=0`：原有 15 项全部 PASS。
- 同环境 `pnpm test:visitor:e2e`：2 PASS；独立访客/管理/平板浏览器上下文完成参加、重载恢复、所有权隔离、分项公开和撤回；另一项实际停止并重启 Node 后验证保留及重新登录。截图在忽略目录 `output/playwright/persistent-visitor.png` / `persistent-tablet.png`，已视觉检查 375px 手机及 1024px 平板，无横向溢出。
- 独立 Luna Max 静态安全复核：无剩余 Critical/Important；Minor 的 admission 失败语义和 ADMIN key 负向配置测试已补齐。
- 首轮干净 CI 揭示 REST fallback 在 emulator 仍会发现 ADC；本机已登录掩盖了问题。emulator 改用无认证 gRPC，云端保留 REST；持久化及浏览器测试显式使用不存在的 ADC 路径，确保不靠开发者凭证。修正后重新执行 Firestore 4 项、访客/重启 2 项及 build/格式验证。

本地实现及上述验收 COMPLETE；新功能云端 IAM、真实 Firestore 写入、发布及新版本实机跨网验收 NOT RUN。测试只使用虚构输入。
