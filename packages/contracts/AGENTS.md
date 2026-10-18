# 共享接口

本目录为 A/B 共享边界，每个修改只设一名 owner。使用 strict schemas，拒绝额外私人字段，不静默丢弃。变更同步更新 fixture、双方调用方、兼容说明和负向测试。

当前 v0.3 保留 v0.2 基础类型兼容，development 子路径为本地 mock 接入协议，不是完整生产协议；真实授权记录、任务租约及云端事件恢复仍需对应 P0 任务扩展。变更记录写在 `CHANGELOG.md`。不要从 shape validation 或本地 cookie 推导真实身份、安全授权或业务完成。
