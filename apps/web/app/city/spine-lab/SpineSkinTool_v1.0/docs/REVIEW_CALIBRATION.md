# M05-05：依现行规范校准审核

状态：COMPLETE（规范对照与留出实测范围），2026-11-02，Owner B。审核依据是用户已经确定的制作规范，不再以重新批准画风/部件条款为前置条件。质量政策 quality-mvp-003，规则 review-criteria-001，常规审核提示词 review-prompt-003，校准提示词 calibration-prompt-001。生产批准和自动视觉 PASS 仍为 false。

## 标准与标签

runtime/config/review-criteria.json把QUALITY与TEXTURE_CONSTRUCTION_BASELINE中的规则整理为模型可直接读取的条款，保留文档、章节和运行时文档SHA。常规审核与校准请求共用这些规则，官方Codex订阅视觉传输也共用execute_review_request；不是只在聊天里写一份提示词。

Harri定义部件结构；Davide/Spineboy定义简化线稿、色块与阴影处理；真人原照片定义新角色身份/设计。测试覆盖头发裂缝、头框覆盖、前后体积、手臂勾线、长筒比例、衣身肩角、密噪、裤色，以及裙装的腿根/侧边遮挡；实际Runtime另测非背耳丢显、背耳误显、背腕错层、当前发附件丢失。

正例只表示**指定条款**符合规范，不是该角色的整体黄金成品。例如头发体积符合，不代表头发画风已经合格。负例是测试副本里注入的明确违规，图像处理代码仅用于受控缺陷fixture，绝不修改原照片/现有候选，也不进入制作或返修流程。裙装测试同时去掉遮住问题的衣身下层，确保真实暴露腿根；不能仅凭修改了裙PNG就假定画面一定违规。

## 真实运行结果

正式测试：bench-fe687b1a0a7740d7b65ef207d62af01b，benchmark_hash `f342d6a30244490031ffe860003bd1d5159d250a9fb0fe656494f0bf12930c0b`。私有manifest在发送前冻结规则、来源、目标标签、随机顺序、帧和图像哈希。标签/变异名/角色ID/集合信息不发给模型，图片使用随机case ID。模型会话临时、只读、禁止工具；事件中若出现命令/搜索/MCP/改文件/生图工具则拒收结果。

| 集合 | 检查 | 例数 | 检出违规 TP | 正确正常 TN | 误报 FP | 漏报 FN | 未确认/低置信 |
|---|---|---:|---:|---:|---:|---:|---:|
| 开发 c01 | 真实Runtime | 8 | 4 | 4 | 0 | 0 | 0 |
| 开发 c01 | 订阅视觉 | 16 | 8 | 8 | 0 | 0 | 0 |
| 留出 c02/c03 | 真实Runtime | 16 | 8 | 8 | 0 | 0 | 0 |
| 留出 c02/c03 | 订阅视觉 | 32 | 16 | 16 | 0 | 0 | 0 |

共72例、120张实际Runtime帧；6次真实订阅视觉请求，每次8个视觉样例；没有重新生图、没有付费API、没有重试。原照片未发送给本轮模型，参考图中照片面板明确去除，照片身份不是本次目标。视觉最低置信0.94，冻结门槛0.9；原始统计、门槛后统计与开发集0.5/0.75/0.9比较均保留，未按留出结果调门槛。c02/c03不进入开发集合；所有6批使用同一份已冻结提示词，没有看留出答案后改词再跑。

这里的留出是本轮开发集未使用的两个既有角色，不是新照片重新生图。72个结果在本受控样例范围全部符合标准，不能据此声称任意自然失败均能识别、没有误判概率或连续动作全程通过。头发细微画风漂移、照片身份一致性、自然遮耳等边界没有被这批明显缺陷穷尽。

## 工具操作

工具根目录，使用runtime/python/.venv/Scripts/python.exe：

```powershell
python -B scripts/calibrate_review.py prepare
python -B scripts/calibrate_review.py request --benchmark <bench-id> --batch 0
python -B scripts/calibrate_review.py run --benchmark <bench-id> --batch 0
python -B scripts/calibrate_review.py run --benchmark <bench-id> --batch 1
# 开发两批终结后才允许留出批2～5；每批都必须显式run，没有自动循环调用
python -B scripts/calibrate_review.py run --benchmark <bench-id> --batch 2
python -B scripts/calibrate_review.py score --benchmark <bench-id>
```

prepare只在被忽略的runtime/work/M05/benchmarks中复制既有三包、注入fixture和真实渲染，0模型调用；正式候选不改变。request仅保存输入预览。run读取忽略的runtime/secrets/calibration.json（可从config/calibration.example.json复制）；默认关闭，当前这次按用户授权开启，累计上限6已用完。未来需显式调整累计预算才能再次实际运行，不删除预留、不重试超时、不切API；配置可设1～100，单套固定6批。订阅余额和实际CLI模型ID未验证。

call.json/不可覆盖的visual-submitted-request.json/原始响应/校验后结果各自保留，评分复核请求和响应SHA、证据、规则与样本集合；漏项、串样例、改图、改标签、改提示词、低置信和服务失败不会算正确。UNKNOWN与低置信单列，不能靠只报告已判对的案例抬高准确率。

启动现有start_trials.py后，打开 `/calibration`；可查看集合、混淆统计、全部对照图和模型日语解释。网页没有运行模型按钮，只读保存结果；图证路由仅允许manifest内的case PNG和去照片参考PNG，不公开fixture运行包、事件、配置或预期标签文件。

## 质量政策与后续工作

quality-mvp-003记录既定规范的权威性、本批范围/哈希/结果，保留0.9与所有图像实验阈值，不为通过盲测放宽。自动视觉PASS关闭：模型输出仍是辅助结果，未知不能放行、人工FAIL不被模型覆盖，模型坐标仍不可直接驱动裁剪。旧quality-mvp-002审核因政策哈希变化显示过期，不把历史结果追认成新政策通过。

M05-05的规范对照校准验收完成；无需用户重新决定已写入的标准。下一任务TASK-M06有限返修/预算/恢复。任意照片的一键可靠性、自然失败覆盖、更多角色/姿态/分辨率和生产尺寸需在后续全流程/M08扩展验收，不在本次小样本结果中冒充完成。真实记录见evidence/M05-05.md。
