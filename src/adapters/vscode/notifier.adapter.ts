import * as vscode from 'vscode';
import type { NotificationPort } from '../../core/ports';

/** Adapter: VS Code window messages -> {@link NotificationPort}. */
export class VsCodeNotifier implements NotificationPort {
  showInformation(message: string): void {
    void vscode.window.showInformationMessage(message);
  }

  showWarning(message: string): void {
    void vscode.window.showWarningMessage(message);
  }

  showError(message: string): void {
    void vscode.window.showErrorMessage(message);
  }
}
