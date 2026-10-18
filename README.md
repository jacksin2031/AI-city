# AI City

面向日本公众的 AI 城市互动展示。项目旨在向路人直观展示 AI 的强大能力：从照片理解与 Q 版形象，到人格偏好与居民交流。**产品 UI 使用日语，项目计划和协作文档使用简体中文。**

当前是共同开发基础，不是已完成的展览产品。默认 mock：只有虚构人物和明确标识的 Phaser 动作样例，没有真实照片上传、模型生成、公开展示或部署中的应用。

## 开始开发

推荐 VS Code「Reopen in Container」，或自行创建 GitHub Codespace。配置已提供，但不会自动创建可能收费的 Codespace。容器需要本机 Docker，Codespaces 需要相应 GitHub 额度。

本机路径：Node 24.12+（CI 固定 24.18.0）、pnpm 11.9.0，规则测试需要 Java 21+。

```sh
git clone https://github.com/jacksin2031/AI-city.git
cd AI-city
pnpm install --frozen-lockfile
pnpm doctor
pnpm dev
```

- 首页：<http://localhost:3000>
- A 参与流程入口：<http://localhost:3000/join>
- B 城市样例：<http://localhost:3000/city>
- 健康状态：<http://localhost:3000/api/health>

没有 pnpm 时使用 Corepack 启用 `package.json` 指定的版本，或按 [pnpm 官方安装说明](https://pnpm.io/installation) 安装；不要换用 npm/yarn 重新生成 lockfile。开发无需云账号或 API key。

```sh
pnpm check       # 格式、类型、单元测试、生产构建
pnpm test:rules  # demo-ai-city 本地 Firestore / Storage emulator，绝不访问真实数据库
pnpm test:e2e    # 生产构建 + Playwright 浏览器冒烟测试
pnpm emulators  # 本地 Auth / Firestore / Storage
```

## 两人如何协作

| 主责 | 目录 | 工作范围 |
| --- | --- | --- |
| A | `apps/web`（city 除外）、`infra` | 参与流程、任务可靠性、同步、权限、文本服务、运营 |
| B | `packages/city`、`apps/web/app/city` | 角色素材、动画、城市、行为调度、平板展示 |
| 共同接口 | `packages/contracts` | schema、版本、fixture；先讨论兼容变化，单人提交 |

1. 从 `main` 建立短分支，例如 `feature/a-consent` 或 `feature/b-avatar`。
2. 一个 Issue 指定一个实际负责人；把范围、验收和必要上下文交给 AI。
3. 运行验证，提交 PR，另一位开发者检查证据后合并。不要让两个 AI 同时修改同一个工作目录。
4. 公共 contract 的改变同时更新 fixture、负向测试和双方调用方。

详细入口：[开发环境](docs/DEVELOPMENT.md)、[AI 工作流](docs/ai/WORKFLOW.md)、[责任边界](docs/OWNERSHIP.md)、[接口](docs/CONTRACTS.md)、[云端](docs/CLOUD.md)、[计划书](docs/plans/README.md)。

## Google Cloud

沿用 `AI-city`，project ID 为 `ai-city-511822`，区域为东京 `asia-northeast1`。所有命令必须显式指定项目。默认本地 emulator 使用 `demo-ai-city`，真实服务部署必须单独指定真实项目。

GitHub 的云验证采用 OIDC，**没有 JSON 服务账号密钥**。当前 CI 身份仅能读取项目元数据与启用服务，不能部署、访问照片或调用模型。生产发布不在本基础的自动流程中。

## 当前限制

协作者 GitHub / Google 账号尚未提供。GitHub 邀请、个人 IAM 和实际 A/B 账号映射待补；不能把 `CODEOWNERS` 中的现有仓库负责人当成已完成双人审查。当前私人仓库方案无法启用分支强制保护（API 403），须按 PR 流程人工审查；没有自动改成公开。云预算金额也需由负责人决定；mock 模式和空资源不代表未来使用永远免费。
