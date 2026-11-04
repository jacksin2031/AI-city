# 开发环境

## 可复现工具链

CI 使用 `.node-version` 和 `package.json#packageManager`；Node 24.12+，pnpm 11.9.0。Java 21+ 只用于 Firebase emulators。推荐 Dev Container；配置提供 Node 24 与 Java 21，基础镜像固定 digest。本机没有 Docker，容器构建和内部检查由 GitHub CI 的 Dev Container job 独立执行，查看该 job 的实际结果。

容器以非 root 的 `node` 用户工作。Corepack shim 安装到用户目录 `.local/bin`，避免启动时尝试写入 `/usr/local/bin`；不要求开发者用 sudo 安装项目工具。

本机先运行 `pnpm install --frozen-lockfile` 和 `pnpm doctor`。Windows 若现有 npm 损坏，可直接使用正常的 pnpm；不要为了本项目重装其他项目共用的全局工具。

## Java

Java 17 不满足当前 emulator 要求。本机已在被 Git 忽略的 `.tools/java` 安装经 SHA256 校验的 Temurin 21，不修改全局 Java。其他开发者可以安装自己的 Java 21，或解压官方 JDK 到 `.tools/java`，使 `bin/java`（Windows 为 `bin/java.exe`）直接存在。也可通过 `AI_CITY_JAVA_HOME` 指定。

`scripts/emulators.mjs` 优先选择 Java 21 的本地路径，使用显式 `demo-ai-city` 和回环地址。启动失败时保留错误，不自动连接真实项目。Windows、macOS、Linux 使用相同 pnpm 命令。

## 命令

| 命令              | 用途                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev`        | 本地 Next.js；默认绑定 127.0.0.1                                                        |
| `pnpm check`      | 格式、类型、unit tests、生产 build                                                      |
| `pnpm test:rules` | 本地 Firestore 与 Storage 模拟器规则测试，完成后关闭                                    |
| `pnpm test:e2e`   | 生产构建 + Playwright 浏览器冒烟测试：日语页面、nonce CSP、控制台零错误、单一 3D canvas |
| `pnpm emulators`  | Auth、Firestore、Storage 与 UI                                                          |
| `pnpm doctor`     | 检查版本与本地 Java，不打印凭证                                                         |

HTTP 可以验证启动和日语 HTML，实际 3D 街景还须浏览器检查。`pnpm test:e2e` 首次需 `pnpm exec playwright install chromium`；本机已有 Chrome 时可设 `PLAYWRIGHT_CHANNEL=chrome` 直接使用。冒烟测试不代替目标平板的性能与长时间验收。

页面 CSP 由 `apps/web/proxy.ts` 按请求生成 nonce（`strict-dynamic`，不允许 `unsafe-inline`），因此页面为动态渲染。新增外部脚本、图片或连接来源时修改 `apps/web/lib/csp.ts` 并通过浏览器测试；`upgrade-insecure-requests` 与 HSTS 留待 HTTPS 部署时设定。开发容器和 Codespaces 暴露端口时保持 private；不要把 Firebase emulator 暴露给公网。

## 云端访问

默认 mock 不需要登录。需要实际云操作时，开发者使用个人 Google 身份和最小权限，不共用 owner 账号或下载 JSON key。显式设置项目和 `GOOGLE_CLOUD_QUOTA_PROJECT=ai-city-511822`，避免复用其他项目的 ADC quota 配置。相关操作见 `CLOUD.md`。
