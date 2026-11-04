# 1. Record architecture decisions

- Status: Accepted
- Date: 2026-11-05

## Context

CodeSheaf will evolve through community contributions. Decisions made in
issues and pull requests evaporate unless they are written down where future
contributors will look.

## Decision

We follow [ADR (Architecture Decision Record)](https://adr.github.io/)
practice in the style popularized by Michael Nygard: every architecturally
significant decision gets a numbered, immutable document in `docs/adr/`.

## Consequences

- The `docs/adr/` directory is the logbook of _why_ the code looks the way
  it does.
- Accepted ADRs are only superseded by later ADRs, never edited away.
