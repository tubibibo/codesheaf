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
- Import scans use the **full file content**, not the selection slice, so a
  deep selection still pulls its dependencies.
