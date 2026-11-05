# Contributing to CodeSheaf

Thanks for considering a contribution! This project keeps a high bar on
architecture so it stays trustworthy — please read the rules below before
opening a PR.

## Development setup

```bash
git clone https://github.com/tubibibo/codesheaf.git
cd codesheaf
npm ci            # lockfile-tracked install (npm install also works)
npm run build     # typecheck + lint + tests + compile
```

Useful scripts:

| Script                              | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `npm test` / `npm run test:watch`   | Unit tests (vitest).                      |
| `npm run test:coverage`             | Tests with coverage gates.                |
| `npm run lint`                      | ESLint (includes the architecture guard). |
| `npm run format`                    | Prettier.                                 |
| `npm run compile` / `npm run watch` | Build to `out/`.                          |
| `npm run package`                   | Full pipeline + `.vsix` packaging.        |

Debugging in the editor: press **F5** ("Run CodeSheaf Extension").

## Architecture rules (enforced by CI)

1. **Layering is law.** `src/core/**` and `src/application/**` must never
   import `vscode` or `src/adapters/**`. ESLint fails the build if they do —
   see [docs/architecture.md](docs/architecture.md).
2. **Adapters stay thin.** New behavior belongs in the core or application
   layers; adapters translate, they do not think.
3. **Zero runtime dependencies.** New npm packages are allowed only as
   devDependencies. Implement small utilities in `src/core/utils` with tests.
4. **Every language strategy needs tests** — see
   `src/core/services/scan/strategies/` for the pattern.
5. **Architecturally significant decisions need an ADR** in `docs/adr/`
   (next free number, never edit an accepted ADR).

## Commits and PRs

- Use [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Keep PRs focused; the PR template includes the checklist CI cares about.
- Bump the version and update `CHANGELOG.md` in the same PR when behavior
  changes.

## Reporting issues

Use the issue templates. For bundle surprises (missing file, wrong skip
reason), include the `CodeSheaf` output-channel log — it names every skip
and reason.
