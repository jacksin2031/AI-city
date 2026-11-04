# Spine Skin Tool：AI接手规则

本目录为独立工具根目录。先读使用说明.md、文件分类与发布说明.md、docs/RELEASE_STATUS.md；开发再读docs/CODEX_IMPLEMENTATION_SPEC.md第0章。不要把AI City当运行依赖。

## 当前制作依据

当前规则取docs/TEXTURE_CONSTRUCTION_BASELINE.md与docs/QUALITY.md最前面的014节，版本取runtime/versions.toml。提示词在共享代码，禁止自行另建一套；旧章节不覆盖当前规范。

- 原照片决定形象；Spine参考定义Q版构造/大致画风，不复制原发型。独立正背发/无肩衣身/腿；标准腕本地配色，两类勾线；碗形裤色下沿、独立裙及真实trot遮挡。
- 原头模/表情/骨骼/IK/动画保留。头发先贴合，侧颊留1～3%余量，下颌不强制盖发；只等比缩放/平移，禁止横向拉伸和裁切原轮廓。只审Q版大类与前后发一致，不苛求阴影细节。
- 原大耳槽始终隐藏；原照左右耳都明确发遮才HIDDEN，否则标准小耳对，冻结共同耳根和前后高度，每耳至少40%可辨。仅安排新增耳片遮挡，不移动/重画/重采样已确认头发。标准耳0模型调用，不伪称AI生成。
- 正面/侧面腿<衣身/裙<腕<头；背面腿<腕<衣身/裙<头；动画应用后恢复方向守卫。
- 一人物一持久模型会话，每件初次+最多3修；已有预留不重置。默认从原照+原参考生成，不链式改图；明确发鬓末端局部修正才可用同一冻结基底。结果未知先收取，不盲目重发。

## 环境、权限与发布

依赖仅放runtime并用锁文件。--online只显式下载锁定依赖，不升级全局工具。私用原画用scripts/reference_assets.py导入；不提交原画或个人盘符。本人执行codex login，工具只复用官方CLI登录，不读/复制auth.json，不代管登录凭证。

真实上传/调用默认关闭，必须用户授权才启用配置与任务开关；本次发布授权不是新生图授权。只绑定loopback；不提交照片、输出、API配置、订阅会话、CODEX_HOME或runtime私人目录。发布必须使用scripts/package_release.py白名单并核对Git暂存清单。

## 开发与证据

一任务一owner/分支，最小修改，UI日语、文档简体中文；不删除历史/预留伪造预算。不将JSON改名.spine冒充Editor工程，不将mock/246帧/模型PASS视为美术批准。网页/CLI共用pipeline_service、character_flow、character、review_service和repair状态机。不要修改AI City其他工作。

每批修改都写docs/changes/CHANGELOG.md及entries/<UTC>-<task>.json：真实时间、各文件SHA、符号/行号/实际片段、测试命令/结果/限制。sync_changelog.py后verify_changes.py；连续本地任务用--since-entry，提交用--base目标分支。历史不可改写。本机旧历史不随包公开，仓库初始导入记录覆盖公开文件，不能凭空引用私有证据。报告实际结果、剩余限制和可审查commit；提交/推送依用户指令。
