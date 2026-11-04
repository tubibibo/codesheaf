import * as vscode from 'vscode';
import type {
  ClipboardPort,
  ConfigPort,
  FileSystemPort,
  NotificationPort,
  PreviewPort,
  WorkspacePort,
} from '../core/ports';
import { BundleBuilder } from '../core/services/bundle-builder';
import { estimateTokens } from '../core/services/token-estimator';
import { ImportScannerService } from '../core/services/scan/import-scanner';
import { BUILT_IN_STRATEGIES } from '../core/services/scan/strategies';
import type { AppContainer } from '../adapters/commands/handlers';
import { VsCodeClipboard } from '../adapters/vscode/clipboard.adapter';
import { VsCodeConfiguration } from '../adapters/vscode/configuration.adapter';
import { VsCodeFileSystem } from '../adapters/vscode/file-system.adapter';
import { VsCodeLogger } from '../adapters/vscode/logger.adapter';
import { VsCodeNotifier } from '../adapters/vscode/notifier.adapter';
import { VsCodePreview } from '../adapters/vscode/preview.adapter';
import { VsCodeWorkspace } from '../adapters/vscode/workspace.adapter';

/**
 * Composition root: the one place where platform adapters are wired into
 * the platform-agnostic core. Everything downstream depends on ports only.
 */
export interface Container extends AppContainer {
  readonly logger: VsCodeLogger;
  readonly workspace: WorkspacePort;
  readonly fs: FileSystemPort;
  readonly scanner: ImportScannerService;
  readonly config: ConfigPort;
  readonly clipboard: ClipboardPort;
  readonly notifier: NotificationPort;
  readonly preview: PreviewPort;
  readonly estimator: (text: string) => number;
  readonly subscriptions: readonly vscode.Disposable[];
}

export function createContainer(): Container {
  const logger = new VsCodeLogger('CodeSheaf');
  const workspace = new VsCodeWorkspace();
  const fs = new VsCodeFileSystem();
  const scanner = new ImportScannerService(BUILT_IN_STRATEGIES);
  const builder = new BundleBuilder({ workspace, fs, scanner });
  const config = new VsCodeConfiguration();
  const clipboard = new VsCodeClipboard();
  const notifier = new VsCodeNotifier();
  const preview = new VsCodePreview();

  return {
    logger,
    workspace,
    fs,
    scanner,
    builder,
    config,
    clipboard,
    notifier,
    preview,
    estimator: estimateTokens,
    subscriptions: [logger],
  };
}
