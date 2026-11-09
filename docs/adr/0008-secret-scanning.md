# 8. Secret scanning as a warn flow before the clipboard

- Status: Accepted
- Date: 2026-11-09

## Context

CodeSheaf's whole job is sending code somewhere else, and nothing checked the
bundle for credentials before it left the machine. The exposure surface is
worse than it looks: a file explicitly picked in the Explorer **bypasses
ignore rules** by design ("you asked for that file, you get it"), so a
right-clicked `.env` sails straight into the bundle. Repo packers answer the
same risk with dedicated scanners — Repomix embeds Secretlint — but a
Secretlint-grade engine means rulesets, tuning, and dependencies, and this
project ships zero runtime dependencies.

## Decision

Scan the woven text with a small, conservative rule set
(`core/services/secret-scanner.ts`, pure functions, no IO) and make the check
a **warn flow, not a block**:

- A flagged copy shows one modal confirmation listing the finding count, the
  rule labels, and the first location. _Copy anyway_ proceeds; cancel/dismiss
  copies nothing, tells the user why, and points at Preview. A preview is
  never blocked — it is the review surface — it just carries a summary
  warning.
- **Why warn instead of block:** heuristics misfire, and a hard block on a
  false positive means lost work or a disabled feature. The failure mode of
  the modal is one extra click, never a lost bundle.
- **Why zero-dependency regexes:** the target is the most common low-level
  accidents (an `AKIA…` key, a `ghp_…` token, a `-----BEGIN … PRIVATE
KEY-----` header, a `PASSWORD=` line with a long value), not exhaustive
  coverage. Seven rule ids; `sk-` keys and assignments filter obvious
  placeholders (`changeme`, `example`, `placeholder`, `xxxx`, repeated
  characters) so test fixtures do not nag.
- **Findings never echo the matched content** — only rule, file, and line —
  so warnings, logs, and this feature's own output cannot become a new leak
  surface.

## Consequences

- The cost of a false positive is one click. Users who find the dialog too
  chatty in a repo full of fixture secrets can set `codesheaf.secretScan` to
  `off` — a deliberate, visible trade, not a silent bypass.
- Misses are expected and accepted: lowercase assignments, exotic token
  formats, and binary-encoded secrets are not covered. The docs state this
  plainly — this is a conservative heuristic, not a Secretlint replacement.
- The `NotificationPort` gained a `confirm` method (blocking question with
  buttons); adapters and fakes implement it with a modal warning dialog.
- A future `redact` mode (mask the match instead of asking) can slot into the
  same `SecretScanMode` union without touching the rule set or the use cases.
