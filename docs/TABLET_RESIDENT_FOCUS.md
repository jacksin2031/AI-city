# 平板角色放大与欢迎入场

Owner：Main，本轮按用户要求负责 B 的展示范围。沿用现有 Phaser、模板插画与 PublicResident；不新增照片、模型调用或共享 schema。

## 行为

- 点击城市角色，原生 dialog 显示 192×256 放大角色、公开昵称、性格和兴趣。非公开字段沿用服务端的“非公開”，不查询私人问卷。支持“街に戻る”、ESC 和键盘可用的住民选择列表。
- 初次恢复名单不播放欢迎；同一 stream 后续新增住民依次显示“ようこそ、○○さん！”和挥手，约 3 秒后返回城市。欢迎卡可进入 profile；阅读期间不自动关闭，其余欢迎排队。
- 住民撤回时立即移除其 profile、欢迎及队列项。休止、断线、重新配对、模式或 stream 变化清除展示状态；恢复时视为当前名单，不补播断线期间的历史欢迎。
- 管理动作停止或 prefers-reduced-motion 优先：保留静态欢迎与举手姿势，关闭缩放入场和挥手影格切换。完整动作仍是模板插画示例。
- 只有一个 Phaser 实例，dialog 使用本地 SVG 图片。DEMO 卡片明确标为虚构见本；LIVE 只显示授权公开项。
- control revision 与住民 eventSeq 是独立时钟：较新控制配合较旧 snapshot 时接受控制、保留较新名单。renderer、卡片和选择列表共同读取已对账 roster，避免撤回角色被迟到回包恢复。

## 验收

- `pnpm check`：147 unit / lint / types / production build PASS。
- `AI_CITY_JAVA_HOME=<已有 Java 21 目录> pnpm test:rules`：119 PASS，demo emulator。
- `CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e --workers=1 --retries=0`：19 PASS（审查修正前的全量）。修正后重跑管理/平板关键路径 3 PASS，并加强 reduced motion、带标记的迟到快照、已排队入场的 maintenance 清除测试。
- `AI_CITY_JAVA_HOME=<已有目录> CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:join:e2e`：4 PASS，包括 Firestore 公开后的欢迎、非公开字段、打开中卡片随撤回消失和 Node 重启恢复。
- 红→绿：真实 canvas 选取前没有 dialog，测试失败；实现后通过。首轮为 mouse pointer，随后明确使用 hasTouch + touchscreen.tap 模拟触控；不称为物理平板验收。
- 独立 Luna Max 静态审查指出控制与快照交错时的旧名单重现，已修正并加入 unit 和故障注入验收。卡片、波动影格、maintenance 及离线清除都需直接断言，不能只凭测试标题。
- 1024×768 放大与欢迎截图已实际查看。无真实照片或角色生成验收；正式设备 FPS、耗电、长时间运行仍未测量。
- 最后一次相关 E2E：2 PASS（40.1 秒）；已确认带测试标记的旧 snapshot 实际进入轮询、等待 B+C 入场后再休止，避免故障注入和队列前置条件的假阳性。

## 现有限制

城市同时绘制前 20 名的上限沿用原实现；选择列表和新加入欢迎可处理当前全部公开名单。管理与展示在同一浏览器共用 Cookie 的已知问题属于独立认证任务，本轮未修改；联动验收使用隔离浏览器 context。

云端发布与真实设备验收需分别记录，不能由本地测试推断。
