import * as vscode from 'vscode';
import { formatTokenCount } from '../../core/utils/format';

/** Content edits are debounced so typing does not re-count the document on every keystroke. */
const CONTENT_DEBOUNCE_MS = 250;

/**
 * Status-bar readout: live token estimate for the active editor (or the
 * current selection when one exists). Clicking it copies the active file
 * as context.
 *
 * Refresh triggers: editor switches and selection changes are immediate;
 * content edits are debounced by {@link CONTENT_DEBOUNCE_MS}. Document
 * events that do not belong to the active editor are ignored, so background
 * documents never trigger a full `getText()`.
 */
export class TokenMeter implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscriptions: vscode.Disposable[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly estimator: (text: string) => number) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.item.name = 'CodeSheaf Token Meter';
    this.item.command = 'codesheaf.copyFile';
    this.item.tooltip =
      'CodeSheaf: estimated tokens in the active file/selection — click to copy as context';
    this.subscriptions.push(this.item);
    this.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => this.refresh()));
    this.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => this.refresh()));
    this.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => this.onDocumentChanged(event)),
    );
    this.refresh();
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    for (const disposable of this.subscriptions) {
      disposable.dispose();
    }
  }

  private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
    const active = vscode.window.activeTextEditor;
    if (active === undefined || active.document !== event.document) return;
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.refresh();
    }, CONTENT_DEBOUNCE_MS);
  }

  private refresh(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      this.item.hide();
      return;
    }
    const selection = editor.selection;
    const text =
      selection !== undefined && !selection.isEmpty
        ? editor.document.getText(selection)
        : editor.document.getText();
    this.item.text = `$(sparkle) ~${formatTokenCount(this.estimator(text))}`;
    this.item.show();
  }
}
