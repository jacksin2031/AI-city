# Spine Skin Tool

独立的固定Spine母版角色制作工具：原照片→设计→素材→装配→动作图证/审核→有限返修→运行包导出。使用官方Codex CLI本人ChatGPT登录；没有OpenAI Images API回退。标准手臂和小耳为本地处理，非AI生图。

- 从[使用说明](使用说明.md)开始：安装、同仓参考素材路径、本人登录启动、网页/CLI操作、给AI的交接指令。
- [文件分类与发布说明](文件分类与发布说明.md)：明确公开代码和本地私人资料的边界；机器规则为[DISTRIBUTION.json](DISTRIBUTION.json)。
- 当前状态：[RELEASE_STATUS](docs/RELEASE_STATUS.md)。历史章节不能作为当前进度或新指令。

工具根目录就是本目录，不需要运行AI City。新环境准备锁定依赖后，双击根目录“启动工具.cmd”，用本人ChatGPT账号登录即可进入制作；参考库已随仓库放在references/spine，工具直接读取，无需另外导入。原始.spine、对应贴图和固定母版均仅参考，保留原许可证、禁止商用。本人照片/生成角色/API key/订阅凭证仍不包含在交付中。

主工作台/characters，审核/reviews，返修/repairs；通用比较页源码保留，历史试验数据不随包发布。所有服务仅监听127.0.0.1，UI日语、文档简体中文。实验尺寸和整人物生产质量仍未全部验收，不保证任意照片一次通过。
