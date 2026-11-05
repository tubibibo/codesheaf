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

  // The token meter is the only setting cached at activation; everything
  // else flows through ConfigPort on every use case call. Follow the toggle
  // live instead of waiting for a window reload.
  let meter: TokenMeter | undefined;
  const syncMeter = (): void => {
    const enabled = vscode.workspace
      .getConfiguration('codesheaf')
      .get<boolean>('statusBar.enabled', true);
    if (enabled && meter === undefined) {
      meter = new TokenMeter(container.estimator);
    } else if (!enabled && meter !== undefined) {
      meter.dispose();
      meter = undefined;
    }
  };
  syncMeter();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('codesheaf.statusBar.enabled')) {
        syncMeter();
      }
    }),
  );
}

export function deactivate(): void {
  // Disposables registered on the extension context tear everything down.
}
