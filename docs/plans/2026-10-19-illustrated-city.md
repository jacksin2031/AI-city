# B 简易插画城市替代

用户要求先用简单插画暂代 B 的工作。本任务 Owner 为 Main Model，明确获准修改 B 的 packages/city 和 /city；后续正式素材仍交由 B 替换。基于 PR #13 的 aeb4071，使用独立 codex/b-illustrated-city 分支。

## 有限交付

- 代码绘制的两款角色和街景，不用照片、图像模型或付费 API。角色有四方向及休息、步行、转身、既有会话例、挥手五种动作样例。
- 复用 Phaser 和现有 A 的同源 snapshot/events client，明确区分“插画见本”与“参加者的街”；手机未确认不出现，确认后出现，撤回后移除。
- 只读取 PublicResident；卡片不含原始问卷。断线隐藏旧名单，恢复以快照重建，进程重启不重播旧欢迎，旧快照不复活删除居民。
- 插画由 renderer 本地生成，保持 AvatarManifest/REFERENCE_ONLY 的语义不变，不把这些图片引用当作已经下载。不是照片外观抽取、正式四方向素材生产或真实 AI 会话。
- 尊重 reduced motion，提供暂停按钮与键盘可用的资料卡/动作控件。场景最多展示 20 人；简易固定路点不是通用寻路。

## 验证

先观察新增 roster/simulation 测试及浏览器用例失败，再实现。验证四方向、动作、重复/过期快照、手机确认→城市显示→断线恢复→撤回、375px 布局和 Strict Mode/路由切换单一 canvas。运行 pnpm check、pnpm test:rules、pnpm test:e2e，实际查看桌面与手机截图，最后独立审查并交付可审查 PR。实机 FPS、4–8 小时、辨认度、云端及真实生成不在本轮完成声明内。
