import * as vscode from 'vscode';
import { formatTokenCount } from '../../core/utils/format';

/**
 * Status-bar readout: live token estimate for the active editor (or the
 * current selection when one exists). Clicking it copies the active file
 * as context.
 */
export class TokenMeter implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly estimator: (text: string) => number) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.item.name = 'CodeSheaf Token Meter';
    this.item.command = 'codesheaf.copyFile';
    this.item.tooltip =
      'CodeSheaf: estimated tokens in the active file/selection — click to copy as context';
    this.subscriptions.push(this.item);
    this.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => this.refresh()));
    this.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => this.refresh()));
    this.refresh();
  }

  dispose(): void {
    for (const disposable of this.subscriptions) {
      disposable.dispose();
    }
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
