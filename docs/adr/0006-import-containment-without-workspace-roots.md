# 6. Import containment when no workspace roots exist

- Status: Accepted
- Date: 2026-11-06

## Context

`BundleBuilder` confines import candidates to the workspace so a crafted
`../..` chain can never weave files from outside the project. Until now,
`isInsideWorkspace` returned `true` when there were no workspace roots —
the single-file (workspace-less) mode had no boundary at all, and an import
closure could reach any path on disk that exists and passes the binary/size
checks. Worse, untitled documents report a placeholder `fsPath`, so their
`dirname` lands on a drive root and relative imports resolved against
arbitrary disk locations. The bundle is pasted into LLM chats, so silently
weaving unexpected files is a data-exposure hazard, not a cosmetic issue.

## Decision

- With workspace roots, nothing changes: a candidate must live inside one
  root (lexical check + symlink `realPath` check, as before).
- Without roots, the boundary is the **common ancestor of the explicit
  inputs** — files contribute their directory, directory inputs contribute
  themselves. A single-file input therefore follows imports within its own
  directory tree only; several inputs expand the boundary to the deepest
  directory containing all of them. When no common ancestor exists
  (inputs on different Windows drives), import following is disabled.
- A candidate that _is_ a filesystem root (`/`, `C:\`) is never admitted,
  regardless of the derived boundary (defense in depth).
- Inputs can set `resolveImports: false` to disable import following for
  that input alone. Untitled and other virtual documents
  (`uri.scheme !== 'file'`) set it in the command handlers.

## Consequences

- Single-file mode can no longer follow `../` imports that leave the
  file's directory. Inside a workspace — the common case — behavior is
  unchanged. The escape hatch is opening the folder as a workspace.
- Weaving unexpected disk content into a bundle now requires the file to
  be explicitly picked by the user, matching the product promise
  ("explicit picks always win").
- Escaping candidates are silent resolution misses (no skip entries),
  consistent with how non-existent candidates are treated.
- The boundary is computed once per build from the explicit inputs;
  a mixed explicit/untitled input set degrades to "no common ancestor"
  (imports off) rather than guessing a bogus boundary.
