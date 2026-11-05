# 5. Gitignore-subset matcher instead of a full spec library

- Status: Accepted
- Date: 2026-11-05

## Context

Ignore support needs to understand `.gitignore` files and user globs. The
full gitignore spec (nested `.gitignore` files, `core.excludesFile`,
trailing-space rules, `**` edge cases) is large; popular npm implementations
exist but would break the zero-runtime-dependency rule (ADR-0002).

## Decision

`IgnoreMatcher` implements a pragmatic subset: comments, blank lines,
negation (`!`), directory-only patterns (trailing `/`), root anchoring
(leading/inner `/`), and `**`, `*`, `?`, `[...]` wildcards. Matching walks a
path and each ancestor directory with last-rule-wins semantics, mirroring how
git prunes excluded directories. Only root-level `.gitignore` files are read;
user exclude globs are merged **after** gitignore rules so explicit
configuration wins ties.

## Consequences

- One ~150-line dependency-free module with 11 focused tests.
- Nested `.gitignore` files and exotic git semantics are not supported —
  documented in the user guide; the escape hatch is `codesheaf.exclude`.
  Only the top-level `.gitignore` of each workspace root is read, and each
  root's rules are scoped to that root (a `WorkspacePort.rootFor` lookup),
  so anchored patterns in one multi-root folder cannot prune another.
- Explicitly picked files bypass ignore rules entirely (product decision:
  a user-chosen file is never silently dropped).
- Known divergence from git, negation re-inclusion: with `dist/` +
  `!dist/keep.js`, git keeps all of `dist/` excluded (it never descends
  into an excluded directory), while our per-path walk re-includes
  `keep.js` because last matching rule wins per path. Arguably the more
  useful behavior for a bundler; recorded here so nobody mistakes it for
  a bug.
- Known divergence from git, directory-only patterns: a trailing-slash
  pattern does not match the directory's own path
  (`isIgnored('node_modules')` is `false` when the path is evaluated as a
  file), so expansion still lists that directory once before pruning its
  files individually. Correctness is unaffected — every file inside is
  still matched — only one extra directory listing is spent.
