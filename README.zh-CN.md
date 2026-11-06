# 🌾 CodeSheaf — LLM 上下文打包器

[![CI](https://github.com/tubibibo/codesheaf/actions/workflows/ci.yml/badge.svg)](https://github.com/tubibibo/codesheaf/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**把文件、选区及其导入依赖打包成 LLM 就绪的上下文——就在编辑器里完成。**
零运行时依赖，核心层单元测试语句覆盖率约 95%。

[English](README.md) · [简体中文](README.zh-CN.md)

---

_Sheaf_（麦捆）即"把散落的秸秆捆成一束"。CodeSheaf 把你正在看的代码——连同它依赖的本地文件——捆成一束干净、可直接粘贴的上下文，喂给 Claude / ChatGPT / Gemini / Cursor 等任意 AI 助手。

[Repomix](https://github.com/yamadashy/repomix) 这类仓库打包工具回答的是"如何把整个仓库交给 LLM"；CodeSheaf 回答的是你写代码时真正会遇到的问题：**"把当前文件/选区，连同真正相关的本地依赖，一起给我。"**

## ✨ 特性

- 🎯 **导入感知打包**——按可配置深度跟随本地导入闭包（TypeScript/JavaScript、Python、Java、Go、C/C++）。TypeScript/JavaScript 仅跟随相对导入，不解析 `tsconfig` 的 `paths`/`baseUrl` 别名（如 `@/`、`~/`）；裸包名和 URL 会被跳过。
- 📋 **一个命令搞定**——活动文件、当前选区、或资源管理器多选文件/文件夹（文件夹自动展开并按 gitignore 裁剪）。
- 📊 **实时 token 表**——状态栏实时显示当前文件/选区的估算 token；每个打包结果也自带估算。
- 📐 **三种输出格式**——Markdown（围栏代码块 + 文件树）、XML（CDATA 安全、属性转义）、纯文本。
- 🛡️ **安全的文件挑选**——遵守 `.gitignore` 与自定义排除规则；二进制与超限文件按精确原因跳过；显式选择的文件永远保留（你点名要的，就给你）。
- 🔍 **粘贴前预览**——把最终打包文本在单独的编辑器标签页中打开检查，而不是直接进剪贴板。
- 🧪 **可信的核心**——六边形架构，ESLint 强制核心层禁用 `vscode`；144 个单元测试；core/application 层语句覆盖率约 95%；**零运行时 npm 依赖**（.vsix 仅约 63 KB）。

## 🚀 安装

**通过 VSIX 安装**（无需市场账号）：

```bash
npx @vscode/vsce package        # 生成 codesheaf-<version>.vsix
code --install-extension codesheaf-1.0.0.vsix
```

**从源码运行**：

```bash
git clone https://github.com/tubibibo/codesheaf.git
cd codesheaf && npm install
# 在 VS Code 中按 F5 启动扩展开发宿主
```

## 📖 使用

1. 打开任意源码文件——看状态栏：`$(sparkle) ~1.2k`。
2. `Ctrl+Shift+P` → **CodeSheaf: Copy Active File + Import Dependencies**。
3. 粘贴到 AI 对话框。打包结果自带文件树、路径标题、带语言标签的代码围栏和 token 统计行。

完整命令与设置说明见 [docs/user-guide.md](docs/user-guide.md)。

| 命令                                     | 作用                                         |
| ---------------------------------------- | -------------------------------------------- |
| `Copy Active File as Context`            | 打包活动文件（按设置跟随导入）。             |
| `Copy Active File + Import Dependencies` | 保证导入深度 ≥ 3。                           |
| `Copy Selection as Context`              | 只打包选中行（导入仍按整个文件解析）。       |
| `Preview Context Bundle (Active File)`   | 在编辑器标签页预览，不进剪贴板。             |
| `Copy as LLM Context`                    | 资源管理器多选；文件夹展开并按忽略规则裁剪。 |

## ⚙️ 设置（节选）

| 设置                          | 默认值                            |
| ----------------------------- | --------------------------------- |
| `codesheaf.format`            | `markdown`（另有 `xml`、`plain`） |
| `codesheaf.maxImportDepth`    | `3`（0 为关闭导入跟随）           |
| `codesheaf.maxFileSizeKB`     | `256`                             |
| `codesheaf.respectGitignore`  | `true`                            |
| `codesheaf.exclude`           | 构建/锁文件通配规则               |
| `codesheaf.statusBar.enabled` | `true`                            |

## 🏗️ 架构

六边形（端口-适配器）架构 + 显式应用层——核心层不接触 `vscode`（由 ESLint 强制），因此全部逻辑可在纯 Node 中单元测试：

```
src/
├── core/           # 纯净的领域层 + 服务层 + 端口层（无 vscode、无依赖）
│   ├── domain/     #   ContextBundle、BundleOptions、InputRef 等
│   ├── services/   #   BundleBuilder、ImportScanner、Formatter、
│   │               #   IgnoreMatcher、TokenEstimator、TreeRenderer
│   ├── ports/      #   FileSystem、Workspace、Clipboard、Config 等
│   └── utils/      #   注释剥离、二进制嗅探、glob 等
├── application/    # 用例层：copyAsContext、previewAsContext
├── adapters/       # 每个端口一个适配器 + 命令处理 + 状态栏
├── composition/    # container.ts —— 唯一的组合根
└── extension.ts    # 仅负责激活/停用
```

详细图文：[docs/architecture.md](docs/architecture.md) · 决策记录：[docs/adr/](docs/adr/) · 选题调研：[docs/research.md](docs/research.md)

## 🧑‍💻 开发

```bash
npm install
npm run build           # typecheck + lint + test + compile + smoke
npm run package         # 追加 .vsix 打包
npm run test:coverage   # 带覆盖率门槛（80/75/80/80）的测试
npm run test:watch      # 修改核心时的快速反馈
```

欢迎贡献，见 [CONTRIBUTING.md](CONTRIBUTING.md)。架构规则（核心纯净、零运行时依赖）由 CI 强制执行。
漏洞报告方式见 [SECURITY.md](SECURITY.md)，参与社区请遵守[行为准则](CODE_OF_CONDUCT.md)。

## 🗺️ 路线图

- [ ] 更多语言策略（Rust、C#、Ruby）——每种语言一个类
- [ ] 提示词模板（系统前言 / 任务包装）
- [ ] 按文件 token 预算与自动裁剪
- [ ] Web/Remote 支持审计

## 📄 许可证

[MIT](LICENSE) © 2026 CodeSheaf Contributors

## 🙏 致谢

灵感来自优秀的 CLI 打包工具 [Repomix](https://github.com/yamadashy/repomix) 与 [code2prompt](https://github.com/mufeedvh/code2prompt)——它们验证了方向；CodeSheaf 把这件事带进了编辑器。
