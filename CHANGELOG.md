# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Import candidates are now confined even when no workspace roots exist
  (single-file mode): the boundary is the explicit inputs' common ancestor,
  and filesystem roots are never admitted as candidates. Previously the
  import closure could reach any path on disk in that mode. Untitled and
  other virtual documents no longer resolve import declarations at all
  (see ADR-0006).

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
