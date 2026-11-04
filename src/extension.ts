import * as vscode from 'vscode';
import { registerAllCommands } from './adapters/commands/register';
import { TokenMeter } from './adapters/vscode/token-meter.adapter';
import { createContainer } from './composition/container';

/**
 * Extension entry point — activation and teardown only. All wiring lives in
 * the composition root, all behavior in core/application layers.
 */
export function activate(context: vscode.ExtensionContext): void {
  const container = createContainer();
  context.subscriptions.push(...container.subscriptions);
  context.subscriptions.push(...registerAllCommands(container));

  const statusBarEnabled = vscode.workspace
    .getConfiguration('codesheaf')
    .get<boolean>('statusBar.enabled', true);
  if (statusBarEnabled) {
    context.subscriptions.push(new TokenMeter(container.estimator));
  }
}

export function deactivate(): void {
  // Disposables registered on the extension context tear everything down.
}
