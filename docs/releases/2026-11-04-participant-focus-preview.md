# 参与者聚焦预览部署记录

2026-11-04 用户要求更新真实网页并测试。部署范围是参与者聚焦的 mock 接口与现有参与页面，**不包含另一工作树中的新版参与者界面**。

- 项目 / 区域 / 服务：`ai-city-511822` / `asia-northeast1` / `ai-city-link-preview`。
- 构建源码：`afb2af1f6777d7a06fea777fbfa0444bfccc0cc3` 的 git archive；SHA-256 `F035D493B44746DE4EA21D67A90B58B89692FF20ED1217223A14D9618394483E`。
- Cloud Build `268fb67b-3c4c-4639-bb7f-ea5603df2f16` 成功；镜像 digest `sha256:156a8c959257887f10b18080322ab99f2d5d3534f7c8aea56593457491bccfbe`。
- Revision `ai-city-link-preview-focusafb2af1` 先 0% 验证 `/api/health`、`/join`、`/tablet` 为 200，再切换 100%；测试 tag 已移除。沿用原有服务账号、Secret 引用、访客设置和单实例上限。
- 真实 HTTPS 仅使用一名虚构访客验证：匿名聚焦 401；建立会话、样例任务 READY、分项公开成功；伪造角色 ID 400；本人聚焦请求 200；测试角色撤回和会话注销均 200。没有使用管理员凭证或控制既有平板。
- 已用浏览器打开线上 `/join` 检查页面。线上 UI 仍为 main 的原参与页面；新版 UI、AI 问卷、自定义样式及全屏卡片没有部署。
- 本地 emulator 的独立访客、管理员和平板浏览器验证了平板摄像机实际聚焦；云端只验证了请求接受，未验证实际已配对平板收到或物理设备表现。请求在单进程内存中最多保留 10 秒，后来的请求覆盖前一个，服务重启会清除请求。
- 需要回退时将流量改回原 revision `ai-city-link-preview-main9f374f3`；不会自动删除 Firestore 数据。
