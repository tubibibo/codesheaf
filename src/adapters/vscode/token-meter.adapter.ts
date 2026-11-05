import * as vscode from 'vscode';
import { formatTokenCount } from '../../core/utils/format';

/** Content edits are debounced so typing does not re-count the document on every keystroke. */
const CONTENT_DEBOUNCE_MS = 250;

/** Selection changes are throttled too — dragging across a large file fires one event per line. */
const SELECTION_THROTTLE_MS = 120;

/** Estimation input cap: beyond this, the estimate is extrapolated from a sample. */
const ESTIMATE_CHAR_LIMIT = 100_000;

/**
 * Status-bar readout: live token estimate for the active editor (or the
 * current selection when one exists). Clicking it copies exactly what the
 * number describes — the selection when one exists, the whole file
 * otherwise.
 *
 * Refresh triggers: editor switches are immediate; content edits debounce
 * by {@link CONTENT_DEBOUNCE_MS} and selection changes throttle by
 * {@link SELECTION_THROTTLE_MS}. Document events that do not belong to the
 * active editor are ignored, so background documents never trigger a full
 * `getText()`.
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
    this.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection(() => this.schedule(SELECTION_THROTTLE_MS)),
    );
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
    this.schedule(CONTENT_DEBOUNCE_MS);
  }

  private schedule(delayMs: number): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.refresh();
    }, delayMs);
  }

  /** Estimates with a proportional extrapolation above the input cap. */
  private estimate(text: string): number {
    if (text.length <= ESTIMATE_CHAR_LIMIT) return this.estimator(text);
    const sampled = this.estimator(text.slice(0, ESTIMATE_CHAR_LIMIT));
    return Math.max(1, Math.round((sampled * text.length) / ESTIMATE_CHAR_LIMIT));
  }

  private refresh(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      this.item.hide();
      return;
    }
    const selection = editor.selection;
    const hasSelection = selection !== undefined && !selection.isEmpty;
    const text = hasSelection ? editor.document.getText(selection) : editor.document.getText();
    // The click must copy what the number describes.
    this.item.command = hasSelection ? 'codesheaf.copySelection' : 'codesheaf.copyFile';
    this.item.tooltip = hasSelection
      ? 'CodeSheaf: estimated tokens in the selection — click to copy it as context'
      : 'CodeSheaf: estimated tokens in the active file — click to copy it as context';
    this.item.text = `$(sparkle) ~${formatTokenCount(this.estimate(text))}`;
    this.item.show();
  }
}
