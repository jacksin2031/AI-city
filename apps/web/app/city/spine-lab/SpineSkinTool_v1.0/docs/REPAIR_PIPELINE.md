# M06 有限返修与持久恢复

Owner B，2026-11-02。状态：COMPLETE（作业级有限返修、保守比较及进程恢复范围）。repair schema 1.0.0、bounded-repair-001、quality-mvp-004；保留image-prompt-007/共享设计契约，自动美术PASS与生产批准仍关闭。不是任意照片一键生成，M07/M08尚未完成。

## 共用流程与入口

`repair_service.dispatch`是CLI/网页唯一入口；`repair.py`负责路由/阶段/比较，`repair_store.py`负责追加日志/原子投影/OS进程锁，`repair_requests.py`负责不可变返修请求。图像调用继续使用generation.generate与官方Codex订阅适配器，装配继续用character_flow.assemble_character，审核继续用M05；没有第二套提示词、图像处理器或模型API。默认外部调用关闭；网页创建计划不发送模型。

现有start_trials.py启动后打开 `/repairs`。只列出当前政策的来源审核；旧政策需要新建审核。操作为选择源审核、设每角色/部位/轮次/视觉上限、保存计划、推进一个完整周期或恢复、停止后续。每次推进最多一个周期，确定的质量拒绝会读取最新候选的缺陷，修改下一轮纠正条款后在预算内再推进；前一候选可作装配底稿，绝不作为生图参考。未知/未定位缺陷转待审。M07编排器可以调用相同入口，不需要聊天临时脚本。

```powershell
# 使用runtime/python/.venv/Scripts/python.exe；工作目录为工具根目录
python -B scripts/repair.py create --review <current-review-id>
python -B scripts/repair.py advance --id <repair-id>
python -B scripts/repair.py report --id <repair-id>
python -B scripts/repair.py cancel --id <repair-id>
# 可限定目标层；其余缺陷不会因此被判定通过
python -B scripts/repair.py create --review <id> --parts BODY_FRONT --options runtime/work/my-repair-limits.json
```

limits严格为max_cycles（1～3）、max_image_calls（1～18）、max_calls_per_part（1～3）、max_visual_calls（1～3）、live_generation/live_review布尔值。默认3轮/6图/每部件3次/3视觉，两个live为false，样例在runtime/config/repair.example.json。保存后任务设置只读，网页显示真实保存值；另建计划才能改变上限。外部调用还必须满足原providers.json/review.json的启用、上传、全局预算和ChatGPT登录，不绕过历史预留。本轮独立工具实测的全局图像池与常规视觉池均已达到3/3；这些数值不是订阅余额。

## 缺陷路由

| 情况 | 行为 |
|---|---|
| 标准腕颜色/勾线、导出画布/像素偏离共享处理 | 按固定设计重建/标准腕重新配色，不调用生图 |
| 已导出头发几何偏离冻结layout、旧方向守卫、耳/腕/发附件错显错层 | 共用完整装配器恢复设计/守卫，原骨骼/权重/动作曲线不改 |
| 明确定位且高置信的内容裂缝、覆盖形状、肩角、画风/密噪、裤色/裙摆等 | 原照片+原参考，从零生成目标部件，保持共享设计/配色 |
| 模型组合部位、低置信/未确认、纯覆盖提示 | 待审；不根据模型框裁图或随意移动/拉伸掩盖坏素材 |
| 设计/来源/骨骼/固定资产/包完整性异常 | 保留原包并待核查，不靠自动重生绕过完整性失败 |

M05新增LAYOUT_GEOMETRY_MISMATCH与ORIENTATION_GUARD_CHANGED：调用现有region/prepare_texture复算，与冻结设计比对，不另设几何算法；quality004版本化该扩展，其余阈值未放宽。旧003报告因政策变化过期而非覆写。

## 原照片重生与来源绑定

返修请求由已识别的规范code构造静态纠正条款，不把任意模型消息、bbox或图片当作执行指令。基础prompt/设计、部位、轮次、规范SHA、全文/SHA及请求ID写入不可覆盖的requests/request-<sha>.json。每次仍是原照片、无角色轮廓的画布锚点、固定头耳、原Harri结构、原Davide/Spineboy画风图。之前生成的PNG/噪点fixture/预览不进模型；它们仅作为装配的未替换部件和审核图证。

生成作业ID在发送前分配并落盘。generation验证任务已为该部位预留、ID/请求/设计相同，HTTP不能拿返修request ID绕过M06预算。完成作业进入全身装配时再次核对请求prompt SHA、五原参考及文件SHA、设计和输出SHA；普通单件流程不能随意接受带修改prompt的作业。标准腕始终由共用装配按设计生成，不占模型额度。

## 比较与最佳候选

每轮产生新的完整输出，原候选永不覆盖。通过硬检查后收集实际四向idle/trot、表情、转向混合与1/2/4倍率246帧；可选再做完整M05视觉辅助。硬失败不会跳过门槛假合格；服务失败和UNKNOWN不算通过。

确定性修复只有在非腕原稿不变、确认失败减少、没有新增确定失败且完整Runtime通过时，才更新“技术最佳候选”，仍标美术未批准。内容返修在没有完整可验证审核通过时保留原最佳，同时提供新候选对照。模型PASS不等于全身美术批准；历史人工FAIL不被覆盖。后来完成的有效完整人工审核可再次推进接纳该候选，无需重生或重收图证；不能仅把report.status手改PASS骗过门槛。

预览URL为 `/repair-view/<repair-id>/<manifest-sha>/`，绑定持久输出、重启后可重新载入，不依赖内存注册表。按包SHA缓存解析，每次读取仍核对文件SHA；不公开原照片、raw、context、events或secrets。返修不会激活/替换当前城市或素材试验工作台人物。最优、待审、已拒绝候选的含义分开记录。

## 恢复、预算与取消

阶段：PLAN→GENERATE→ASSEMBLE→CAPTURE→VISION→COMPARE→DONE。每个关键阶段先追加hash链事件，再原子写state投影；文件写入flush/fsync后替换。投影损坏可从事件重建，事件篡改/来源不一致则停止。Windows使用原生字节锁，POSIX使用flock；进程死亡由OS释放锁，避免PID复用或残留锁文件导致重跑。取消与最佳指针决策使用单独短锁。

- 生成返回后中断：查预分配job ID，复用已完成作业，不再生成。
- CLI已返回JSON/图片但父工作进程未收取：本地验证并收取返回文件，无新调用。
- 明确的本地配置/登录/全局额度拒绝且作业尚未创建：记录CONFIGURATION_BLOCKED，撤销本次未发送占位，配置修正后可继续同周期；不是退还已提交/未知请求的预算。
- 发送前后边界无法证明是否已经提交、或结果未返回：WAIT_RESULT，预算不释放且不自动重发。即使看不到作业文件也不假设免费重试；需核查外部状态/保留待审。
- 装配发布后中断：验证并复用该候选，不覆盖或重复生成。
- 本地渲染中断：保留旧图证/审核，另建审核重新采集，0模型；已经进入视觉发送阶段时不能这样重置来重发模型。
- 已返回视觉JSON：核对请求/证据/输出结构并本地恢复；缺结果保持待审。
- 明确服务拒绝/不可用：OUTPUT_BLOCKED，不静默重试、改API或规避服务拦截。
- 取消：保存标记，停止后续步骤和选择；不谎称撤回远端已发送处理，已预留额度不返还，结果可留作工件。

作业级预留是本工具不重复发请求的机制，不保证远端服务内部计费/重试语义或余额。已做实际进程强退恢复与本地收取真实返回物验证；未对用户电脑物理断电，硬件/文件系统损坏时缺件应明确待审，不能猜测结果放行。

照片/冻结设计、源审核、母版JSON/atlas、质量政策、方向/审核提示词/规则/返修版本变化都使任务失效；不能继续套用旧修复计划。全部事件、照片引用、原始响应、输出在忽略的runtime/work/M06或原M04/M05私有目录，不进入Git。

## 本次实测与下一步

结构验证副本中的腕漏线/头发几何偏差已修复，新包通过246帧；无生图/视觉调用。内容验证副本先真实审核发现BODY_FRONT密噪，从原照片重生1件，再全身装配/246帧/真实视觉审核：衣身噪点消失，头发仍有画风偏差、耳可见性待审，所以最佳指针保留，不宣称整套通过。原3角色未改。共1个订阅生图作业、2个订阅视觉请求，无API回退；CLI底层模型ID/内部调用次数/余额未验证，不把本地计数当计费证明。

证据见evidence/M06.md。M06作业级功能验收完成，下一步M07照片自动设计/整套调度/统一操作；自动美术放行、任意照片成功率、生产尺寸和广泛故障/设备性能仍需M07/M08验收。
