# 3D 御茶ノ水街景

平板与 `/city` 的街景来自用户提供的 Blender 场景 `School.blend`（场景 `Ochanomizu`，约 790 × 730 m，42 万面），由 three.js 以固定的西北方向正交视角渲染。2.5D 插画街景已停用。

## 重新导出

在本机 Blender（5.x，无需网络、不调用付费服务）执行：

```bash
blender -b School.blend -S Ochanomizu --python scripts/blender/export-ochanomizu.py -- apps/web/public/city3d
```

约 15 秒，输出到 `apps/web/public/city3d/`：

| 文件 | 内容 |
| --- | --- |
| `city.glb` | 静态场景（约 30 MB，未压缩）；建筑的 `base_z`、`name_ja` 作为 glTF extras |
| `vehicles.glb` | JR 中央线·总武线、丸ノ内线与汽车，Follow Path 动画烘焙为 40 秒循环 |
| `materials.json` | Blender 程序化材质的颜色与图案尺寸，由 `packages/city/src/materials.ts` 在着色器中重建 |
| `nav.bin` | 1 m 步行网格：每格类型（人行道、空地、草地、支路、主路、不可走）与高度（cm） |
| `places.json` | 网格范围、车辆循环长度，以及从店面雨棚找出的 215 处店铺位置与朝向 |

隐藏集合（导航网格、地下、路径、控制器）不导出。地下铁隧道等不可见物体不进入网页。

## 运行时

- 坐标：x 向东、y 向南（Blender 的 −Y）、高度向上，单位米。
- `mergeCity` 按材质合并约 1000 个网格为约百个 draw call；建筑按名称得到稳定的随机色调。
- 居民为面向镜头的 SVG 插画精灵，被建筑遮住时以半透明身影显示；放大展示中的居民总在最前。
- 居民沿步行网格 A* 走到地标（JR 两个出口、两座桥、ソラシティ、ニコライ堂、湯島聖堂、明治大学等）或店铺门前。
- 嵌入贴图通过 `<img>` 加载以符合 CSP 的 `connect-src 'self'`。

## 已知限制

- `city.glb` 未压缩；量化或 meshopt 压缩需额外工具，尚未加入。
- 目标平板的帧率、内存与长时间运行尚未实测。
- 居民之间没有避让；车辆按烘焙路径行驶，不会因行人或信号停车。
