# 独立运行环境与本地数据

当前操作步骤统一见根目录使用说明.md，制作规则见QUALITY/TEXTURE当前014节，准确版本见versions.toml。此目录不携带个人环境、照片、登录或试验数据。

受控：versions、许可清单、Python/JS依赖清单与锁文件、runtime/config白名单样例和实验参数。Python/uv/Node/pnpm版本固定；bootstrap --install默认离线，--online显式允许下载锁定依赖，不调用模型，不升级全局工具。离线模式缓存缺失明确失败。

本地不提交：python/.venv、js/node_modules、cache、tmp、bin、js/runtime、work、data、output、logs、secrets、vendor-untracked、config/local.toml。路径由工具根解析，不依赖父AI City workspace。原始参考与固定母版已在工具根references/spine，默认优先读取；随包带原工程、贴图、原许可证和逐文件SHA。旧vendor-untracked/reference-library及相邻library仅兼容既有本机，不是新装前置。

订阅用本人codex login；工具只调用官方原生CLI，不复制auth.json或系统凭证。launch.py --subscription复用本人登录并自动初始化/启用本地配置，保留已有预算与预留；页面默认沿用已启用通道，点击制作前0模型调用。configure_subscription.py仍供高级维护。源样例默认live_enabled/upload_consent=false。照片、原返回、角色上下文、预留索引都在本地，预留不等于订阅剩余余额，未知不自动重发。

当前每人物一持久会话，原照/设计SHA绑定；衣身腿使用部件作用域参考，标准腕/小耳本地非AI。原耳槽隐藏，逐侧照片事实决定遮耳或小耳对，前后共同冻结耳根。规范与质量批准不能由配置开关代替。

包内不含本人的案例网页数据；通用ui源码保留，新安装列表为空。公开打包使用DISTRIBUTION白名单和package_release.py；maintenance的SOURCE包同用该白名单，PRIVATE_BACKUP不能公开。运维细节见docs/OPS.md。环境/246帧/辅助PASS不等于整人物生产批准，整体限制见docs/RELEASE_STATUS.md。
