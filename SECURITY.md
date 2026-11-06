# Security Policy

## Supported versions

Security fixes are prepared on `main` for the current `1.0.x` release line.
Older versions are not maintained; update to the latest available release.

## Reporting a vulnerability

Please do **not** post exploit details, private code, credentials, or bundled
project contents in a public issue.

- If this repository offers **Security → Report a vulnerability**, use that
  private reporting channel to contact the maintainers.
- Otherwise, open an issue asking for a private contact channel without
  including vulnerability details. Share the report only after a private
  channel has been agreed.

Include the affected version, a minimal reproduction using non-sensitive
fixtures, the expected and actual behavior, and the potential impact.
We aim to acknowledge reports within **7 days**. Fix timing depends on the
severity and complexity; coordinated disclosure and credit will be agreed
with the reporter.

## Scope

CodeSheaf reads selected files, editor buffers, and local import dependencies
and writes the resulting context to the clipboard or a preview editor. It
has zero runtime npm dependencies and does not upload bundles or execute
project source code. Review the bundle before sharing it with another tool.

Reports about unexpected file inclusion, workspace-boundary escapes, or
extension-host failures caused by crafted input are particularly useful.
