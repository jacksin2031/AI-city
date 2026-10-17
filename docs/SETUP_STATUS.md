# 开发基础验收记录

记录日期：2026年10月17日。这里只记录共同开发基础，不代表 P0 产品功能或展场验收完成。

## 已验证

- 环境诊断：Node 24.18.0、pnpm 11.9.0、项目内 Temurin Java 21 通过。
- `pnpm check`：格式、三个模块类型检查、15 项单元测试和 Next.js 生产构建通过。
- `pnpm test:rules`：本地 `demo-ai-city` Firestore emulator，5 项拒绝访问测试通过。
- `pnpm audit --prod --audit-level high`：未发现已知漏洞。
- HTTP：首页 200、`lang=ja`，health 明确报告 mock 与未连接 live services。
- Chrome：`/city` 实际 Phaser 4 样例运行，控制台 0 error / 0 warning；图形明确标为开发样例，不冒充生成角色。
- 现有 GCP 项目及 billing 已查询，Firebase 已添加；Standard Firestore 东京且有删除保护，默认拒绝规则已实际发布。
- 两个 GCS bucket 均为东京、uniform access、public access prevention enforced；私有输入桶配置一天生命周期兜底。
- 空容器仓库、受限空任务队列、runtime 和 CI 身份、WIF 与只读自定义角色已建立；两个身份均无用户管理的 JSON key。
- GitHub `development` environment 已限定 main 分支，配置了非密钥环境变量；Actions 默认 token 为 read，禁止 Actions 自行批准 PR。

## GitHub 上的验证

每次主分支 push 或 PR 运行 Quality、Firestore rules 和 Dev Container 构建。手动 Cloud identity verification 使用真实 OIDC 交换，只读取目标项目元数据。最新结果以 [GitHub Actions](https://github.com/jacksin2031/AI-city/actions) 为准，workflow 文件存在不能代替运行通过。

发布前独立审查发现并已修正：重跑初始化时验证 bucket 安全漂移、CI 自定义角色和额外项目绑定、WIF 单一 provider / issuer / mapping；公开素材清单不接受私有签名 URL 或任意外部链接。新增负向测试已观察失败后修正通过；云脚本重跑通过。

## 明确未完成或需后续决定

- 第二位开发者账号未知：GitHub 邀请、个人 IAM、实际 A/B Code Owner 映射未完成。
- 云预算金额与提醒接收人待决定，没有宣称存在实时硬消费上限。
- 本机未安装 Docker；Dev Container 的实际构建结果须另行验证，不能用本机 pnpm 测试替代。
- Firebase Auth 访客流程、真实照片生成、四方向美术、授权发布、城市业务、Gemini 对话和 Cloud Run 应用部署均属后续 P0；当前不收集真实用户资料或调用付费模型。
- 浏览器验证不等于目标平板 4–8 小时、FPS、照片辨认度或日本路人试用验收。

## 费用与清理边界

API 启用和空资源不代表以后永远免费；本次没有发起图像或文本生成请求，也没有部署 Cloud Run 服务。Java、依赖、emulator jar 与浏览器证据仅在被 Git 忽略的本机路径；凭证和用户资料没有加入源码。
