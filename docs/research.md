# Direction research (2026-11-05)

This file records the market research performed before a line of code was
written, so the choice of direction is auditable.

## Candidate evaluation

| Direction                | Evidence found                                                                                                                                                                                                              | Verdict                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| LLM code-context tooling | [Repomix](https://github.com/yamadashy/repomix) ≈ 28k★ — packs a repo into AI-friendly files; [code2prompt](https://github.com/mufeedvh/code2prompt) — Rust CLI with templating and token counting; both are **CLI-first**. | ✅ Hot direction, clear gap for an editor-native take |
| Chrome MV3 extensions    | Crowded (ad blockers, downloaders); testing story weaker than VS Code's.                                                                                                                                                    | ❌ Rejected                                           |
| Obsidian plugins         | Healthy niche, but the developer-tooling audience is smaller than VS Code's.                                                                                                                                                | ❌ Rejected                                           |
| JetBrains plugin         | A [Code2Prompt IntelliJ plugin](https://plugins.jetbrains.com/plugin/26440-code2prompt) exists with tiny adoption; VS Code side has no dominant equivalent.                                                                 | ❌ Rejected (platform)                                |

## The gap CodeSheaf fills

Existing packers answer _"how do I hand my whole repository to an LLM?"_
They are terminal tools, run out-of-band, and bundle blindly (whole repo or a
tree). The daily developer question is different:

> "I'm looking at this file / selection right now — give me **it plus exactly
> the local dependencies that matter**, in a format any chat can use."

That is an editor-native problem: it needs the active editor, the selection,
the Explorer multi-select, and a live token meter. CodeSheaf is that VS
Code-native layer on top of the same hot direction.

## Naming due diligence

Names were checked before adoption; earlier candidates were all taken:

- `contextforge` — taken (IBM's [mcp-context-forge](https://github.com/IBM/mcp-context-forge) and several MCP projects)
- `contextloom` / `ContextLoom` — taken (a prompt version-control product, contextloom.ai)
- `ctxpack` — taken by multiple repos (e.g. [marcelogdomingues/ctxpack](https://github.com/marcelogdomingues/ctxpack))
- `codesheaf` — **no package, repo, or extension found**; adopted. _Sheaf_ = a
  bundle of stalks tied together, which is exactly what the tool does.

## Sources

- [Repomix](https://github.com/yamadashy/repomix) (~28k★) and [repomix.com](https://repomix.com)
- [code2prompt](https://github.com/mufeedvh/code2prompt) / [code2prompt.dev](https://code2prompt.dev)
- [Code2Prompt for IntelliJ](https://plugins.jetbrains.com/plugin/26440-code2prompt)
- [CyberChitta's roundup of code packers for LLM chats](https://www.cyberchitta.cc/articles/lc-alternatives.html)
- [16x Prompt CLI tools collection](https://prompt.16x.engineer/cli-tools)
