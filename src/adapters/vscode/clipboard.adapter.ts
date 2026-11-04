import * as vscode from 'vscode';
import type { ClipboardPort } from '../../core/ports';

/** Adapter: VS Code clipboard -> {@link ClipboardPort}. */
export class VsCodeClipboard implements ClipboardPort {
  async writeText(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
  }
}
