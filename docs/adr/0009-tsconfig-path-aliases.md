# 9. tsconfig path aliases for TypeScript import following

- Status: Accepted
- Date: 2026-11-11

## Context

Modern TypeScript projects import through path aliases — `@/components/button`,
`~/utils` — defined in `tsconfig.json` `paths` (+ `baseUrl`). The heuristic
scanner of ADR-0003 followed only relative specifiers, so those closures were
silently incomplete: the alias limitation sat in the README, the user guide,
and the import-scanning backlog from the start. A full TypeScript compiler
API integration would mean weight and dependencies this project refuses
(ADR-0002), but `paths` matching by itself is a small, pure computation.

## Decision

- A pure module (`core/services/scan/tsconfig-aliases.ts`) parses a
  tsconfig.json text and matches specifiers. Supported: **literal patterns**
  (`@utils`) and **single-star patterns** (`@/*`) — the entire grammar the
  tsconfig spec allows — plus `baseUrl`; the mapping base directory is
  `baseUrl` when set, else the tsconfig's own directory (TypeScript 4.1+
  semantics). Multiple targets per pattern are kept in tsconfig order.
- Only the **root `tsconfig.json` of each workspace folder** is read — one
  lazily cached read per root per build. The `extends` chain and nested
  (per-directory) tsconfigs are **not followed**: following them means
  transitive file IO and multi-file merge semantics for a rare setup, and a
  wrong merge would be silent. Projects that centralize `paths` in a shared
  base config keep the old behavior and the documented limitation.
- Parsing is tolerant of real-world JSONC (C-style comments via the existing
  string-aware stripper, trailing commas via a second string-aware scanner —
  never a regex, which would corrupt string literals containing `, ]`).
  Anything still unparseable returns `undefined` and the builder falls back
  to the previous skip-the-alias behavior; a broken tsconfig never fails a
  bundle.
- `matchAlias` only sees non-relative specifiers. Bare package names match no
  pattern (unless a tsconfig declares a catch-all `*`, which is the user's
  explicit choice) — third-party skipping of ADR-0003 is intact.
- Alias targets become ordinary **absolute candidates** and pass every
  existing gate: workspace containment with real-path checking (ADR-0006),
  gitignore and exclude rules, binary/size/encoding checks. A `paths` entry
  pointing outside the workspace is rejected exactly like a crafted
  `../..` chain. Without workspace roots (single-file / untitled mode) no
  aliases resolve at all.
- Kill switch: `codesheaf.resolveTsconfigAliases` (default `true`), read
  through the guarded configuration port like every other setting.

## Consequences

- The common single-root, root-tsconfig setup now weaves complete alias
  closures; multi-root workspaces use each root's own map and never leak one
  root's aliases into another's files.
- The "aliases are not resolved" limitation is lifted from the README and
  user guide; the `extends`/nested-tsconfig gap is documented in their place.
- The strategy interface gained an optional context parameter
  (`ImportScanContext`); other language strategies ignore it, so no existing
  scanner behavior changes.
- Candidate volume grows slightly (each mapped specifier probes the usual
  extension/index variants), but candidates that do not exist are silent
  misses by design, so there is no new user-facing noise.
- **Match order follows tsc, not declaration order** (post-review note):
  tsc resolves a specifier against `paths` by specificity — the pattern
  with the longest literal prefix before its `*` wins. `matchAlias`
  therefore sorts patterns by that specificity (stable, so ties keep
  declaration order) instead of iterating the parsed key order.
