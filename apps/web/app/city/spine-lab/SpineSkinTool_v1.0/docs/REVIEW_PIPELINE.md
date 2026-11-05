# M05 审核入口与报告契约

状态：COMPLETE（固定母版审核/证据/规范对照校准范围）。Owner B，2026-11-02。当前quality-mvp-004、review schema 1.0.0；M05-05在003的48视觉+24 Runtime目标级对照已实测，包括c02/c03留出，004增加几何/方向守卫硬检查。生产批准和自动视觉PASS仍false，不能外推自然失败或整角色美术；详见REVIEW_CALIBRATION.md。审核不会重新生成或修改角色，返修另见REPAIR_PIPELINE.md。

## 网页和 CLI 共用入口

启动 `runtime/python/.venv/Scripts/python.exe -B scripts/start_trials.py --port 8783`，打开 `/reviews`。选择完整人物输出目录，创建审核后先进行本地硬检查，再收集动作证据。界面为日语；原照片、设计书、审查图和模型原始输出全部保存在被忽略的 runtime/work/M05，不进入 Git。

```powershell
& ./runtime/python/.venv/Scripts/python.exe -B scripts/review.py create --character runtime/work/my-character/build-001
& ./runtime/python/.venv/Scripts/python.exe -B scripts/review.py capture --review <review-id>
& ./runtime/python/.venv/Scripts/python.exe -B scripts/review.py report --review <review-id>
# 只保存输入，调用模型 0 次；网页也有同一入口
& ./runtime/python/.venv/Scripts/python.exe -B scripts/review.py request --review <review-id>
# 把私有 JSON 结果与证据校验后导入；手动结果与模型结果必须如实区分
& ./runtime/python/.venv/Scripts/python.exe -B scripts/review.py import --review <review-id> --input runtime/work/review-result.json --source HUMAN
```

`review_service.dispatch` 是 HTTP/CLI 唯一操作入口；review.py 检查/聚合，review_render.py 采样/度量，review_visual.py 校验和订阅视觉辅助。创建审核绑定冻结设计、原照片、原稿、整个 bundle 和政策 SHA；后续这些来源改变即过期，不能用旧证据继续判定。新的生成候选必须新建审核。固定 Runtime 图证绑定截图、mask、帧清单及渲染器哈希，外部模型不能提供凭空的帧 ID 或替换其他候选结果。

## 本地检查与图证

检查原稿/导出缺件、空白、不透明背景、低 alpha 离群；记录有效 alpha bbox。重新调用共享 prepare_texture 比对导出画布与 RGBA，不重新实现另一套缩放；标准腕同时与冻结设计的 Harri 确定性配色逐像素比较，能检测皮肤漏线。固定头模/耳/表情、骨骼/IK/约束、动作曲线和原 atlas 页与母版核对。裤色距离与杂点是实验提示，UNKNOWN 不能当作 PASS。

每位角色实际输出 1×/2×/4× 三套图集变体，相机及世界几何不变；不是只把一张截图插值放大。每倍率 82 帧、合计 246 帧：四向 idle/trot 各 5 时点；wave/just-right 各四向 3 时点；背→正/左/右及返回背的即时、混合中、结束帧。没有宣称源工程不存在的 walk/run/talk 已验收。倍率只代表实验输出，16.5cm 和生产尺寸仍未批准。

1× 每帧保存头、发、腿、衣身/裙、左右耳及分别去耳的实际 Runtime mask，共 82 组；记录头顶/后脑覆盖、腿根接合与去耳前后像素差。附件存在但完全被发挡住应待审，不等同于缺耳；允许自然遮挡，不能用单个像素阈值批准发型。裙层保留全部 trot 图证，是否穿插仍属视觉判定。生成全身、头部和衣身/肩/腿根近景及孤立部件联系图，所有图证可追溯到实际帧。

渲染报告 PASS 仅指确定的结构/播放规则通过；其中 UNKNOWN 提示和美术语义仍未解决。采样不能保证连续时间内每个瞬间都正确。

## 结构化视觉辅助和订阅配置

参考官方 [CLI 参数](https://learn.chatgpt.com/docs/cli/reference) 与 [图片输入](https://learn.chatgpt.com/docs/image-inputs)。沿用现有官方 Codex CLI，以 ChatGPT 登录；独立视觉入口使用 `exec --image`、`--output-schema`、`--output-last-message`，read-only、临时会话、忽略用户配置和项目指令，关闭生图，无付费 API 回退。它审核图证，不是调用图片生成服务。

从 `runtime/config/review.example.json` 复制到被忽略的 `runtime/secrets/review.json`。默认 `live_enabled=false`、`upload_consent=false`；真实运行必须两者 true。`max_live_calls` 为本机试验的总预留次数（1～10），不是订阅余额。默认上限 1；timeout_seconds 60～1200。此文件不需要 API key。示例不含个人信息。

网页或 `scripts/review.py vision --review <id>` 才主动发送。真实执行另存不可覆盖的visual-submitted-request.json和SHA，后续保存输入预览不覆盖该快照。发送前持久预留一次；超时/输出非法仍计入预留，不能自动重试、释放名额或切 API。一个审核只有一次真实模型执行，其他结果可明确标注来源后导入。若服务已经返回 JSON 而只是解析格式不符，可以严格核验原始结果并本地重解析，不能再次请求冒充同一次调用。当前这台机器的一次试验上限已用完，按钮会禁用；工具不读取或保证订阅余额。服务响应、stderr、事件流只保存在私有工作目录，不经 artifact 路由公开。

视觉类别固定为 hair_fit、hair_consistency、style、garment_parts、material_outlines、ear_visibility、leg_connections、skirt_occlusion，各恰好一次。缺陷必须有部位、朝向、帧、严重性、置信度和可选归一化框。置信度下限0.9为实验门槛，本次有限对照已实测，但不是概率校准；漏检/低置信/不可见/服务错误为待审。仅裤装可让裙检查 N/A。审核图片允许含原照片、原参考与候选图，但这些候选图永远不能进入后续生图输入。

联系图只是采样证据，不是模型已逐帧看完 246 帧。带 `near-head:帧编号` 的引用仅在已哈希 sheets.json 确实包含该帧时规范化；原结果保留 SHA。模型框可能错误地相对联系图，当前一律 `repair_coordinates_verified=false`、`coordinate_space=ADVISORY_UNVERIFIED`。**M06 不能直接按该框裁图或修改资产，必须另行核实坐标和原因。**

## 判定与 M06 交接

硬规则/Runtime 确定失败→FAIL；高置信模型缺陷可阻止放行，但不代表用户已认可此美术判例。任何历史 HUMAN 不合格或人工缺陷均不能被后来模型 PASS 覆盖。硬检查 UNKNOWN、漏项、故障、未执行或模型 PASS→REQUIRES_REVIEW；目前只有全部可核验项通过且完整人工审核通过，才可记录实验人工 PASS，仍非生产批准。不提供“一键全通过”。

`report.json` 保存 hard/render/visual_reviews/visual_call/status、设计与政策版本；图证 manifest 保存源包和逐帧哈希。缺陷携带 code/part/direction/frame_id/severity/confidence，M06据此区分确定性错误和内容重生。原包不被审核覆盖；有限返修和持久恢复已在M06实现，见REPAIR_PIPELINE.md。已返回的组合部位仅当为已知同族前后件时保守归CHARACTER，并记录原值/响应SHA，不能擅自扩展重生目标；新请求schema限定单部位，未知组合拒收。返回结果可本地恢复解析，不重新调用视觉服务。

## 校准边界

review_calibration.py 提供可复现的 38 个合成规则对照，覆盖标准腕皮肤漏线、非背耳隐藏/背耳误显、背腕错层、转向丢发和正确对照。留出集更换配色/袖长，不是未见真人美术盲测。该38例错误计数仅为规则回归结果；后续M05-05另有48视觉+24真实Runtime对照和两角色留出实测，见REVIEW_CALIBRATION.md。现行规范是判据，不要求重复批准；目标级正例不称为全人物黄金成品，小样本仍不能外推自然失败，所以自动视觉PASS保持关闭。证据和已知失败详见 [M05 验收记录](evidence/M05.md)。
