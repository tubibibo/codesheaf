import * as vscode from 'vscode';
import type { InputRef } from '../../core/domain/bundle';
import {
  copyAsContext,
  previewAsContext,
  type CopyUseCaseDeps,
  type PreviewUseCaseDeps,
} from '../../application';

export type AppContainer = CopyUseCaseDeps & PreviewUseCaseDeps;

/**
 * Input ref for the active editor's document, carrying the live buffer
 * content and language. Editor commands must weave what the user is looking
 * at — unsaved changes and untitled documents included — so the builder is
 * handed the document text and never consults the disk for this file.
 *
 * Untitled and other virtual documents have no real location (their
 * `fsPath` is a placeholder): import following is disabled for them, since
 * their import declarations cannot resolve against anything meaningful
 * (ADR-0006).
 */
function activeDocumentRef(editor: vscode.TextEditor): InputRef {
  const virtual = editor.document.uri.scheme !== 'file';
  return {
    kind: 'file',
    absolutePath: editor.document.uri.fsPath,
    content: editor.document.getText(),
    languageId: editor.document.languageId,
    ...(virtual ? { resolveImports: false as const } : {}),
  };
}

/** Command: copy the active file as context (honors configured import depth). */
export function copyActiveFile(deps: AppContainer): void {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    deps.notifier.showWarning('CodeSheaf: open a file first.');
    return;
  }
  void copyAsContext(deps, [activeDocumentRef(editor)]);
}

/** Command: copy the active file plus its import dependency closure (depth >= 3). */
export function copyActiveFileWithImports(deps: AppContainer): void {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    deps.notifier.showWarning('CodeSheaf: open a file first.');
    return;
  }
  void copyAsContext(deps, [activeDocumentRef(editor)], {
    ensureImportDepth: 3,
  });
}

/** Command: copy the current selection as context. */
export function copySelection(deps: AppContainer): void {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    deps.notifier.showWarning('CodeSheaf: open a file first.');
    return;
  }
  const selection = editor.selection;
  if (selection.isEmpty) {
    deps.notifier.showWarning('CodeSheaf: select some text first.');
    return;
  }
  const startLine = selection.start.line + 1;
  const endLine = selection.end.character === 0 ? selection.end.line : selection.end.line + 1;
  void copyAsContext(deps, [
    {
      kind: 'selection',
      absolutePath: editor.document.uri.fsPath,
      startLine,
      endLine,
      content: editor.document.getText(),
      languageId: editor.document.languageId,
    },
  ]);
}

/** Command: preview the bundle for the active file in a separate editor tab. */
export function previewActiveFile(deps: AppContainer): void {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    deps.notifier.showWarning('CodeSheaf: open a file first.');
    return;
  }
  void previewAsContext(deps, [activeDocumentRef(editor)]);
}

/**
 * Command: copy the files/folders selected in the Explorer. Folders are
 * expanded by the builder (ignore-pruned, capped); gitignore rules apply.
 * Explorer picks read from disk — there is no editor buffer for them.
 */
export async function copyFromExplorer(
  deps: AppContainer,
  args: readonly unknown[],
): Promise<void> {
  const uris = collectUris(args);
  if (uris.length === 0) {
    deps.notifier.showWarning('CodeSheaf: select at least one file or folder in the Explorer.');
    return;
  }
  const refs: InputRef[] = [];
  for (const uri of uris) {
    refs.push(await toInputRef(uri));
  }
  void copyAsContext(deps, refs);
}

function collectUris(args: readonly unknown[]): vscode.Uri[] {
  const uris: vscode.Uri[] = [];
  for (const arg of args) {
    if (arg instanceof Array) {
      uris.push(...arg.filter((entry): entry is vscode.Uri => entry instanceof vscode.Uri));
    } else if (arg instanceof vscode.Uri) {
      uris.push(arg);
    }
  }
  return uris;
}

async function toInputRef(uri: vscode.Uri): Promise<InputRef> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if ((stat.type & vscode.FileType.Directory) !== 0) {
      // Directories expand with ignore pruning inside the builder.
      return { kind: 'directory', absolutePath: uri.fsPath };
    }
  } catch {
    // Let the builder report a precise skip reason.
  }
  // An explicitly picked file is an explicit pick: it bypasses ignore rules,
  // exactly like the editor commands (README: "explicit picks always win").
  return { kind: 'file', absolutePath: uri.fsPath };
}
