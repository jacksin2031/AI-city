# 平板镜头聚焦与场景内欢迎

Owner：Main，本轮按用户要求负责 B 的展示范围。沿用 Phaser、本地模板插画与 PublicResident，不新增照片、模型或共享 schema。

## 交互

- 点击地图角色，镜头平移并放大到角色所在处；角色的世界坐标、路线不变，不把角色搬到广场中央，也不新增头像副本。当前聚焦期间角色暂留原地，其他住民继续原有行为。
- 角色头顶显示局部的公开资料气泡，显示昵称、公开性格及兴趣。无 modal、背景遮罩或焦点陷阱。点击裸露地图、气泡关闭按钮或 ESC 返回全景；列表提供键盘选取入口。
- 新住民在自己的登场位置举手、头顶显示“ようこそ、○○さん！”，约 3 秒后收起。欢迎不改变镜头；点击欢迎气泡可查看资料。多人依次欢迎，阅读资料期间排队。
- 初次恢复名单、重连或新 stream 不补播历史欢迎。本人撤回、休止或断线清除气泡与队列；恢复只显示当前名单。
- 动作停止或 prefers-reduced-motion 会关闭镜头过渡和挥手影格切换；聚焦立即就位，欢迎保持静态举手。DEMO 明示虚构见本，LIVE 只接收 PublicResident 公开字段。

## 实现边界

`renderer.present` 控制实际 Phaser main camera，`focusCamera`/`projectResident` 计算镜头和屏幕投影。气泡通过 SVG foreignObject 与同一 960×600 画布对齐；只有局部按钮接受指针，不覆盖整张地图，也不引入 inline style 或 CSP 放宽。Phaser 关闭 windowEvents，只处理画布输入，避免 HTML 气泡点击被再次解释为地图点击。

renderer、气泡及选择列表仍读取已对账 roster。控制 revision 和公开 eventSeq 保持独立；新控制不能用旧快照恢复已撤回住民。地图常态绘制前 20 名；聚焦的住民若在其后，临时绘制该本人（最多 21 名），结束后移除临时绘制，名单仍可选择全部公开住民。

气泡在地图局部显示，长公开文字在气泡内滚动，关闭按钮固定可用。profile 镜头最多 2 倍；离开聚焦回到完整地图。插画和行为仍是模板示例。

## 验证

- 先新增实际 canvas 触控验收：旧 modal 无法满足场景 region 条件而失败；实现镜头聚焦后通过。
- 镜头投影、原地欢迎、气泡边界两项 unit 红→绿。E2E 直接断言 renderer 输出的实际 world 坐标不变、main camera zoom 与投影位置；实际截图检查放大的是角色周围原有建筑。
- `pnpm check`：155 unit / lint / types / production build PASS。
- `pnpm test:rules`：119 PASS（demo emulator）。
- `CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e --workers=1 --retries=0`：19 PASS（1.6 分钟），包括 80 字长昵称、气泡内滚动和固定关闭按钮、横直屏、裸露地图点击返回全景、world 坐标不变，以及队列、撤回、迟到快照、休止和离线清理。
- `AI_CITY_JAVA_HOME=<已有 Java 目录> CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:join:e2e`：4 PASS（19.4 秒），覆盖 Firestore 公开后的头顶欢迎与资料、隐私及本人撤回清理。

## 未验证与独立后续

本轮浏览器触控与离线是模拟，物理设备、FPS、耗电和长期运行未重验。仍需目标 iPad / Android tablet 检查 SVG foreignObject、触控与全屏；不会把 Chrome 验收称为实机验收。

本轮独立 Luna Max 覆核因模型用量上限未完成，没有切换其他 subagent 模型；Main 已自行检查镜头投影、renderer 生命周期、队列、权限及清理逻辑，不将此描述为独立审查通过。

同浏览器 admin/display 共用 Cookie 的已知问题属于独立认证任务，本轮未修改，联动验收使用隔离 browser context。照片、真实生成、正式 B 资产及寻路没有新增实现。云端发布、CI、HTTPS 流程和清理证据独立记录于 PR，不能从本地验证推断。

最终镜头过渡清理版本重跑两项平板 E2E：2 PASS（43.1 秒）。

## Issue #58 P7 / P8 / P11 修订（2026-11-06）

- **P7 接続コード**：`/tablet` 表单改为 `noValidate`，由 `pairing-code.ts` 校验并以日语 `role="alert"` 显示（空白 / 非数字 / 非 8 桁），不再出现浏览器原生英文 required/pattern 提示；输入框带 `aria-invalid` / `aria-describedby`。新增可选「コードを隠す / コードを表示」按钮（`aria-pressed`，默认显示），仅切换 `type=password`。配对码仍为 3 分钟单次有效，服务端未改动；错误信息与 console 不包含码值。
- **P11 住民选择**：`packages/city/src/picking.ts` 取代只命中精灵矩形的射线检测。每位住民的命中区至少约 56 CSS px（按画布实际缩放换算），相邻区域按最近中心分配而不重叠；点中角色身体始终优先。按下时记下被点住民，抬起时若其已走开仍采用，以补偿移动目标。**建筑**：点击落在建筑上时只用角色身体的精确区域，扩大区域不会截走建筑点击；建筑点击仍按原有行为打开 `LandmarkCard`，本次没有新增建筑详情。操作员的「住民のプロフィールを選ぶ」列表和其他控件保持不变。
- **P8**：角色卡片图像使用固定 1:1 占位框（`aspect-ratio`），加载后淡入，reduced-motion 下无动画。问卷步骤统一为 4 步（仅预设角色流程跳过照片步骤但编号不变：1 名前 / 2 キャラクター / 3 質問 / 4 確認），修正原先预设流程 1/4 → 1/3 的不一致。
- 验证限制：本记录不代表实机触控验证；见 PR 说明。
