# 图片生成与订阅生图配置

## 当前014：单角色会话、部件作用域与独立贴合审核

每个角色绑定自己的持续Codex会话、原照片SHA和设计书；固定会话ID续接，禁止--last或跨角色历史。模型只负责这一人物，完成/有限失败后结束本轮会话并保留证据。外层执行模型显式请求gpt-6-luna/low；图像工具内部模型版本未暴露，不虚构具体GPT Image型号。CLI耗时不等于纯生图耗时。

衣身与腿的生图输入仅原照+对应Harri构造+Davide/Spineboy画风，共3图。腿写裤管布料与鞋；不附固定头/耳，不混入露肤、手臂、发型或面部叙述。标准腕继续代码配色与袖长处理，AI调用0；不改变原alpha结构和两类勾线。空白/不透明/坏图/结构错层仍拒绝。

前发左右连接处保留1～3%余量，当前测量取各侧1%头宽；下颌正常显露不算覆盖失败。原固定头模的侧颊采样截止78%头高，排除过去80～90%下颌被误作必须盖发的区域；这一分区是实验规则而非生产尺寸。发鬓底部单独按装配后与邻近头模轮廓是否自然贴合审核：历史第三例候补2轻微突出可接受，候补3细长尖鬓过长为反例，不要求发片底边与头模最低点水平齐平或围住下巴。前后整体高仍记录并保持近似，禁止横向拉伸。

只有明确定位为发鬓末端PROPORTION时，允许局部修改同一份冻结发片+头模组合参考，保持已合适的顶部、刘海、脸窗、宽度、配色与位置；每次仍带原照和原画风参考，不把上次编辑结果再作为下次目标。PNG画布以整体等比注册到原基底，非等比变化拒绝；不裁切原Spine轮廓，不用蒙版补救。其他重新设计仍从原照片开始。

耳模式先记录原照片左/右的VISIBLE、HAIR_OCCLUDED或UNCLEAR及原因，再由规则决定：任一侧可见或不确定均为PARTIAL_BOTH，只有两侧都明确被头发遮住才可HIDDEN。看不清耳形、照片转头导致远侧不可见，都不能直接选择隐藏。审核必须独立核对原照，不能仅信任模式字段。当前默认standard-ear-001：复用原Spineboy简化耳形，按固定头高约12%等比缩小，在已冻结耳根位置补上前后同高的小耳；耳形无需按真人定制，AI调用0，不重新生成头发或人物。原耳槽始终隐藏，不恢复原大耳。新增耳片内侧根部在侧发后、外侧部分在侧发前，形成夹在头发里的效果；只安排新耳片遮挡，绝不裁切/蒙版/拉伸或重采样原头发。前后原始发片和整人8件原稿SHA不变。两只耳分别至少40%可辨，目标约40～60%；后视自然多露允许，但不能为了可见性放大成大耳或挪动头发。必须有真实标准耳来源/工件和正常图的逐耳证据，模型PASS或合计像素不能代替。旧AI补耳流程仅按历史工件回放。

每角色每件最多初次+3次重生，服务拦截也计数，跨初次/修复/补耳共用持久计数，不通过换会话重置。已知拦截只能以新的正常部件说明重试；未知结果先收取已有结果，不能盲目重发。所有尝试、PNG、原因、会话归属、耗时和SHA留存。阶段辅助PASS不是整人/生产批准。

## GPT Image：官方 Codex CLI 内置生图

2026-11-01 按官方文档改为 **ChatGPT 登录的 Codex CLI 内置 ImageGen**。官网说明该功能计入一般 Codex 使用限额；这不是 Images API，也不是 API Platform 赠送余额。本工具不读取 OpenAI API Key，不读取/复制 OAuth token，不直接请求 ChatGPT 内部接口。OpenAI 图片 API 请求代码和网页入口已删除。Grok API 与本机 ComfyUI 是独立通道，保留原功能。

依据：[官方生图说明](https://learn.chatgpt.com/docs/image-generation)、[登录与强制登录方式](https://learn.chatgpt.com/docs/auth)、[Codex CLI 参数](https://learn.chatgpt.com/docs/cli/reference)。官方文档给出内置 ImageGen 模型和用量说明，工具不将它伪装为可任意指定模型的 API。官网支持 CLI 内置生图，但没有声明本工具是官方提供的独立订阅 API：这里是本地程序调用官方 CLI 的集成。

## 安装、登录与启用

本机需要官方原生 Codex CLI（本轮检测到 0.166.0-alpha.5.1）；在终端运行 `codex login` 并选择 ChatGPT 登录，`codex login status` 必须确认 ChatGPT，API Key 登录会被拒绝。不要把 auth.json 放进项目。工具只调用登录状态命令，不读取其凭据文件。

把 `runtime/config/providers.example.json` 复制到被忽略的 `runtime/secrets/providers.json`。schema 2.0.0 的 `codex.executable` 默认 `codex`，也可指定可信官方原生 exe 绝对路径；`codex.timeout_seconds` 默认 600。默认 live_enabled/upload_consent 为 false，必须按用户授权开启；这次单部件测试已授权。保留 `max_live_calls` 的限次预留；Codex 使用独立 `codex-call-*.reserved`，避免与历史 API 请求计数混淆。失败/超时占用次数，重启不归零，无自动重试。

旧 1.0/1.1 配置在内存迁移时删除 openai 配置并关闭 live_enabled，要求使用者检查新通道后重新启用；不把旧的 API 调用授权当成新传输启用。当前本机配置已按本次授权迁移，不在 Git 内。Grok 的 billing_source 仍只控制 Grok API；Codex 作业独立记录 CODEX_SUBSCRIPTION，不需要把 API 余额标成已确认。

## 实际调用与参考图

`codex_subscription.py` 使用参数数组启动 `codex exec --ignore-user-config --ephemeral --json --sandbox read-only`，强制 `forced_login_method="chatgpt"`，启用内置 image_generation；五个 `--image` 附件与 stdin 提示词一并提交。子进程环境去除 OPENAI_* / AZURE_OPENAI_*；不装载用户自定义 provider 配置，不回退到付费 API。CLI 若缺失、登录不是 ChatGPT、工具不可用、限流或结果超时，保留失败记录并停止。

每次只生成一个部件，使用与工具导出相同的 `build_part_prompt`：原始真人照片、中性画布/锚点图、固定原头模/耳、原 Harri 对应部件、原 Davide/Spineboy 对应部件风格板。头发任务的风格输入用 body，无旧角色发型；禁止此前生成部件/预览作为模型输入。详细形状规则见 `TEXTURE_CONSTRUCTION_BASELINE.md`。

原始返回文件必须是本次新生成、位于 Codex generated_images 或该作业目录中的实际图片，随后复制到作业 raw-image.bin / image.png 并解码检查，不自动覆盖当前人物。每个作业保存 prompt.txt、参考图副本与哈希、codex-events.jsonl、codex-stderr.log、结构化结果与 report.json，均在被忽略的 runtime/work 中。原始事件可能含私人输入/模型内容，不提交或打印。

## 状态含义与限制

网页显示 ChatGPT 登录状态及 Codex 订阅通道，不显示或推定剩余额度。登录成功不能证明剩余额度或生图工具可用；只有真实返回图片才是本次连通证据。Codex 内置生图也消耗订阅包含的用量，并非无限免费。PNG/透明度检查不是美术或部件语义通过；生成后仍需人工审核。生图不改变 Spine draw order、骨骼或当前预览。

当前导入已删除原附件 alpha 相乘；使用有效主体的实验定位，拒绝不透明模型图。新的头发/裙层通过全身导出脚本装配。生成、导入或播放成功均不代表美术合格，当前自动语义审核尚未实现。

## Grok

使用官方 `/v1/images/edits`，application/json，images 数组中的 data URI；不把 OpenAI 的 multipart 接口原样套用。请求 b64_json；如返回媒体URL，仅接受已列入白名单的供应商 HTTPS 媒体域名和公开IP，不发送 API bearer 给下载域名，不跟随跳转。新媒体域名应另行审查后增加允许列表。

官方 API 文档要求 API key 并按 API 用量计费；当前查阅的订阅资料不足以证明用户的 Grok/X 网页订阅会抵扣 Imagine API。本轮未核验用户的 API Console 权益，保持 UNVERIFIED。参考：[编辑请求协议](https://docs.x.ai/developers/model-capabilities/images/editing)、[多参考图协议](https://docs.x.ai/developers/model-capabilities/images/multi-image-editing)、[图片API](https://docs.x.ai/developers/model-capabilities/images/generation)。

## ComfyUI

目前未连接真实 ComfyUI。适配器只允许本机 loopback HTTP 服务，默认 `http://127.0.0.1:8188`。使用已有可工作的 API 格式 workflow JSON，保存在 `runtime/secrets/comfy-workflow.json`；不能使用网页UI节点图格式，也不会自动安装模型/节点。

在 providers.json 的 comfyui 中绑定：prompt_node、prompt_input 指向提示词节点输入；image_bindings 按原始角色照片、中性画布锚点图、固定头/耳、Harri 部件、Davide/Spineboy 原部件风格板的顺序绑定五个 LoadImage 节点的 node/input；它们必须与每次请求中五张图的顺序一致。头发任务的两个风格图是身体素材，不是旧头发。output_node 选输出一个图片的保存节点。节点 ID 和字段必须真实存在；未配置时预检报告工作流/绑定缺失。

流程为 POST /upload/image → 注入返回文件名和提示词 → POST /prompt → 有限次 GET /history/{prompt_id} → GET /view。prompt_id 在排队成功后持久保存；超时不重新排队，不调用全局 interrupt 影响其他任务。poll_seconds 与 max_polls 控制等待；更完整任务恢复留到里程碑6。工作流可能含有第三方付费节点，本机地址本身不能证明零费用，使用者须自行确认工作流。参考：[ComfyUI官方服务协议](https://docs.comfy.org/development/comfyui-server/comms_routes)。

## 错误与验证范围

HTTP认证/限流/服务错误只保留状态码，不显示原始响应或凭据。云端提交均无自动重试；超时可能已经产生费用，报告 FAILED_OR_RESULT_UNKNOWN_NO_RETRY。原图和已完成候选保留。模拟测试仅验证协议、错误处理与数据流；实际供应商权限、模型支持、费用、效果和Comfy节点均需后续实机确认。

## 本轮实际核验（2026-11-01）

单张 BODY_FRONT 已经由工具的 Codex 订阅适配返回透明 PNG（1063×1480），保存为 GENERATED_AWAITING_MANUAL_REVIEW。此前单张 ARM_FRONT 输出被服务审核拒绝，未回退 API。证据见 docs/evidence/M04-SUBSCRIPTION.md。当前测试的两次预留已用满 max_live_calls=2；继续点击生成前需自行在本机配置提高次数上限（最大18），保留旧预留记录。不能删除记录来冒充未消耗。

## 当前照片到素材流程

参见 CHAT_VALIDATED_FLOW.md，版本以 runtime/versions.toml 的 workflow.revision 为准。网页可分别选择编号原照片；三张照片对应三位角色。标准腕是显式配色入口，保留alpha/勾线结构并分别染深袖色与深肉色边线，AI调用0，不受订阅请求上限控制；无需再尝试通过模型审核得到同一长筒手臂。可选 SKIRT_FRONT/BACK 使用 EriKari 结构参考，需全身导出脚本整合，而非旧八部件单层导入。

导入模型图时默认清理低透明杂点并按有效主体等比底端定位，不再乘原附件 alpha。完全不透明输出拒绝导入。新发型的独立 region 与裙骨骼启用由 assemble_chat_character.py 管理，三个聊天样例的重放与该脚本输出一致。现行源流程不保证任意照片无需人工审查。

共享设计模式使用design_id绑定part_request，配色/原照片/说明不得任意覆盖；预检、实际job和完整人物绑定核对同一prompt/参考哈希。独立裙与单件生成job现通过共享全身入口集成，不再依赖手工复制。当前契约及CLI/网页操作见SHARED_CHARACTER_FLOW.md；旧比较模式仍保留用于历史实验。
