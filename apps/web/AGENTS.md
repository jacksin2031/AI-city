# A 参与流程与服务边界

读取根 AGENTS 和 `docs/CONTRACTS.md`。A 负责本目录中除 `app/city` 以外的参与端、服务端与管理流程。当前 `/join` 不收集照片，后续实现须先完成授权、文件校验和私有存储规则测试。所有可见文案使用日语。

不要在服务端静态 import Phaser。不要从客户端调用 Gemini 或信任客户端传入的同意标记作为授权依据。生产构建与 health mock 状态需要保持真实。
