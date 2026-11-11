# 🌾 CodeSheaf — LLM Context Bundler

[![CI](https://github.com/tubibibo/codesheaf/actions/workflows/ci.yml/badge.svg)](https://github.com/tubibibo/codesheaf/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Bundle files, selections and their import dependencies into LLM-ready
context — right from your editor.** Zero runtime dependencies. Fully
unit-tested core.

[English](README.md) · [简体中文](README.zh-CN.md)

---

A _sheaf_ is a bundle of stalks tied together. CodeSheaf ties the exact code
you're looking at — plus the local files it depends on — into one clean,
paste-ready bundle for Claude, ChatGPT, Gemini, Cursor, or any AI assistant.

Repo packers like [Repomix](https://github.com/yamadashy/repomix) answer
_"how do I hand my whole repository to an LLM?"_ CodeSheaf answers the
question you actually have mid-edit: **"give me this file / selection, plus
exactly the local dependencies that matter."**

## ✨ Features

- 🎯 **Import-aware bundling** — follows local import closures
  (TypeScript/JavaScript, Python, Java, Go, C/C++) to a configurable depth.
  TypeScript/JavaScript following resolves `tsconfig` `paths`/`baseUrl`
  aliases such as `@/` and `~/` from each workspace root's `tsconfig.json`
  (literal and single-star patterns; the `extends` chain and nested
  tsconfigs are not followed — see ADR-0009). Bare package names and URLs
  are skipped.
- 📋 **Everything is one command** — active file, current selection, or
  multi-select files/folders in the Explorer (folders expand with
  gitignore pruning).
- 📊 **Live token meter** — the status bar shows a running estimate for the
  active file or selection; every bundle reports its own estimate.
- 📐 **Three output formats** — Markdown (fenced code blocks + file tree),
  XML (CDATA-safe, attribute-escaped), and plain text.
- 🛡️ **Safe picking** — honors `.gitignore` plus your exclude globs; skips
  binaries, non-UTF-8 files, and oversized files with a precise per-file
  reason; explicit picks always win (you asked for that file, you get it).
- 🛡️ **Secret warning before you paste** — a conservative, zero-dependency
  scan flags likely credentials (AWS/GitHub/Slack/Google/OpenAI keys, private
  key blocks, credential-shaped assignments) and asks for confirmation before
  a flagged bundle reaches the clipboard; false positives are answered with
  one **Copy anyway** click.
- 🔍 **Preview before you paste** — render the exact bundle into a separate
  editor tab instead of the clipboard; the preview also lists every skipped
  file and why, so you can review what an LLM would (and would not) receive.
- 🧪 **Trustworthy core** — hexagonal architecture with the `vscode` ban on
  the core enforced by ESLint; 155 unit tests; ~96% statement coverage over
  the core/application layers;
  **zero runtime npm dependencies** (the .vsix is ~65 KB).

## 🚀 Install

**Fastest path — download a ready-made VSIX from CI**: open the repo's
[Actions](https://github.com/tubibibo/codesheaf/actions) tab, click the latest
green run on `main`, and download the `codesheaf-vsix` artifact (GitHub login
required), then:

```bash
code --install-extension codesheaf-<version>.vsix
```

**Build the VSIX locally** (no marketplace account needed):

```bash
git clone https://github.com/tubibibo/codesheaf.git
cd codesheaf && npm install && npm run compile
npx @vscode/vsce package        # produces codesheaf-<version>.vsix
code --install-extension codesheaf-*.vsix
```

**From source**:

```bash
git clone https://github.com/tubibibo/codesheaf.git
cd codesheaf && npm install
# Press F5 in VS Code to launch an Extension Development Host
```

## 📖 Usage

1. Open a source file — watch the status bar: `$(sparkle) ~1.2k`.
2. `Ctrl+Shift+P` → **CodeSheaf: Copy Active File + Import Dependencies**.
3. Paste into your AI chat. The bundle arrives with a file tree, path
   headers, language-tagged fences, and a token line.

Full command and settings reference: [docs/user-guide.md](docs/user-guide.md).

| Command                                  | Does                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `Copy Active File as Context`            | Active file (+ imports per settings).                                |
| `Copy Active File + Import Dependencies` | Guarantees import depth ≥ 3.                                         |
| `Copy Selection as Context`              | Just the selected lines (imports still resolved from the full file). |
| `Preview Context Bundle (Active File)`   | Opens the bundle in a separate editor tab (no clipboard write).      |
| `Copy as LLM Context`                    | Explorer multi-select; folders expand, ignore-pruned.                |

## ⚙️ Settings (highlights)

| Setting                       | Default                                    |
| ----------------------------- | ------------------------------------------ |
| `codesheaf.format`            | `markdown` (`xml`, `plain` also available) |
| `codesheaf.maxImportDepth`    | `3` (0 disables import following)          |
| `codesheaf.maxFileSizeKB`     | `256`                                      |
| `codesheaf.respectGitignore`  | `true`                                     |
| `codesheaf.exclude`           | build/lockfile globs                       |
| `codesheaf.statusBar.enabled` | `true`                                     |

## 🏗️ Architecture

Hexagonal (ports & adapters) with an explicit application layer — the core
never touches `vscode`, enforced by lint, so all logic is unit-testable in
plain Node:

```
src/
├── core/           # pure domain + services + ports (no vscode, no deps)
│   ├── domain/     #   ContextBundle, BundleOptions, InputRef, ...
│   ├── services/   #   BundleBuilder, ImportScanner, Formatter,
│   │               #   IgnoreMatcher, TokenEstimator, TreeRenderer
│   ├── ports/      #   FileSystem, Workspace, Clipboard, Config, ...
│   └── utils/      #   comment strippers, binary sniff, globs
├── application/    # use cases: copyAsContext, previewAsContext
├── adapters/       # one adapter per port + command handlers + status bar
├── composition/    # container.ts — the single composition root
└── extension.ts    # activation/teardown only
```

Details and diagrams: [docs/architecture.md](docs/architecture.md) ·
Decision log: [docs/adr/](docs/adr/) · Direction research:
[docs/research.md](docs/research.md)

## 🧑‍💻 Development

```bash
npm install
npm run build           # typecheck + lint + test + compile + smoke
npm run package         # + .vsix packaging
npm run test:coverage   # tests with the coverage gates (80/75/80/80)
npm run test:watch      # fast feedback while hacking on the core
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The
architecture rules (core purity, zero runtime deps) are enforced in CI.
Security reports follow [SECURITY.md](SECURITY.md); participation follows
the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## 🗺️ Roadmap

- [ ] Additional language strategies (Rust, C#, Ruby) — one class each
- [ ] Prompt templates (system-preamble / task wrapper)
- [ ] Per-file token budgets with automatic trimming
- [ ] Web/remote support audit

## 📄 License

[MIT](LICENSE) © 2026 CodeSheaf Contributors

## 🙏 Acknowledgments

Inspired by the excellent CLI packers —
[Repomix](https://github.com/yamadashy/repomix) and
[code2prompt](https://github.com/mufeedvh/code2prompt) — which proved the
direction; CodeSheaf brings it inside the editor.
