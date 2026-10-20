# 手机管理控制

Owner：A / Main。基于现有 `/admin`、ADMIN cookie 与 device-link API 扩充；不改变共享 schema、权限、Firestore 存储或三端入口隔离。

## 功能与状态

- **开场 / 休场**：一次带 `expectedRevision` 的请求同时设置 LIVE + motion enabled，或 MAINTENANCE + motion disabled。原单独模式与动作控制保留；设备 reduced motion 优先，旧 revision 仍返回 409。
- **通信状态**：显示管理端最后成功通信的时间，支持手动读取当前状态。它不是平板逐角色绘制回执；离线、超时与会话过期沿用原重连流程。
- **配对倒数**：按服务端返回的 expiresAt 计算剩余秒数，到期隐藏旧码并提示重新发码。服务器的单次使用、3 分钟有效期及限流不变；倒数依赖手机时钟，不能取代服务端有效性检查。
- **住民管理**：仅使用已授权公开的 snapshot；昵称搜索支持 NFKC 标准化，按参加顺序、逆序或日语名称排序。可选中当前搜索结果、取消选择、逐项或批次撤回。确认时固定目标 ID 集合并列出全部目标昵称，包括被新搜索条件隐藏的选择；新加入的住民不会自动加入这次操作。
- **部分失败**：逐项移除，第一项无法确认的请求后立即停止；不自动重试破坏性请求。显示已确认成功及未完成数量，再读取当前名单。请求成功但响应丢失时，结果仍是“未确认”；只有重新对账才能确认最终状态。未完成选择保留，自动轮询不会抹去操作错误。
- **解除展示连接**：先显示注册台数与再次确认，取消不发请求；确认后调用原 revoke API。解除不删除住民，重新连接需要新配对码。

## 本地验收（2026-10-20）

- `pnpm check`：PASS，lint、类型、140 unit、production build。
- `AI_CITY_JAVA_HOME=<已有 Java 21 目录> pnpm test:rules`：PASS，demo emulator 119 项；首次未指定 Java 目录时启动失败，指定现有环境后通过。
- `CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e --workers=1 --retries=0`：17 PASS。新增开场/休场、手动同步、配对码 UI 到期、解除取消、搜索/排序/选择、批次中断、人工重试与错误保留；原隔离平板同步和撤销回归通过。
- `AI_CITY_JAVA_HOME=<已有目录> CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:join:e2e`：4 PASS。真实 Firestore emulator 下两名虚构 owner 的批次撤回持久化为 REMOVED；免代码入场、三端无互链、隔离平板同步及实际 Node 重启恢复通过。
- 浏览器红→绿：新增开场按钮不存在时失败；实现后通过。批次单元测试先因模块尚不存在失败，再实现成功/中断语义。
- 首轮浏览器测试的排序定位器与 select 的 label 文本不匹配，导致虚构样例未清理、影响后续通用名单断言；改用 combobox role，并为样例增加 finally 撤回清理，完整重跑 17 PASS。
- 375px 手机完整截图已查看，未横向溢出；本地模拟 503 是故障注入，不是真实云端故障或物理断网验收。

云端发布、真实设备及持续运行需分别记录，不能从以上本地结果推断。

独立 Luna Max 静态审查发现批次确认缺少完整名单，已加入全部目标昵称与搜索隐藏项回归。配对 UI 没有服务端消费回执：已使用的单次码仍可能显示至到期；服务端会拒绝重用，不以连接台数推测该码是否被消费。到期后计时器停止。

修正后重新执行 `pnpm check` 全通过，并重跑 admin-controls + device-link 共 3 项 E2E（34.6 秒）PASS；独立复核未发现残余 mustfix。
