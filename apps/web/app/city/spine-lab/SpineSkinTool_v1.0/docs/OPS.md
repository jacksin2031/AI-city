> 2026-11-05当前发布修订：原始参考工程/贴图与固定运行母版已随references/spine按SHA清单和原许可证收录，默认直接读取，限定仅参考/非商用。下文旧源码包“不含原参考”的描述仅为历史；照片、生成角色、凭据和会话仍排除。正常启动用根启动工具.cmd，复用本人GPT登录并准备本地开关。

# 本地安装、备份、恢复与交付

开发工具尚未获生产批准，验收入口 `/acceptance`，实测范围见 `evidence/M08.md`。代码测试、同机隔离安装和干净Windows安装是不同证据，不能互相替代。

## 安装与启动

在工具根目录执行 `python -B scripts/bootstrap.py --install`：使用已有锁定工具和离线缓存，不联网补包，不运行依赖安装脚本。缺少对应Python、uv、Node、pnpm或缓存时明确失败。`doctor.py --json` 返回 LOCAL_ENVIRONMENT_READY 只表示基础环境正确；`--production`仍拒绝未完成门禁。

开发源码ZIP不含Python/Node/Edge/Codex CLI、依赖安装物、缓存或原参考素材。Codex CLI使用本机已有ChatGPT登录，不复制账户令牌或API key。新环境的模型配置默认关闭；按 GENERATORS.md、CHARACTER_PIPELINE.md 显式配置后才可真实调用。

固定模板仍需要工具旁的 `library/Chibi-Stickers-4.3` 和原模板，路径由mother.py及模板清单核验。需从自己有权使用的安装资料单独配置；未将许可未知的原素材随源码ZIP再分发。素材缺失时不能声称可完整启动。Spine Editor不打包，运行包也不是原生.spine工程。

配置齐全后用本地虚拟环境解释器运行 `scripts/start_trials.py --port 8783`，只监听loopback。

## 开发源码包

```powershell
& ./runtime/python/.venv/Scripts/python.exe -B scripts/maintenance.py source --output runtime/output/M08/source.zip
& ./runtime/python/.venv/Scripts/python.exe -B scripts/maintenance.py verify --archive runtime/output/M08/source.zip
```

明确白名单排除照片、密钥、本机覆盖配置、任务/输出、依赖物及原参考贴图；内部变更日志、任务卡和验收历史也不进入此开发包。包内有逐文件SHA清单。这不是带齐运行组件与授权素材的安装器，也不是生产发布。

唯一图片例外是共享设计测试必需的24×32纯色色块：固定路径、固定SHA白名单，文件被替换会拒绝打包。它不是真人照片，也不代表造型或模型成功。

## 私人备份与恢复

```powershell
& ./runtime/python/.venv/Scripts/python.exe -B scripts/maintenance.py backup --output runtime/output/M08/private-backup.zip
& ./runtime/python/.venv/Scripts/python.exe -B scripts/maintenance.py restore --archive runtime/output/M08/private-backup.zip --source-archive runtime/output/M08/source.zip --destination runtime/output/M08/restores/recovered-001
```

私人包包含work/data/output中的原照片、任务、素材、原始响应及模型预留，不能分享。普通工作文件（包括隐藏文件）保留；secrets、账户令牌、机器环境、cache/logs、运行锁/owner投影和M08维护输出不备份；原模板library须单独保管。不可读取的目录会使备份失败，不当成空目录略过。可组合源码包和私人包恢复，二者版本须一致且文件不能重叠；目标必须全新，不覆盖现有数据。

备份取得现有任务锁并前后核对清单。忙碌或源变化时拒绝发布；备份前停止提交新任务，尤其不要并发使用经典单件生图接口。未知结果也保留预留，不清零假装未调用。

恢复先验证路径、大小、哈希、ZIP类型，再逐文件写入暂存新目录复验。坏包、穿越、Windows设备名、大小写重名、链接、空间不足均停止；中断留下 `.incomplete-*` 供检查，不合并后续恢复。回执明确禁止自动继续真实生成。重新配置原素材、账号和全部历史预留，确认原任务状态后再显式恢复；未知外部结果不自动重发。

当前持久化为追加事件链；不宣称实现SQLite热备。如果以后加入数据库，需另做事务一致性备份。私用包也不是完整系统镜像。

## 卸载与保留

本轮不提供对原工作区的自动删除。退出服务后可另行移除运行组件，但须保留work/data/output和私人备份。源码包不修改全局软件；不要递归清空工具或父spine-lab。干净Windows完整安装/卸载、实停电和物理磁盘写满仍单独待验，不能用注入故障替代。

## 回归与盲测

`maintenance.py regression` 执行现有unittest，保存源码指纹及逐测试结果。固定素材的 `validate_pipeline.py --source <角色路径>` 沿用统一核心，实收各246帧、1/2/4倍且不调用模型，再用 `maintenance.py equivalence --results <私有结果JSON>` 复核；它不等同于未见照片盲测。

先通过现有照片导入入口加入自己授权的新图，规范文件形如 `{"cases":[{"photo":"character-reference4.png","tags":["long_hair","partial_photo"]}]}`。`maintenance.py blind-register --spec <本机JSON>` 只冻结批次、创建待执行任务，不发模型。项目既有生图/设计记录及跨批次预留用于去重；改文件名或无损重存相同像素不能充当新样本。这不能证明照片未在模型训练中出现，也不能识别所有近似/裁剪重复，需提供者如实选择未调试照片。

按需显式执行 `maintenance.py blind-run --id <blind-ID> --case 1 --execute-live`，仍由pipeline_service和既有订阅通道完成，预算/最多3次返修/未知停止规则照旧，不新增API或另一套模型流程。`blind-report`给出各件请求数、实际返回、待审/失败、可观测时长及服务提供的用量；没有就留空，不推断免费或余额。误放行/漏报率在没有独立正误标签时为null，不填0。进程中断的计时未知和外部结果未知分别保留。

独立参照可用 `blind-adjudicate --id <blind-ID> --case 1 --labels <本机JSON> --human-confirmed` 登记。JSON为 `{"labels":[{"manifest_sha256":"完整候选SHA","category":"hair_fit","expected":"FAIL"}]}`。只能由操作者明确提供，不让AI把自己的判断当正解；本轮没有为真实照片生成或假填这些标签。标签绑定精确候选、审核报告SHA、规范与源码；只取最新CODEX辅助意见，不用后来的人工作为模型预测。报告变化后旧标签失效，重新登记另存；同一输入重复导入不会重复计数，冲突不能静默覆盖。

这里的补助误许可是“参照FAIL且模型PASS / 已标参照的模型PASS”，漏报是“参照FAIL且模型PASS / 已标参照的FAIL”，误拒是“参照PASS且模型FAIL / 已标参照的模型FAIL”。仅对明确PASS/FAIL单项计算；UNKNOWN/不适用不强判，分母0仍为null。这些不是整人物最终放行率，完整角色的独立验收和多样性盲测仍需实际数据。

外部条件可用 `attest --kind <blind_photos/clean_windows/physical_faults/license/dimensions/m07_quality> --evidence <runtime/work/M08或output/M08内文件> --statement <本机操作者说明> --human-confirmed` 固定依据。记录是用户申告，显示USER_ATTESTED，与机器PASS分开；修改文件或源码使其过期。它不是公开后端授权凭证，也不自动开启生产/模型开关。本轮仅用合成数据测试此接口，没有替用户申告任何未做的实机或许可验收。

## 交付门禁

代码/规范指纹及证据SHA变化后需重验。页面只读，不触发生图、备份、恢复。源码和本机数据恢复通过也不开生产门禁：跨照片全身质量、M07前提、干净机器、真实故障、原素材许可和生产尺寸仍须相应证据与用户批准。

## 原照与全身候选本地对照

用户明确要求展示的批次可打开`/blind-trials?batch=<blind-ID>`。照片仅从已登记批次的固定SHA读取，左图是实际输入的PNG，右侧通过manifest固定对应运行包，可选已有轮次，未组装时不显示替代人物。原照保存在忽略的runtime/work；来源/作者/许可由photo-sources.json绑定原照SHA，本地陈列不是重新分发许可。

代码变更后的历史批次可只读浏览，页面标出保存时源码；`blind-report --id <ID> --archived-read-only`读取归档统计。照片/候选SHA仍必须有效。`blind-run`与人工标签登记继续要求原源码指纹，不能用归档阅读开关重发或假称现行版新验证。没有自动把人工观感变为正解标签或生产批准。
