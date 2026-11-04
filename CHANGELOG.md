# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- 80 unit tests covering the core and application layers; CI on Node 20/22
  with coverage gates; zero runtime npm dependencies.
