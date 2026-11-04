# 新版参与者界面预览部署

用户要求上传新版参与者界面。2026-11-04 更新现有 `ai-city-link-preview`，未修改服务权限或数据库配置。

- 构建源码：`05c07934a0c193a8ed01c74d13544e7ec8af55b2`，git archive SHA-256 `7114DEF2744BC59B9B2815B0B458514BD12D84BF18A7A6E3C2889EF0C3459F8B`。
- Cloud Build `3e147a6d-7f63-497b-bf86-47f25c475709` SUCCESS；镜像 digest `sha256:b01f2fbe7f4795665ec8b5dd6f23ca84964f3384601cd7004928bebd7c659416`。
- `ai-city-link-preview-ui05c0793` 先以零流量验证 health、join、tablet 200 及新版页面壳，再切换 100%；临时 tag 已移除。原 revision `ai-city-link-preview-focusafb2af1` 可用于流量回退。
- 本地：`pnpm check` PASS，201 unit；`pnpm test:rules` PASS，119；完整浏览器回归 19 PASS；免代码访客与平板 emulator 集成 5 PASS，包括六题三选一、最短加载时间、公开、本人聚焦、撤回及重启恢复。手机截图已检查。
- 真实 HTTPS 浏览器使用虚构样例测试：昵称、无照片自定义、跳过问卷、预览、分项公开、角色卡、聚焦请求、撤回、注销均成功；测试角色和会话已清理。未使用管理员凭证，未在云端配对平板或测试真实设备。
- 两款示例人物可在平板展示；手机自选颜色、图案和问卷风格只在当前手机页面内展示，刷新后消失且不发送至平板。照片上传、真实模型与实际设备验收未完成。聚焦请求仍为单进程、最新请求覆盖的短期 mock，不保证并发投递或执行确认。
