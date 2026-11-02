# GitHub 工作索引与整合方案

核对日期：2026-10-20。负责人：Main。此页整理已有证据和待办，不把预览发布、合并 main、模型生成或实机验收混为完成。

## 当前基线

- 整理前：15 个 open PR、7 个 open Issue、16 条远端分支（含 main）。
- `main`：`2df630b22c85353b345a6ff9faf3c61f6186c6e1`，未包含后续整合成果。
- 当前预览源码：`02dca6b34587e4265376c589884f90aa1a44792b`，相对 main 前进 23 个提交；#9–#22 的 head 都是它的祖先。
- Cloud Run：`ai-city-link-preview-scene-02dca6b` 100% 流量；展示内容仍为模板插画和预设行为。此整理只改文档与 GitHub metadata，不重新部署。
- 最后功能证据：155 unit、119 rules、19 Chrome E2E、4 Firestore 免码 E2E、最终平板 2 项 E2E；#22 的 8 项 CI 和 38 项 HTTPS 检查通过。原有住民与展示设置保留。
- Contracts 实际版本为 `0.5.0`，以包版本和 CHANGELOG 为准。

## PR 分类与依赖

“已在预览”表示提交包含于上述源码，**不表示已合并 main，也不表示原任务的照片/模型/实机范围已完成**。

| PR                                                    | 内容                           | 依赖 / 状态                                                           |
| ----------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| [#8](https://github.com/jacksin2031/AI-city/pull/8)   | Dependabot 开发依赖更新        | 独立；未包含在预览，Dev Container CI 失败，另行排查                   |
| [#9](https://github.com/jacksin2031/AI-city/pull/9)   | Biome 规则                     | main；已在预览，CI 通过                                               |
| [#10](https://github.com/jacksin2031/AI-city/pull/10) | Contracts v0.2                 | main；已在预览，CI 通过；当前包已演进至 0.5.0                         |
| [#11](https://github.com/jacksin2031/AI-city/pull/11) | 客户端规则覆盖                 | main；已在预览，CI 通过                                               |
| [#12](https://github.com/jacksin2031/AI-city/pull/12) | CSP / Browser smoke            | main；已在预览，但该旧 head 的 Browser smoke 失败，不能单独按全绿合并 |
| [#13](https://github.com/jacksin2031/AI-city/pull/13) | A/B 本地接入与前述基础整合     | main；包含 #9–#12，后续集成 CI 通过                                   |
| [#14](https://github.com/jacksin2031/AI-city/pull/14) | 简易插画城市                   | #13；已在预览                                                         |
| [#15](https://github.com/jacksin2031/AI-city/pull/15) | 手机管理 / 平板配对            | #14；已在预览                                                         |
| [#16](https://github.com/jacksin2031/AI-city/pull/16) | 设备联动云端发布记录           | #15；已在预览                                                         |
| [#17](https://github.com/jacksin2031/AI-city/pull/17) | 持久匿名访客 / 本人权限        | #16；已在预览                                                         |
| [#18](https://github.com/jacksin2031/AI-city/pull/18) | 持久访客云端发布记录           | #17；已在预览                                                         |
| [#19](https://github.com/jacksin2031/AI-city/pull/19) | 免代码参加 / 三端入口隔离      | #18；已在预览                                                         |
| [#20](https://github.com/jacksin2031/AI-city/pull/20) | 管理控制 / 批次撤回            | #19；已在预览                                                         |
| [#21](https://github.com/jacksin2031/AI-city/pull/21) | 公开资料 / 顺序欢迎状态基础    | #20；已在预览；独立 modal 交互由 #22 调整                             |
| [#22](https://github.com/jacksin2031/AI-city/pull/22) | 镜头聚焦 / 原地欢迎 / 头顶气泡 | #21；当前预览源码，8 CI 通过                                          |

依赖链：#9–#12 → #13 → #14 → #15 → #16 → #17 → #18 → #19 → #20 → #21 → #22。旧 PR 保留原增量和历史证据，不重复重写其实现。

## Issue 完成边界

| Issue                                                 | 已有证据                                                              | 尚未完成 / 下一步                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [#1](https://github.com/jacksin2031/AI-city/issues/1) | v0.5.0 严格 schema、fixture、正负测试、实际调用方                     | 双方账号与兼容性人工签核；真实生成 / 资产协议另行冻结                      |
| [#2](https://github.com/jacksin2031/AI-city/issues/2) | 日语免码参加、预览确认、分项公开、恢复与本人撤回                      | 受控照片输入、照片授权、Android / iPhone 新流程实机验收                    |
| [#3](https://github.com/jacksin2031/AI-city/issues/3) | 只有可替换模板插画与四方向见本                                        | 照片外观提取、正式 Fast Mode、覆盖率 / 回退率 / 人工修正与视觉验收         |
| [#4](https://github.com/jacksin2031/AI-city/issues/4) | Phaser、五种样例动作、深度、队列、镜头聚焦和气泡                      | 通用寻路 / 碰撞、目标平板 FPS / 内存 / 耗电 / 长跑及正式素材               |
| [#5](https://github.com/jacksin2031/AI-city/issues/5) | mock 状态机、有限重试 / 取消、持久匿名会话、公开 / 撤回权限隔离       | 受控照片、真实模型 / Cloud Tasks、计费对账及 P95 口径与实测                |
| [#6](https://github.com/jacksin2031/AI-city/issues/6) | 模板访客 HTTPS 入城、恢复、隐私 / 撤回 / 乱序测试；旧设备联动用户确认 | 照片到正式角色完整链、模型失败、最新镜头 UI 的目标实机 / 展场验收          |
| [#7](https://github.com/jacksin2031/AI-city/issues/7) | owner 和 A/B 职责文件存在；main 当前 protected=false                  | 协作者 GitHub / Google 账号、实际权限映射、预算金额 / 接收人和分支保护决策 |

主责沿用 A/B 模块，不虚构尚未提供的第二位账号，不自动发邀请或扩大 IAM。所有 Issue 保持 open，更新进度不等于降低原验收条件。

## 整理标记

- `status:preview`：PR head 已包含当前预览源码。
- `status:partial`：Issue 已有部分实现，但原验收条件未全部满足。
- `status:todo`：该 Issue 的核心真实能力尚未实现。
- `status:needs-attention`：当前 CI 或外部输入需要跟进。

原有 area / priority 标签保留。PR 描述只增加可识别的整理区块，原验证和发布记录不覆盖。

## 建议整合方式（尚未执行合并）

仓库目前只允许 Squash merge，`delete_branch_on_merge=true`；merge commit / rebase merge 均关闭，main 未启用强制保护。不能假设逐个 squash 长链后，后续 PR 仍保持正确增量，也不能假设旧 PR 会自动标记 merged。

1. 以当前已验证源码和本文档建立一个 **base=main 的整合 draft PR**，集中审查 23 个已有提交及本轮文档；运行对应 CI。保留 #9–#22 作增量审查记录。
2. 获负责人明确确认后，将整合 PR 标为 ready 并 squash 合并。先核对 GitHub merge 后的 tree 与整合 head 内容一致，再确认新 main 的 CI。
3. 确认 main 包含全部成果后，再按批准清单关闭 #9–#22 并删除已整合远端分支。描述为“由整合 PR 取代并包含”，不伪称每个旧 PR 都单独 merge；不删除当前使用的 worktree。
4. #8 保留独立处理。#1–#7 仍按缺口跟进；真实照片、模型、正式 B 素材、设备与运营设置分别验收。

本轮不会变更 merge 策略、分支保护或仓库可见性，不会 merge、close PR 或删除远端分支。上述操作留作负责人对具体整合 PR 的最终决定。
