/**
 * Headless assembly smoke for the compiled CommonJS extension.
 * Runs Node with a deliberately small vscode stub, not a VS Code extension host.
 * It verifies wiring and representative adapter paths, not real editor behavior.
 * Usage: npm run compile && npm run test:smoke
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  'codesheaf.copyFile',
  'codesheaf.copyFileWithImports',
  'codesheaf.copySelection',
  'codesheaf.previewBundle',
  'codesheaf.copyFiles',
];

const stubSource = String.raw`
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
function event() {
  const listeners = new Set();
  return {
    listeners,
    subscribe(listener) {
      listeners.add(listener);
      return { dispose() { listeners.delete(listener); } };
    },
    fire(value) { for (const listener of [...listeners]) listener(value); },
  };
}
const events = { configuration: event(), editor: event(), selection: event(), document: event() };
const record = { commands: new Map(), channels: [], items: [], clipboard: [], previews: [], warnings: [], errors: [] };
class Uri {
  constructor(fsPath) { this.fsPath = path.resolve(fsPath); this.scheme = 'file'; }
  static file(value) { return new Uri(value); }
}
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Selection {
  constructor(start, end) { this.start = start; this.end = end; this.isEmpty = start.line === end.line && start.character === end.character; }
}
const api = {
  Uri, Position, Selection,
  FileType: { File: 1, Directory: 2 },
  StatusBarAlignment: { Right: 2 },
  commands: {
    registerCommand(id, callback) {
      if (record.commands.has(id)) throw new Error('Duplicate command: ' + id);
      record.commands.set(id, callback);
      return { dispose() { record.commands.delete(id); } };
    },
  },
  env: { clipboard: { async writeText(text) { record.clipboard.push(text); } } },
  window: {
    activeTextEditor: undefined,
    createOutputChannel(name) {
      const channel = { name, disposeCalls: 0, appendLine() {}, dispose() { this.disposeCalls++; } };
      record.channels.push(channel);
      return channel;
    },
    createStatusBarItem() {
      const item = { disposeCalls: 0, show() {}, hide() {}, dispose() { this.disposeCalls++; } };
      record.items.push(item);
      return item;
    },
    onDidChangeActiveTextEditor: events.editor.subscribe,
    onDidChangeTextEditorSelection: events.selection.subscribe,
    showInformationMessage() {},
    showWarningMessage(message) { record.warnings.push(message); },
    showErrorMessage(message) { record.errors.push(message); },
    async showTextDocument(document) { record.previews.push(document); return { document }; },
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration() { return { get(key, fallback) { return key === 'maxImportDepth' ? 0 : fallback; } }; },
    getWorkspaceFolder(uri) {
      return api.workspace.workspaceFolders.find(({ uri: root }) => {
        const relative = path.relative(root.fsPath, uri.fsPath);
        return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
      });
    },
    asRelativePath(uri) {
      const folder = api.workspace.getWorkspaceFolder(uri);
      return folder ? path.relative(folder.uri.fsPath, uri.fsPath) : uri.fsPath;
    },
    onDidChangeConfiguration: events.configuration.subscribe,
    onDidChangeTextDocument: events.document.subscribe,
    async openTextDocument(options) { return { content: options.content, languageId: options.language }; },
    fs: {
      async stat(uri) { const stat = await fs.stat(uri.fsPath); return { type: stat.isDirectory() ? 2 : 1, size: stat.size }; },
      readFile(uri) { return fs.readFile(uri.fsPath); },
      async readDirectory(uri) { return (await fs.readdir(uri.fsPath, { withFileTypes: true })).map((entry) => [entry.name, entry.isDirectory() ? 2 : 1]); },
    },
  },
  record, events,
};
module.exports = api;
`;

const runnerSource = String.raw`
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const extension = require('./out/extension.js');
const expectedCommands = JSON.parse(process.argv[2]);
async function waitFor(predicate, label) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out: ' + label + '; errors=' + JSON.stringify(vscode.record.errors));
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function main() {
  const context = { subscriptions: [] };
  extension.activate(context);
  assert.deepEqual([...vscode.record.commands.keys()].sort(), [...expectedCommands].sort());
  assert.equal(vscode.record.channels.length, 1);
  assert.equal(vscode.record.items.length, 1);
  const invoke = (id, ...args) => vscode.record.commands.get(id)(...args);
  invoke('codesheaf.copyFile');
  assert.match(vscode.record.warnings.at(-1), /open a file first/);

  const fixtureRoot = path.join(__dirname, 'fixture');
  fs.mkdirSync(fixtureRoot);
  fs.writeFileSync(path.join(fixtureRoot, 'main.ts'), 'export const stale = "on-disk";\n');
  fs.writeFileSync(path.join(fixtureRoot, 'helper.ts'), 'export const helper = "from-dependency";\n');
  const content = 'import { helper } from "./helper";\nexport const live = "unsaved";\n';
  const document = { uri: vscode.Uri.file(path.join(fixtureRoot, 'main.ts')), languageId: 'typescript', getText: () => content };
  vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file(fixtureRoot) }];
  const editor = { document, selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)) };
  vscode.window.activeTextEditor = editor;
  vscode.events.editor.fire(editor);

  invoke('codesheaf.copyFile');
  await waitFor(() => vscode.record.clipboard.length === 1, 'copyFile');
  assert.ok(vscode.record.clipboard[0].includes(content.trim()));
  assert.ok(!vscode.record.clipboard[0].includes('on-disk'));
  assert.ok(!vscode.record.clipboard[0].includes('from-dependency'));

  editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(2, 0));
  invoke('codesheaf.copySelection');
  await waitFor(() => vscode.record.clipboard.length === 2, 'copySelection');
  assert.ok(vscode.record.clipboard[1].includes('export const live = "unsaved";'));
  assert.ok(!vscode.record.clipboard[1].includes('import { helper }'));

  invoke('codesheaf.previewBundle');
  await waitFor(() => vscode.record.previews.length === 1, 'previewBundle');
  assert.equal(vscode.record.previews[0].languageId, 'markdown');
  assert.ok(vscode.record.previews[0].content.includes(content.trim()));

  invoke('codesheaf.copyFileWithImports');
  await waitFor(() => vscode.record.clipboard.length === 3, 'copyFileWithImports');
  assert.ok(vscode.record.clipboard[2].includes('from-dependency'));

  invoke('codesheaf.copyFiles', [vscode.Uri.file(path.join(fixtureRoot, 'helper.ts'))]);
  await waitFor(() => vscode.record.clipboard.length === 4, 'copyFiles');
  assert.ok(vscode.record.clipboard[3].includes('from-dependency'));
  assert.ok(!vscode.record.clipboard[3].includes('unsaved'));
  assert.deepEqual(vscode.record.errors, []);

  extension.deactivate();
  for (const disposable of context.subscriptions) disposable.dispose();
  assert.equal(vscode.record.commands.size, 0);
  assert.equal(vscode.record.channels[0].disposeCalls, 1);
  assert.equal(vscode.record.items[0].disposeCalls, 1);
  for (const event of Object.values(vscode.events)) assert.equal(event.listeners.size, 0);
  console.log(JSON.stringify({ commandCount: expectedCommands.length, commandPaths: expectedCommands, clipboardWrites: vscode.record.clipboard.length, previewCount: vscode.record.previews.length, disposed: true }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
`;

function main() {
  assert.ok(existsSync(join(root, 'out', 'extension.js')), 'Compile first: npm run compile');
  const sandbox = mkdtempSync(join(tmpdir(), 'codesheaf-smoke-'));
  try {
    cpSync(join(root, 'out'), join(sandbox, 'out'), { recursive: true });
    const stubDir = join(sandbox, 'node_modules', 'vscode');
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(join(stubDir, 'index.js'), stubSource, 'utf8');
    writeFileSync(join(sandbox, 'run.cjs'), runnerSource, 'utf8');
    const result = spawnSync(
      process.execPath,
      [join(sandbox, 'run.cjs'), JSON.stringify(commands)],
      {
        cwd: sandbox,
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'Headless smoke failed:\n' + result.stdout + result.stderr);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.commandCount, 5);
    assert.equal(report.clipboardWrites, 4);
    assert.equal(report.previewCount, 1);
    assert.equal(report.disposed, true);
    console.log(
      'HEADLESS SMOKE OK - 5 commands registered and exercised, 4 clipboard writes, 1 preview, all context resources disposed.',
    );
    console.log(
      'This uses a vscode stub in Node; a real VS Code extension-host acceptance run remains separate.',
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}
try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
