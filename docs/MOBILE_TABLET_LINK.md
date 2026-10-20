# 手机管理与平板联动

Owner：A / Main；分支 codex/mobile-tablet-link，基于 PR #14。用户要求管理在手机，同 Wi-Fi 或不同网络均可；两端连接同一 HTTPS 服务，不依赖手机直接访问平板。

## 入口与本地使用

| 入口 | 用途 |
| --- | --- |
| /setup | 电脑 loopback 开发领取临时管理钥匙；远端禁用 |
| /admin | 手机管理：登录、配对码、模式、动作开关、删除公开居民、撤销展示连接 |
| /tablet | 只读平板：8 位码连接、展示、全屏、休止、断线清空与恢复 |
| /join | 样例参与；远端仅已登录管理员可创建虚构样例 |

运行 pnpm dev，电脑打开 http://127.0.0.1:3000/setup 领取临时管理钥匙，在独立浏览器的 /admin 登录；发码后在另一个独立浏览器的 /tablet 输入。这个 loopback 地址只在该电脑有效，不是实际手机连接地址。production 构建本地验收时先设置 AI_CITY_ENABLE_LOCAL_MOCK=1，再运行 pnpm start。

管理页切换见本/参与者/休止、停止或恢复动作；目标设备 reduced motion 优先。平板没有管理操作，其 DISPLAY cookie 无权读取管理员视图或控制。配对码有效 3 分钟、单次；新码使旧码失效。管理员会话 1 小时，展示会话 8 小时。失败或每次请求 4 秒超时清空旧画面，重连重新对账；正常轮询为请求完成后 1 秒。

## 同 Wi-Fi 与跨网络

两端均使用同一个可达 HTTPS 域名，手机打开 /admin，平板打开 /tablet。无需互相知道 IP，不开 CORS；不把管理员密钥、cookie 或配对码放入 URL。主办者提供管理钥匙，手机生成一次性配对码。

已准备 infra/app/Dockerfile 和 pnpm start:remote。启动前服务端必须配置：

| 环境项 | 要求 |
| --- | --- |
| AI_CITY_PUBLIC_ORIGIN | 精确 HTTPS origin，无路径、尾斜线、凭证或 query |
| AI_CITY_ADMIN_KEY | 唯一随机 32–256 字符密钥，通过 Secret Manager/受控环境注入，不打印、不提交 |
| AI_CITY_ENABLE_LOCAL_MOCK | 显式 1，仅使用虚构数据 |
| PORT | 默认 8080 |

Dockerfile 从根目录构建，运行非 root node；.dockerignore 排除环境、凭证、工具与输出。本机没有 Docker；2026-10-19 已通过 Cloud Build 实际构建并在 Cloud Run 验证。远端脚本验证配置后才绑定 0.0.0.0；本机脚本仅绑定 127.0.0.1 并设置进程标记。bootstrap 不依赖 Host 声称来自本机：没有受信任启动标记就拒绝；远端永远禁用。缺少远端 origin 也没有本机标记时 API 停用。

用户确认部署及相关构建/运行费用后，2026-10-19 已部署到现有 ai-city-511822 / 东京，独立 HTTPS 服务 ai-city-link-preview，单实例上限 1、最小实例 0。入口：[手机管理](https://ai-city-link-preview-391632496355.asia-northeast1.run.app/admin)、[平板展示](https://ai-city-link-preview-391632496355.asia-northeast1.run.app/tablet)。管理员从 [Secret Manager 的 ai-city-preview-admin](https://console.cloud.google.com/security/secret-manager/secret/ai-city-preview-admin/versions?project=ai-city-511822) 查看管理钥匙；不要把钥匙放进聊天、URL 或 Git。只读 CI 身份未升级；预览使用独立最小权限 builder/runtime 身份，没有服务账号 JSON key 或模型调用。详细资源、镜像、验证和回退见[部署记录](releases/2026-10-19-device-link-preview.md)。用户随后确认实机及不同网络连动成功，作为本轮基本跨网验收的用户回报证据。

## 权限与限制

- 远端只提供管理员与已配对展示连接；匿名 /api/dev 在分配 session/job 前拒绝，DISPLAY 也不能调用参与写入。公众免登录参与与配额治理不属于本轮。
- 精确 Host/Origin、严格 4KiB JSON、HTTPS Secure/HttpOnly/SameSite cookie、no-store、CSP 不放宽；展示不接收管理密钥和私人问卷。
- 错误猜测按服务端签名客户端 cookie 分桶，另有 200 次/分钟全局兜底及最多 4096 个计数桶。错误登录每客户端 6 次/分钟；错误配对每客户端 12 次、单码每客户端 5 次/分钟。正确密钥/未过期有效码不受错误预算封锁。轮换 cookie 可绕过单桶配额，不能绕过错误猜测全局预算；不是完整防 DDoS，公开运行仍需边缘限流。
- 控制带 revision，旧写入 409，旧轮询不覆盖新状态；重启更换 serverId，清空所有会话，重新登录/配对。
- 内存任务/session 上限仍为 200；重启清空。暂不支持多副本、持久化或展场运行保证。正式化需要正式身份、数据持久化及匿名参与防滥用。
- 远端发布要求 consentVersion 2 + HOSTED_PREVIEW，日语 UI 明确管理者限定及公开字段；本地 v1 兼容。不处理真实照片或收费生成。

## 验证与回退

命令：pnpm check；pnpm test:rules；CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e --retries=0（Windows 使用相应环境变量语法）。

浏览器为隔离 cookie 的 context：375px 管理、1024×768 展示；覆盖配对、角色禁止、模式/暂停/休止、管理员撤回、刷新、挂起清除/恢复、撤销、无溢出与 CSP/JS 错误。忽略目录 output/playwright/mobile-admin.png 与 paired-tablet.png 为虚构数据截图；截图中的配对码已消费。

本地测试不是实际手机/平板或不同运营商网络的验收；本轮实机及不同网络成功由用户确认。源码回退可切回 codex/b-illustrated-city，但不会改变已部署的云端服务；云端停止访问与回退步骤见部署记录。完整设备型号、运营商组合、重启/休眠和持续运行矩阵仍为后续测试，不能从用户基本连动回报推断全部通过。main 未合并。

### 本次结果（2026-10-19）

- pnpm check：PASS，lint、类型、91 项单元测试、生产构建。
- pnpm test:rules：PASS，本地 demo emulator 98 项。
- 完整 Chrome e2e --retries=0：15 PASS，含 375px 手机与 1024px 独立展示 context；截图已实际检查，CSP/JS 检查通过。
- 实际 production 进程不经本机 launcher、不带 loopback 标记：bootstrap 与参与 session 均返回 404，不回传管理钥匙。
- Luna Max 独立只读审查与复核：bootstrap/匿名任务耗尽两项 P1 已修并红→绿；限流合法连接锁死 P2 经洪水回归修正，reviewer 静态复核无该残余。基础 volumetric 防护仍属正式公开运行的后续项。
- Cloud Build：SUCCESS，构建精确源码 746db21；Cloud Run HTTPS 管理登录、独立 context 配对、只读权限、模式、动作、休止、分项确认、删除、刷新、超时清空/恢复、撤销和退出 PASS。
- 云端 Chrome：375px 管理、1024×768 展示，无横向溢出；控制台仅预期未授权请求 401/403，无 CSP/JS 异常。截图已实际检查；虚构测试住民已删除、模式恢复 DEMO、测试平板撤销、测试管理会话退出，临时钥匙/cookie 文件已删除。
- 用户实机验收：先回报“實機沒有問題”，再确认“不同網絡也成功”。基本实机跨网连动 USER CONFIRMED；未提供设备型号、具体网络组合或逐项测试日志，不冒充代理独立观察。
- 目标设备性能、耗电、休眠与长时间运行尚无验证结果，作为正式展览前的后续项。

状态：COMPLETE（本轮基础手机管理、配对平板展示与跨网连动）。源码、本地联动、镜像构建与云端 HTTPS 浏览器验收已完成；实机跨网由用户确认成功。仍是单进程内存 mock，不代表正式展览产品完成。
