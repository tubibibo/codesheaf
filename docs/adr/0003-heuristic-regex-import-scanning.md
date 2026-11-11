# 3. Heuristic regex import scanning

- Status: Accepted
- Date: 2026-11-05

## Context

Following import closures requires parsing imports for multiple languages.
Full parsers (TypeScript compiler API, tree-sitter grammars) would be heavy,
would add native/binary dependencies, and differ per language.

## Decision

Each language gets a small **strategy** class using regex extraction over
comment-stripped, string-aware source text (see `stripCStyleComments` /
`stripHashComments`). Resolution is deliberately conservative:

- TypeScript/JavaScript: only relative specifiers are followed; bare package
  names and URLs are third-party by definition.
- Candidates are **probed against the file system** — non-existent paths are
  silently dropped, which excludes stdlib/third-party names for free.
- Missing resolution variants (`.tsx`, `/index.ts`, …) produce no user-facing
  noise; only existing-but-unweavable files are recorded as skips.

## Consequences

- One class + one registry entry + tests = a new language. No new deps.
- Known limitation: exotic syntax (macro-generated imports, non-standard
  loaders) can be missed. The failure mode is _fewer files in the bundle_,
  never a wrong or crashing bundle — acceptable for a heuristic helper.
- Known limitation (Python): triple-quoted strings are not tracked as
  strings by the hash-comment stripper — an import-looking line inside a
  docstring can be scanned and, if a matching file exists, woven into the
  bundle. Accepted: writing real imports inside docstrings is vanishingly
  rare, and fixing it properly means a Python-aware tokenizer.
- Known limitation (all string-aware strippers): string literal _contents_
  are preserved verbatim by design (`stripCStyleComments` /
  `stripHashComments` keep every character inside quotes so offsets and
  line structure survive), and the extraction regexes then run over that
  text. An import-shaped fragment _inside_ a string literal — a code
  template, a generated snippet, a fixture containing `from "./ghost"` —
  can therefore be extracted as if it were a real import and, when a file
  happens to exist at that path, woven into the bundle. Recorded here
  deliberately without a behavior change: suppressing it means tracking
  string state through every language's literal grammar (escapes, template
  interpolation, raw strings) — a per-language tokenizer, which is an
  L-sized follow-up, not a patch. The failure mode is an occasional extra
  _local_ file in the bundle, never a crash and never anything outside the
  workspace (containment still applies).
- Known limitation (.vue/.svelte): HTML comments (`<!-- ... -->`) are not
  stripped by the C-style stripper, so an import written inside one could
  be scanned. Accepted for now — removing it requires passing the language
  id into every strategy and a second stripper, for a rare failure mode.
- Update (ADR-0009): the "only relative specifiers are followed" decision
  above is refined — tsconfig `paths`/`baseUrl` aliases (literal and
  single-star patterns, each workspace root's own tsconfig only, no
  `extends` chain) now resolve through `matchAlias`. Bare package names and
  URLs remain skipped exactly as before.
- Import scans use the **full file content**, not the selection slice, so a
  deep selection still pulls its dependencies.
