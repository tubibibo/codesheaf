# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-12

### Fixed

- Files whose bytes are not valid UTF-8 (GBK/GB18030 legacy files, for
  example) are now skipped with a precise `encoding` reason. Previously they
  were decoded non-strictly, silently replacing every invalid sequence with
  U+FFFD and weaving mojibake into the bundle. UTF-16 files (BOM-detected)
  are unaffected.
- Mistyped `codesheaf.exclude` entries (numbers, objects) no longer crash
  the bundle mid-build, and mistyped boolean settings (`"off"` stored as a
  string used to count as truthy and _enable_ the feature it was meant to
  disable) now fall back to their documented defaults — the same guard
  class as the 1.0 numeric fix. The status-bar toggle reads through the
  same guarded configuration port.

### Added

- Optional estimated-token budget (`codesheaf.maxTotalTokens`, default `0` =
  unlimited): once the running estimate reaches the budget, further
  discovered files — directory expansion and the import closure, in
  breadth-first admission order — are skipped as `limit-reached`. Explicit
  picks are never withheld.
- Optional task reminder (`codesheaf.taskHeader`, default empty) rendered
  after the title line in every format: a markdown quote block, an XML
  `<task>` element, or a plain `TASK:` block.
- `Preview Context Bundle (Explorer Selection)`: the same Explorer
  multi-select inputs as _Copy as LLM Context_, opened as a preview tab
  instead of copied.
- `Copy as Context (Choose Format)…`: a QuickPick of markdown / XML / plain
  overrides the configured format for a single copy; Esc cancels.
- tsconfig path aliases are resolved when following TypeScript/JavaScript
  imports: each workspace root's own `tsconfig.json` (`paths` + `baseUrl`,
  literal and single-star patterns) now maps `@/…`- and `~/…`-style
  specifiers onto local candidates, which still pass every containment and
  ignore gate. The `extends` chain and nested tsconfigs are not followed,
  single-file mode resolves no aliases, and an unreadable tsconfig silently
  keeps the previous skip behavior. Switch it off with
  `codesheaf.resolveTsconfigAliases`; see
  [ADR-0009](docs/adr/0009-tsconfig-path-aliases.md).
- Secret scanning before a bundle reaches the clipboard (`codesheaf.secretScan`,
  default `warn`): a conservative, zero-dependency scan for common credential
  patterns (AWS/GitHub/Slack/Google/OpenAI keys, private key blocks,
  credential-shaped assignments). A flagged copy shows a modal confirmation —
  **Copy anyway** proceeds, **Cancel** copies nothing and points at Preview;
  flagged previews open anyway with a summary warning. Findings report only
  rule, file, and line — never the matched text. This is a conservative
  heuristic, not a Secretlint replacement; see
  [ADR-0008](docs/adr/0008-secret-scanning.md).
- Every skip and its reason is logged to the CodeSheaf output channel, and
  previews render a trailing _Skipped Files_ section (capped at 50 rows) so
  bundles can be reviewed before sharing. Clipboard copies keep the bundle
  text clean.
- The Editor context menu now offers _Copy Active File + Import
  Dependencies_, and the command has a default keybinding (`Ctrl+Alt+C`,
  `Cmd+Alt+C` on macOS).
- Context-menu entries are narrowed to the schemes where they can work:
  editor commands appear for `file` and `untitled` documents, the Explorer
  command for real files and folders. All file _types_ remain included —
  see [ADR-0007](docs/adr/0007-menu-visibility-and-keybinding.md).

### Changed

- The import-containment path geometry (common-ancestor computation) moved
  from `bundle-builder.ts` into `core/utils/ancestor-path.ts` with its own
  direct unit tests; behavior is unchanged.

## [1.0.2] - 2026-11-07

### Fixed

- Import following works on POSIX again in single-file mode. The boundary of the
  import closure is the explicit inputs' common ancestor, and that computation
  normalized absolute paths into relative ones on POSIX (the leading `/` was
  dropped), so every import candidate outside the input's own directory was
  rejected. Windows was unaffected, which is why the 1.0.1 release passed
  locally. Paths that share only a filesystem root still disable import
  following instead of admitting the whole volume.
- Import following no longer depends on how the folder was spelled. The
  real-path containment check now compares against the canonical workspace
  roots, so opening a project through an 8.3 short name or a junction (where
  `realpath` expands to the long form) keeps its imports instead of dropping
  them as if they had escaped. Symlinks pointing outside the workspace are
  still rejected, and a root that cannot be resolved falls back to the
  literal comparison.

## [1.0.1] - 2026-11-07

### Fixed

- Markdown file headings escape path syntax and contain embedded newlines without changing bundled source content.
- UTF-16BE files with a BOM are decoded as text before binary detection, matching existing UTF-16LE handling.
- Multi-root bundles qualify display paths with unique workspace-root labels so same-named files remain distinct in the file tree.
- The token meter is now owned by the extension context, including after repeated enable/disable cycles.
- Import candidates are now confined even when no workspace roots exist
  (single-file mode): the boundary is the explicit inputs' common ancestor,
  and filesystem roots are never admitted as candidates. Previously the
  import closure could reach any path on disk in that mode. Untitled and
  other virtual documents no longer resolve import declarations at all
  (see ADR-0006).
- Mistyped numeric settings (`"5"`, `"abc"`) no longer poison the bundle
  options: a non-finite `maxFileSizeKB` used to produce a NaN size cap,
  which silently disabled the limit entirely. Non-finite values now fall
  back to the documented defaults.
- Python import scanning now resolves the names of a `from ... import`
  statement: `from . import helper` offers the sibling `helper.py` (and its
  package form) in addition to the package's `__init__.py` — previously
  only the `__init__.py` was offered. Parenthesized multi-line name lists
  are parsed too, and names of dotted modules resolve as submodules.

## [1.0.0] - 2026-11-05

### Added

- Core bundle weaver: files, selections, and directories woven into a single
  LLM-ready context bundle.
- Import dependency closure with configurable depth (TypeScript/JavaScript,
  Python, Java, Go, C/C++).
- Three output formats: Markdown (fenced code blocks), XML (CDATA), and plain
  text.
- Token estimation with live status-bar readout (`$(sparkle) ~1.2k`).
- Gitignore-aware file picking: workspace `.gitignore` files plus configurable
  exclude globs; explicit file picks bypass ignore rules by design.
- Safety rails: binary sniffing, per-file size caps, directory file-count caps,
  per-file skip reasons surfaced in the result summary.
- Commands: `Copy Active File as Context`, `Copy Active File + Import
Dependencies`, `Copy Selection as Context`, `Preview Context Bundle`,
  `Copy as LLM Context` (Explorer multi-select, folders expandable).
- Hexagonal architecture: platform-agnostic `src/core` + `src/application`
  layers (enforced by ESLint), VS Code adapters, single composition root.
- 117 unit tests covering the core and application layers; CI on Node 20/22
  with coverage gates; zero runtime npm dependencies.

### Fixed

- `codesheaf.exclude` now merges with (instead of replacing) the built-in
  default excludes; user patterns come last and may negate a default
  (`!node_modules/**`).
- The status-bar token meter appears right after startup
  (`onStartupFinished` activation) and refreshes on content edits with a
  250 ms debounce; background documents never trigger a recount.
- Preview tabs use the language matching the bundle format
  (markdown/xml/plaintext) and the docs no longer claim a read-only view —
  untitled tabs are editable, which is now stated openly.
- Files explicitly picked in the Explorer bypass ignore rules, matching the
  editor commands and the README promise.
- Import candidates are confined to workspace roots in both resolution
  branches: crafted `../..` chains (absolute or root-relative — e.g. a C
  `#include "../../outside/x.h"`) can no longer weave files from outside
  the project.
- Editor commands (copy file / copy + imports / copy selection / preview)
  now weave the live editor buffer instead of the file on disk: unsaved
  changes are included, and untitled documents no longer fail with
  "nothing to copy". Explorer picks still read from disk.
- Directory traversal is bounded against symlink cycles (visited set +
  depth cap); `tsconfig.test.json` no longer inherits the `src` exclude, so
  test sources are really type-checked; CI runs `prettier --check`.
