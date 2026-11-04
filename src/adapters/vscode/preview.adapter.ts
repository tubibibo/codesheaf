import * as vscode from 'vscode';
import type { PreviewPort } from '../../core/ports';

/** Adapter: opens rendered bundle text in a read-only untitled editor. */
export class VsCodePreview implements PreviewPort {
  async openText(content: string, languageId: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({ content, language: languageId });
    const editor = await vscode.window.showTextDocument(document, {
      preview: true,
      preserveFocus: false,
    });
    // A read-only *feel*: undo history stays, but we park the cursor at the top.
    const position = new vscode.Position(0, 0);
    editor.selection = new vscode.Selection(position, position);
  }
}
