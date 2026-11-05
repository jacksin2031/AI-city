# Chibi-Stickers 原 Spine 素材像素测量

测量日期：2026-10-30。范围仅为本地 Spine 示例中的 Davide、Spineboy、EriKari 原始部件 PNG 与 `chibi-stickers.json`；原始文件保持只读。本表是这次实验的参考事实，**不构成通用生产尺寸、Q 版厘米高度或最终像素规范**。

## 方法与单位

1. 读取 `library/Chibi-Stickers-4.3/extracted/images/<skin>/<part>.png` 的 RGBA 画布宽高。
2. 在 alpha 通道上取非零像素包围框。表中坐标采用从 0 开始、闭区间；透明边界不计入 alpha 范围，但仍属于保留的源画布。
3. 对照 `library/Chibi-Stickers-4.3/extracted/export/chibi-stickers.json` 中附件的 `width`/`height`、旋转和 linkedmesh 来源。以下 Spine 单位取 JSON 附件尺寸；网格轮廓本身由 vertices/triangles 定义，不可仅凭矩形尺寸替代。
4. 原始 `chibi-stickers.atlas` 对主图集标记 `scale: 0.5`。因此图集裁切像素、原始源 PNG 画布、Spine 世界几何是不同字段；新候选生成分辨率仍是另一项参数。

## 测量结果

| 皮肤 / 附件 | 原始 PNG 相对路径 | 源画布像素 | 非透明 alpha 包围框（闭区间） | Spine 附件尺寸 | 来源关系 |
|---|---|---:|---|---:|---|
| Davide / 前发 | `davide/hair-front.png` | 282×148 | x=1–280, y=1–146 | 282×148 | mesh |
| Spineboy / 前发 | `spineboy/hair-front.png` | 289×240 | x=1–287, y=1–238 | 289×240 | 当前模板网格/画布的实验观测；不得作为新角色发型轮廓参考，网格可能影响新图变形 |
| Davide / 后发 | `davide/hair-back.png` | 315×282 | x=1–313, y=1–280 | 315×282 | linkedmesh 使用 Spineboy 后发几何 |
| Spineboy / 后发 | `spineboy/back-hair.png` | 315×282 | x=1–313, y=1–280 | 315×282 | mesh |
| Spineboy / 头模 | `spineboy/head-base.png` | 286×249 | x=1–284, y=1–247 | 286×249 | region，旋转 -90°；原样复用 |
| Spineboy / 耳朵 | `spineboy/ear.png` | 68×83 | x=1–66, y=1–81 | 68×83 | mesh；原样复用 |
| Davide / 身体 | `davide/body.png` | 140×195 | x=1–138, y=1–193 | 140×195 | linkedmesh |
| Spineboy / 身体 | `spineboy/body.png` | 140×195 | x=1–138, y=1–193 | 140×195 | mesh |
| Davide / 手臂 | `davide/arm.png` | 55×179 | x=1–53, y=1–177 | 55×179 | linkedmesh；原工程左右槽复用/镜像 |
| Spineboy / 手臂 | `spineboy/arm.png` | 55×179 | x=1–53, y=1–177 | 55×179 | mesh |
| Davide / 腿 | `davide/leg.png` | 56×201 | x=1–54, y=1–199 | 56×201 | linkedmesh；左右槽复用/镜像 |
| Spineboy / 腿 | `spineboy/leg.png` | 57×201 | x=1–55, y=0–200 | 57×201 | mesh |
| EriKari / 腿 | `erikari/leg.png` | 56×201 | x=1–54, y=1–199 | 56×201 | linkedmesh |
| EriKari / 裙子 | `erikari/skirt.png` | 328×201 | x=1–326, y=1–199 | 328×201 | 独立 mesh/slot，不属于身体或腿部画布 |

本轮实验在原八部件框架里，将前/后发画布锁到 Spineboy 原网格的 289×240 与 315×282；BODY、ARM、LEG 沿用工具模板现有 140×195、55×179、57×201 观测画布。EriKari 的裙子是额外可选结构，当前人物照片没有裙装，不加入本次候选。

2026-10-30 在生成本轮完整人物前，按上述 RGBA alpha 非零包围框方法重新读取了表内 14 张源 PNG；画布与闭区间范围和表格一致。八张候选原图的生成器分辨率、alpha 包围框，以及 1×/2×/4×候选画布的实际 alpha 包围框另记在忽略目录 `runtime/work/M04/chat-imagegen-001/generation-manifest.json`，避免把生图原分辨率误当成 Spine 目标画布。

## 限制

- 部分素材 alpha 只留 1px 透明边缘；这不意味着可以裁掉它，因为网格/UV 和原点应保留。
- 身体 alpha 外框与衣服颜色区边界不是同一回事。碗形下沿的颜色/轮廓须在真实原图中按衣摆形状判断，不能只用矩形 alpha bbox 定义。
- 当前源工程没有分别命名的 BODY/ARM/LEG 正背原始图组；正背候选使用同一类附件网格和独立实验图，需通过 runtime 实际组合验证。
- EriKari 裙摆没有可直接套用的“角度大于腿角”单一数值。后续应按 `movement/trot-*` 的实际 Spine 采样帧检查腿部扫掠范围和裙摆遮挡。
- 16.5 cm 尚未与 Spine 单位建立验证换算，所有本表像素与 Spine 单位都只描述原始素材。
