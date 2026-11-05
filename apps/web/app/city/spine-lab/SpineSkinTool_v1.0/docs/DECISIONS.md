# Architecture decision register

- ADR-0001 PROPOSED: Python+uv core, isolated JS/Spine renderer, SQLite local state. See spec Chapter 0/3. Not validated.
- ADR-0002 PROPOSED: `legacy_reference_8part` first for reproduction, then `modular_ears_v1`. See Chapter 2/4.
- ADR-0003 REQUIRED: Per-edit CHANGELOG plus machine entries and verifier as completion gate. See Chapter 0.7.
- ADR-0004 REQUIRED: No paid API by default and no `.spine` editor project fabricated from JSON.

- ADR-0005 用户确认：素材尺寸待多轮生成、装配和动画试验后确定；旧图宽高是观测值。当前 size-trials TOML 只提供带版本/哈希的实验导出画布，生成分辨率、Spine 几何和生产批准均未完成。
- ADR-0006 已落实基础部分：工具嵌入 AI City，根目录由脚本位置确定；日志只检查本工具范围。Python 标准库配置与空 JS 依赖可离线重建；Spine/模型 SDK/SQLite 在对应里程碑引入。原 ADR-0001 的后续架构仍待验证。
- ADR-0007 执行顺序采用 MILESTONES.md：提前提供预览与受控人工验收的规格试验，完整自动 QA 和无人值守闭环后续完成。
