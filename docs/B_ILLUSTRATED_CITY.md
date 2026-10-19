# B 简易插画替代与交接

用户授权 Main 暂代 B，先用原创建模 SVG 打通本地展示。分支 `codex/b-illustrated-city` 叠加在 A 基础 PR #13；不是正式 B 资产或云端交付。

## 可直接演示

1. `pnpm dev` 后打开 `/city`：两个虚构居民、咖啡店/图书室/花店、喷泉与步行环线。
2. 选择角色或下方按钮，查看公开资料、四方向，试休息、走路、转向、预设说话、挥手。暂停与系统 reduced motion 都停止自动动作；暂停时仍可手动选择静态姿势。
3. `/join` 使用虚构昵称选择样例，确认预览及公开字段，再加入列表；`/city?mode=participants` 才显示该居民。撤回、会话失效、接口错误时旧角色及资料卡移除；重连读取当前快照。每轮请求总限时 4 秒，挂起时也清除旧名单；卸载取消请求。正常刷新间隔为请求完成后 1 秒，撤回显示并非零延迟。
4. `/integration` 保留为接口诊断，不混入插画见本。

## B 后续替换位置

| 文件 | 当前实现 | 后续责任 |
| --- | --- | --- |
| `packages/city/src/illustrations.ts` | 本地 SVG 角色/街景，预设两套配色，未知版本用通用占位角色 | 正式角色素材、外观一致性、街景 |
| `packages/city/src/renderer.ts` | Phaser 画面、点击、动态纹理、最多 20 人、单一预设气泡 | 真实资源加载、镜头、调度、性能 |
| `packages/city/src/simulation.ts` | 四个固定路点环线、五动作与方向 | 正式行为/避障；当前不是通用寻路 |
| `packages/city/src/roster.ts` | 严格快照验证、同流旧序号忽略、重启替换 | 保留删除优先与公共数据边界 |
| `apps/web/app/city/preview.tsx` | 生命周期、非重叠轮询、公开资料与键盘控件 | 保留可访问控件及断线清除 |

共享 contracts 版本仍为 0.3.0，未修改 schema。AvatarManifest 路径仍为 `REFERENCE_ONLY`，没有变成可下载资产。SVG 是本地独立占位实现，不根据昵称、照片或模型输出拼接 SVG；实际任务的版本使用通用角色，照片外观识别尚不存在。

所有 UI 与预设句为日语。没有照片上传、模型调用、付费调用、Firebase Auth、持久化或部署。当前 mock 仅供 loopback；两个同机标签页可演示，不能声称已验证跨设备手机/展场。

## 验收与回退

单元测试覆盖名单恢复、重复/旧序号、删除、流重置、拒绝私有字段、暂停、走路、四方向、动作结束及 SVG 输入隔离。浏览器覆盖公开前不出现、确认/撤回、断线清除/恢复、刷新、375px 与切换模式单 canvas。测试命令：`pnpm check`、`pnpm test:rules`、`CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`（Windows 用相应环境变量语法）。

这是本地浏览器验证；目标平板帧率、长时间运行、正式素材辨识度、云端生成及多人真实设备尚未验收。回退可切回 `codex/a-local-integration`（A 基础），本分支不修改其数据契约或默认云规则。不要在有未提交改动时强制切换。

### 本次结果（2026-10-19）

- `pnpm check`：PASS，lint、类型检查、76 单元测试与生产构建。
- `pnpm test:rules`：PASS，demo 项目本地 emulator，98 项。
- `CI=true PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e --retries=0`：PASS，14 项；含挂起请求限时清除与恢复，未依赖自动重试。
- 已实际检查桌面、375px 全页截图：`output/playwright/illustrated-city-{desktop,mobile,participant}.png`（忽略目录，均为虚构数据）。
- CSP 回归先失败、后通过：Next 图片组件的 inline style 被阻止，改为本地 SVG 原生 img，未放宽 CSP。
- Luna Max 独立只读审查：0 Critical；1 Important（挂起请求无限保留旧名单）。已先以浏览器测试重现，再加入限时/取消；reviewer 静态复核修正，Main 完成完整绿测。其余指定范围无 Critical/Important finding。

本地临时插画 scope：COMPLETE。正式 B 资产、真实生成与目标设备验收：未完成。
