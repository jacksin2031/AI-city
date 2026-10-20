# A 本地接入基础执行记录

用户已批准先做基础，让 B 能独立接入。Owner：A；Main Model 实作，完成后独立 review。范围是共享接口、本地 mock API、日语参与和消费样例，不改 B 城市模块。

## 任务与验收

1. 隔离 worktree 整合既有 PR #9–#12，保留原 commits，解决测试说明冲突，不合并远端 main。
2. development 子路径提供严格 DTO、唯一素材版本 fixtures、typed client；旧导出兼容。
3. 实作本地会话、任务、确认/撤回、权威快照和有序事件；验证权限、幂等、TTL、重试与 HTTP 边界。
4. 实作 /join 和 /integration，提供简体中文交接文件；所有可见 UI 为日语。
5. check、rules、e2e、实际浏览器检查及独立 review 后，交付可审查 commit/PR。

## Rulings

- 最新要求优先交付 B 接入基础，本轮使用内存 store 与本地 cookie；不实作 Firebase Auth、真实照片或云队列。代价是重启不保留状态，真实接入须另行验收。
- 独立 /integration 演示接口，不修改 /city 或 packages/city，避免与 B 争用文件。代价是最终 Phaser 接入仍待 B 实作及双方验收。
- 仅将已确认单一 CI driver warning 记录为 annotation，其他 console/CSP/JS 异常仍失败；不作为目标平板性能证据。
- 独立 review 指出 Node 默认 fetch 不保留 cookie，已用实际本地 HTTP server 重现后，为 Node explicit baseUrl client 加入实例内 cookie jar；不使用持久化或导出 token。
- Host/Origin 是 HTTP 字段检查，实际连接隔离依赖绑定 127.0.0.1；已明确禁止公开绑定和端口转发，不宣称 guard 有来源 IP 验证能力。
- 独立 review 的会话过期恢复问题按实际影响处理：原错误 CTA 会反复 401，已用浏览器删除 cookie 的用例重现；恢复时先建/复用会话，再读 current，必要时清空旧同意选项。

协议、命令与限制见 `docs/A_B_LOCAL_INTEGRATION.md`。
