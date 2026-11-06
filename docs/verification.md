# Verification

Run the deterministic local gates with `npm run build`. The build typechecks source
and tests, lints, runs unit tests, compiles `out/extension.js`, then runs the headless
adapter assembly smoke. CI also runs formatting and coverage checks, followed by
compilation, the same smoke, and VSIX packaging.

## Headless adapter smoke

Run `npm run compile && npm run test:smoke` from the repository root. The script
copies the compiled `out` tree into a temporary directory, supplies a small
`vscode` stub, and activates the actual compiled extension in a child Node process.
It verifies all five command registrations and exercises active-file copying from
an unsaved buffer, selection copying, preview, import following, Explorer copying,
and the no-active-editor warning. It then calls `deactivate()` and disposes the
extension context, checking command, output-channel, status-item and event-listener
cleanup. Temporary files are removed after success or failure.

This is a Node-based assembly check, **not a real VS Code extension-host test**.
The stub intentionally models only the APIs needed by these paths. It does not
verify VS Code API compatibility, editor UI rendering, command palette or Explorer
menus, real workspace events, remote/virtual workspace behavior, or installation
and activation of the packaged VSIX.

## Real-host acceptance (separate, manual)

Use VS Code 1.96 or later and launch the extension development host, or install the
packaged VSIX in a clean profile. Open a TypeScript workspace with an imported
file, then check all five commands through the command palette and Explorer menu.
Confirm unsaved buffers, selections and the preview tab use the visible content.
Toggle `codesheaf.statusBar.enabled` off, on and off again; confirm one token meter
appears and refreshes with editor and selection changes. Disable/reload the
extension and confirm its status item and commands disappear. Record the actual
VS Code version, OS and result when performing this acceptance; the headless smoke
does not establish those results.
