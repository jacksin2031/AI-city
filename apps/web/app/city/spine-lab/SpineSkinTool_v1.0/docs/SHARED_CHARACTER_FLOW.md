# M04共享设计书与全身装配

当前实现：M04-06、M04-07。版本从 runtime/versions.toml 读取：design_schema、image_prompt_revision、workflow.revision、orientation_revision。设计书仍是实验配置；M04手填设计与M07照片分析生成的设计都必须通过同一验证器，均不代表生产规格。

## 唯一契约

代码入口为 src/spine_skin_tool/design.py；严格拒绝未知键/缺字段、非有限数值及不一致的裤腿配色。可重复使用的无私人数据输入见 fixtures/synthetic/shared-design/，其中照片仅为纯色色块，不能作为美术黄金样例。

| 字段 | 内容与限制 |
|---|---|
| schema_version / character_id | 版本来自runtime；管理名只允许字母数字、下划线和短横线，不是人物身份推断 |
| photo | 原 character-reference*.png 文件名和原始文件SHA-256；每次加载/请求/构建重新核对，不能指向候选图、外部路径、symlink/junction或secrets |
| observed | hair、upper、lower三段照片可见事实；不可见留空，不把自由设计写成照片事实 |
| appearance | hair、torso、lower、sleeve、leg、shoe各自description/color/basis；basis为PHOTO、FREE_DESIGN、USER；PHOTO必须有对应可见事实 |
| lower / sleeve | lower附kind=pants或skirt；裤装lower与leg颜色必须一致；sleeve附0～1的fraction，拒绝布尔值/NaN/无穷值 |
| skin_color / outline_policy | 固定复用头部的协调肤色；MATERIAL_RELATIVE，袖线与肉色线分别处理，不按照片人种推断属性 |
| style | Harri仅负责结构，Davide/Spineboy负责绘画处理，固定角色职责，不复制原角色发型/身份 |
| layout | front_width、back_width、top，独立记录Spine单位的实验几何；可编辑校准，不局限3个初值；不是16.5cm或自动拟合结论 |
| production_approved | 必须false |

事实/设计内容须由人或M07照片分析填写，见CHARACTER_PIPELINE.md；真实新照片分析本轮尚未验收。当前校验结构、枚举、来源声明、数值与确定性配色冲突，不能从文字语义自动发现所有错误或验证照片描述真实性；这属于M05/M07，不得冒充已实现。

冻结把规范化设计、流程/提示词/母版版本一起计算design_id，存于忽略的 runtime/work/M04/character-flow/designs/。再次冻结相同内容返回同ID；任何配色/袖长/来源/几何变动生成新ID，旧设计不覆盖。照片或版本变化、记录被篡改时拒绝复用。

## 共享逐件请求与生成

part_description只提取目标层相关字段：BODY不拼入袖/鞋说明，LEG拼入腿色和鞋，裙只取lower，发只取hair。part_request统一调用build_part_prompt，标准腕为确定性配色请求。前后发/身/腿6个生图部件+2标准腕；裙装再加独立前/后裙，总8或10层。

prepare_requests将完整提示词、每件prompt_sha256、原照片/中性画布/固定头模画风肤色与适配/原结构/风格图及其哈希、模板哈希和plan_id存入私有plans目录。每次原照片+原参考，不回传生成图；标准腕记录原Harri哈希和0模型调用。重复请求验证已有记录与参考文件，拒绝被篡改的计划。预检/保存计划不调用模型。

网页部位生成在“使用共通设计”下发送design_id，由后端读取共享请求；忽略额外自由描述并不是允许覆盖：非空冲突描述、其他照片或不同腕配色会明确拒绝。生成job记录设计/提示词/实际参考/图片哈希。绑定时逐一核对这些字段和保存的参考原件。已绑定设计的job不能走旧单层模板导入，必须通过完整人物装配。

## 同一全身核心

character_service.dispatch为HTTP与CLI共同操作入口，character_flow.assemble_character管理校验/快照/标准腕/事务式交付；character.assemble_raw保存唯一的几何与部件处理实现。旧assemble_chat_character.py、prepare_hair_template.py仅兼容包装，算法不再留在scripts或聊天私有脚本。

输入可为大写部位名.png的原稿目录，也可逐件绑定 {file: runtime/work/...png} 或 {job_id: job-...}；目录输入可再叠加单层job/file替换。外部原稿标签为IMPORTED_IMAGE_ORIGIN_UNVERIFIED，不伪称工具已真实生成；生成job须满足当前冻结设计。腕始终由设计书在本地配色，0模型。

所有必需生图层齐全后才装配，禁止secret/外部路径和母版目录重叠，避免递归复制。先复制原稿快照，再共用prepare_texture：主体有效alpha测量、实验弱透明清理、等比定位；标准腕alpha逐像素保留；头发独立region，裙启用原EriKari骨骼/权重。保留原骨骼/IK/头模/五官表情/动作曲线。方向规则为正侧身<腕、背腕<身裙；010流程原耳所有状态隐藏，小耳夹在头发中一起生成。旧包按保存的朝向政策回放。

构建先在私有新暂存目录完成校验，再发布至新的输出目录；已有输出拒绝覆盖。失败不激活新人物，不替换当前最佳包。交付包含raw快照、design.json、export/source、parts、bundle、assembly.json及runtime.zip。Runtime ZIP不包含原照片或完整私人设计书；flow-manifest仅记哈希/版本/来源。

网页预览绑定各自运行包的/character-view/<ZIP哈希>/地址；多角色切换不会从可变“当前素材”地址拼读资源。该地址注册在当前预览进程中；重启后导出仍在，原character-view不宣称链接跨进程恢复；M06已为返修任务实现独立repair-view持久固定包链接，M07统一浏览入口。

## 使用

工具根目录，使用runtime/python/.venv/Scripts/python.exe：

```powershell
python -B scripts/character.py draft --photo character-reference1.png --id my-character --preset short --output runtime/work/my-character/design-input.json
# 编辑设计书：该输入例不是照片自动分析
python -B scripts/character.py freeze --input runtime/work/my-character/design-input.json
python -B scripts/character.py requests --design <返回的design_id>
python -B scripts/character.py assemble --design <design_id> --raw runtime/work/my-character/raw --output runtime/work/my-character/build-001
# 可增加 --bindings runtime/work/my-character/replacements.json 来替换目标层
```

网页启动沿用start_trials.py，在/trials的“共通設計書と全身構築”编辑/读取/冻结设计、保存指令、选择原稿目录/绑定作业并全身构建。原单部件生成也使用冻结设计。旧比较模式需明确取消使用共享设计，仅供历史锚点/遮罩实验，不能代替当前全身流程。

## 已验收与未实现

三套已有素材经CLI/网页生成的JSON/atlas/全部PNG、包内其他文件和ZIP逐字节一致；同素材新核心与之前人工检查过的骨架/图集/贴图一致。真实Runtime动作、耳/方向规则、缺件保留旧包、Host/Origin/私有路径、请求计划与job绑定边界均有本轮证据。

M04单独入口不包含M07自动设计和整套调度；这两项由pipeline_service实现，实际新生图闭环见CHARACTER_PIPELINE.md和evidence/M07-LIVE.md。不包含自动语义放行（M05受控校准已完成，但任意照片可靠性未验证，自动PASS关闭；见REVIEW_PIPELINE.md）、任意发型的保证性拟合（M07为alpha技术试配）或生产尺寸批准。不能把技术重放通过称为任意照片一键美术合格。完整共享核心证据见evidence/M04-SHARED-FLOW.md。


## M06返修绑定扩展

repair_requests从冻结设计及已知规范缺陷代码产生不可变提示词；generation仅在持久任务内已预留的job_id/part/request绑定下执行，不能用任意repair_request_id绕过预算。character_flow核验新的prompt SHA和五张原参考，记录repair_request_id，仍调用唯一character.py装配。只有上一候选的未修改素材可作为装配基底，绝不进入下一次模型参考。修复与恢复入口见REPAIR_PIPELINE.md，首次整套调度仍属M07。


M07对同一assemble_character增加auto_fit选项：生成独立hair-fit.json并绑定原稿/头模SHA；M05重新计算验证其几何，M06替换时沿用同一试配。默认旧调用auto_fit=false，所以既有固定素材/手调layout的ZIP保持逐字节一致。当前/character-view历史内存链接不追认持久；新统一任务使用/flow-view/<id>/<manifest SHA>/持久恢复。

保存来源回放和M06候选绑定统一调用bindings_from_source，验证原设计、raw、flow/build manifest及生成job，保留原job_id/flow_id/repair_request_id和几何试配来源；不能把已生成件改成不明导入，也不能把图片复制到新目录冒充本轮生图。标准腕002始终保留半圆手肤色，即使fraction=1；当前设计只有共用左右袖色/袖长，photo-design-002不承诺异袖输出。

head-alpha-fit-002只让后发独立对齐原头模，不再与含侧发饰的正面总宽/顶部绑定；新增back_top仅用于拟合输出，不改变冻结设计三字段契约。旧001计算保留，make/validate按记录修订复算，回放和返修继承来源拟合修订；原样ZIP保持兼容。所有PNG和非skin骨架字段不变，实际对照见evidence/M07-LIVE.md。

## 用户补充：只改纹路/图案的三次受控编辑

参见TEXTURE_ONLY_EDIT_POLICY.md与evidence/M07-TEXTURE-ONLY.md。用户允许把固定新角色基础PNG作为编辑目标，最多3次；每次回到同一基础，不能连续编辑上次结果。原照片仍保留，配色设计、轮廓/比例/位置/部件和Spine规范不改。此前“禁止生成素材回传”对新素材生成继续适用，此处为用户明确授权的例外。

当前约束/预留/只读检查由texture_edit.py实现，复用repair_store的texture命名空间。试验用聊天内建ImageGen，尚未接入网页一键修改。前后发各3次均未通过结构锁定，未装配为新角色/不冒称全身验收。不能失败后自动改用原照片重生或固定限色来绕过三次上限；达到上限先报告用户。

## 010头发与小耳流程

新生成使用head-alpha-fit-003，前发覆盖代理扩展到侧脸，仍只允许整体等比缩放；比例是否鼓胀必须实际视觉检查，不能以覆盖数值代替。新装配设置INTEGRATED_SMALL_EARS_IN_HAIR，每次动画更新隐藏原耳。frame_issues按包中耳政策区分新流程/历史回放；集成耳不再用旧ear槽差分当可见性结论，视觉审核接收实际246帧原耳隐藏记录。旧轮廓IoU/边界变化不拒收。
