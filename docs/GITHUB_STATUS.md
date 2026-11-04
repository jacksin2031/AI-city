# GitHub 工作索引

核对日期：2026-11-04。本文是核对时的快照；PR、Issue、CI 与线上服务的实时状态以对应页面为准。历史整合过程保留在 [2026-10-20 的索引版本](https://github.com/jacksin2031/AI-city/blob/9f374f306dc7d9e646b919e617bda9d8d97140e6/docs/GITHUB_STATUS.md)。

## 当前基线

- `main` 包含 [#33](https://github.com/jacksin2031/AI-city/pull/33) 的参与者界面及手机请求平板聚焦预览；合并提交 `c049ddb`。该 PR 的 Quality、Firestore rules 与 Dev Container 检查通过。
- 已部署 mock 参与界面与聚焦功能；准确的构建、版本及验证边界见 [发布记录](releases/2026-11-04-participant-interface-preview.md)。预览与合并不等于真实照片、模型生成或实机验收已完成。
- 公开中的依赖 PR：[#31](https://github.com/jacksin2031/AI-city/pull/31) 更新开发依赖，[#32](https://github.com/jacksin2031/AI-city/pull/32) 更新 three.js。原有检查基于各自 PR head；合并前需对当前 main 与实际改动重新核对，three.js 更新需检查 3D 城市兼容性。
- `feature/csp-browser-smoke` 仍存在，当前内容已被 main 包含；其原 [#12](https://github.com/jacksin2031/AI-city/pull/12) 已关闭而非单独合并。保留分支与历史，不将关闭描述成该 PR 曾独立合并。

## 未完成事项

| Issue | 范围与剩余验收 |
| --- | --- |
| [#1](https://github.com/jacksin2031/AI-city/issues/1) | 共享契约及双方人工签核，真实生成和素材协议待冻结。 |
| [#2](https://github.com/jacksin2031/AI-city/issues/2) | 日语参与流程：示例界面已合并；真实照片授权与输入、Android / iPhone 实机验收待完成。 |
| [#3](https://github.com/jacksin2031/AI-city/issues/3) | 照片外观提取、正式角色与视觉质量验收尚未完成。 |
| [#4](https://github.com/jacksin2031/AI-city/issues/4) | 城市原型：当前为 3D 场景，原 Phaser 目标与当前实现的验收关系需确认；真实平板性能及长时间运行待验收。 |
| [#5](https://github.com/jacksin2031/AI-city/issues/5) | 真实生成、云队列、费用对账及性能目标待完成。 |
| [#6](https://github.com/jacksin2031/AI-city/issues/6) | 正式照片到角色的完整链、故障恢复及最新版本实机展场验收待完成。 |
| [#7](https://github.com/jacksin2031/AI-city/issues/7) | 协作者账号与权限映射、预算提醒及分支保护方案待负责人决定。 |

所有 Issue 保留 open 和既有验收要求；不要将示例数据、桌面浏览器或历史版本实机结果当成正式展场验收。

## 协作与安全边界

各任务遵循 [职责边界](OWNERSHIP.md) 与 [共享契约](CONTRACTS.md)，一个任务一名 owner；真实访问、IAM、预算或部署以具体授权及当前配置为准。手机自选颜色、图案和 AI 风格仅是临时示例，不同步至平板；聚焦请求是单进程、短期、最新请求覆盖的 mock，详见 [参与者聚焦](PARTICIPANT_TABLET_FOCUS.md)。
