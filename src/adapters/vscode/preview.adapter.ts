import * as vscode from 'vscode';
import type { PreviewPort } from '../../core/ports';

/**
 * Adapter: opens the rendered bundle text in an untitled editor tab.
 *
 * Untitled documents are technically editable — there is no public VS Code
 * API for a truly read-only untitled view, and undocumented workbench
 * commands are not an option. CodeSheaf never writes the bundle anywhere
 * else, so the tab is the single inspection surface.
 */
export class VsCodePreview implements PreviewPort {
  async openText(content: string, languageId: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({ content, language: languageId });
    const editor = await vscode.window.showTextDocument(document, {
      preview: true,
      preserveFocus: false,
    });
    // Park the cursor at the top so the header is what the user sees first.
    const position = new vscode.Position(0, 0);
    editor.selection = new vscode.Selection(position, position);
  }
}
