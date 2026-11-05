# 2. Hexagonal architecture with zero runtime dependencies

- Status: Accepted
- Date: 2026-11-05

## Context

A bundler's value is trustworthiness: it must work identically for every
language and every host, and it must be cheap to verify. Two risks dominate:

1. **Platform coupling** — logic entangled with the VS Code API cannot be
   unit-tested quickly and cannot be reused (e.g. a future CLI companion).
2. **Supply-chain risk** — a tool that reads your source code and ships it to
   your clipboard should not carry transitive npm dependencies.

## Decision

- Strict hexagonal layering: `src/core` (domain + services + ports) and
  `src/application` (use cases) never import `vscode` or adapters;
  `src/adapters` implements ports; `src/composition/container.ts` is the
  single composition root; `src/extension.ts` only activates.
- The rule is **enforced by ESLint** `no-restricted-imports`, not by
  convention alone.
- **Zero runtime npm dependencies**: everything (gitignore matching, token
  estimation, import scanning) is implemented in-repo against node built-ins.
  All npm packages are dev-only tooling.

## Consequences

- 100% of the logic is unit-testable in plain Node (117 tests, no editor).
- `npm install --production` is a no-op; the packaged .vsix is ~61 KB.
- We own small utilities that libraries could provide — accepted, and each
  has focused tests and an ADR when the trade-off is non-obvious.
