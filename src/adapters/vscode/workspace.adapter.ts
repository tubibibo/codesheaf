import * as vscode from 'vscode';
import type { WorkspacePort } from '../../core/ports';

/** Adapter: VS Code multi-root workspace -> {@link WorkspacePort}. */
export class VsCodeWorkspace implements WorkspacePort {
  roots(): readonly string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  }

  relativePath(absolutePath: string): string | undefined {
    const uri = vscode.Uri.file(absolutePath);
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined) return undefined;
    return vscode.workspace.asRelativePath(uri, false);
  }

  rootFor(absolutePath: string): string | undefined {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(absolutePath));
    return folder?.uri.fsPath;
  }
}
