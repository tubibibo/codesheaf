# ADR-0007: Menu visibility and the flagship keybinding

## Status

Accepted

## Date

2026-11-09

## Context

The historical audit (CS-P3-02) flagged that the Explorer `copyFiles` and
Editor `copyFile` context-menu entries had no `when` conditions, so
"Copy as LLM Context" appeared on every resource — search results, timeline
entries, virtual documents — including places where it cannot work. The
first remediation pass documented the choice ("visible for all file types")
in the user guide instead of the ADR sequence, which left a product decision
outside the decision log and invited it being "fixed" by accident later.

Two refinements became possible without overturning that decision:

1. The risk was never _file types_ — it was _resource schemes and views_
   where the command is meaningless (a virtual document has no real path for
   the Explorer command; search-result rows are not workspace files).
2. The flagship command (`copyFileWithImports`, the one the 30-second
   workflow recommends) was reachable only via the Command Palette, while
   the guide told users to "right-click → CodeSheaf" — where it was absent.

## Decision

- **Scheme narrowing, not language filtering.** Editor context entries
  (`copyFile`, `copyFileWithImports`) carry
  `when: resourceScheme == file || resourceScheme == untitled`; the Explorer
  entry (`copyFiles`) carries `when: explorerResourceIsFolder || resourceScheme == file`.
  Every file _type_ remains eligible, preserving the documented
  "visibility does not mean inclusion" semantics and the precise per-file
  skip reasons as the boundary.
- **`copyFileWithImports` joins the Editor context menu** (same
  `9_codesheaf` group) so the guide's instruction matches reality.
- **One default keybinding only**: `Ctrl+Alt+C` (`Cmd+Alt+C` on macOS) for
  `copyFileWithImports`, gated by `editorTextFocus` so terminal and other
  surfaces keep the chord. Other commands stay unbound — default keybindings
  are a scarce, conflict-prone resource.

## Consequences

- The menu no longer appears on resources where clicking it could only
  produce a warning or a surprising result.
- `editorTextFocus` means the keybinding does not fire when focus is
  elsewhere (output panel, terminal); the Command Palette path always works.
- The decision now lives in the ADR sequence; the user guide references it
  instead of restating the rationale.
- Rejected alternatives: filtering menu entries by
  `resourceLangId`/extension (would contradict the all-types decision and
  hide the precise skip reasons from users who want them); binding more
  commands (chord conflicts for marginal gain); leaving the menus
  un-narrowed (the scheme cases are unambiguous losses with no upside).
