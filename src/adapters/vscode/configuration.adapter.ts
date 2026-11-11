import * as vscode from 'vscode';
import type { BundleFormat, BundleOptions, SecretScanMode } from '../../core/domain/bundle';
import { resolveExcludePatterns } from '../../core/domain/bundle';
import type { ConfigPort } from '../../core/ports';
import { asBoolean, clampInt } from '../../core/utils/numbers';

const FORMATS: readonly BundleFormat[] = ['markdown', 'xml', 'plain'];
const SECRET_SCAN_MODES: readonly SecretScanMode[] = ['off', 'warn'];

/** Adapter: VS Code configuration -> {@link ConfigPort}, with sane fallbacks. */
export class VsCodeConfiguration implements ConfigPort {
  getBundleOptions(): BundleOptions {
    const config = vscode.workspace.getConfiguration('codesheaf');
    const format = config.get<BundleFormat>('format', 'markdown');
    const secretScan = config.get<SecretScanMode>('secretScan', 'warn');
    // A mistyped taskHeader (number, array, object) must not reach the
    // renderer mid-build: only real strings pass through.
    const taskHeader = config.get<unknown>('taskHeader', '');
    return {
      format: FORMATS.includes(format) ? format : 'markdown',
      // Mistyped settings must not poison any option class: numbers used to
      // NaN out the size cap (CS-P1-01), a string `"off"` typed as a boolean
      // is truthy and silently *enables*, and a non-string `exclude` entry
      // crashed the ignore matcher mid-build.
      includeLineNumbers: asBoolean(config.get<boolean>('includeLineNumbers', false), false),
      includeTree: asBoolean(config.get<boolean>('includeTree', true), true),
      maxImportDepth: clampInt(config.get<number>('maxImportDepth', 3), 3, 0, 10),
      maxFileSizeKB: clampInt(config.get<number>('maxFileSizeKB', 256), 256, 1),
      respectGitignore: asBoolean(config.get<boolean>('respectGitignore', true), true),
      exclude: resolveExcludePatterns(
        config
          .get<unknown[]>('exclude', [])
          .filter((pattern): pattern is string => typeof pattern === 'string'),
      ),
      secretScan: SECRET_SCAN_MODES.includes(secretScan) ? secretScan : 'warn',
      // Manifest key is `codesheaf.resolveTsconfigAliases`; the option keeps
      // the shorter builder-facing name.
      resolveAliases: asBoolean(config.get<boolean>('resolveTsconfigAliases', true), true),
      // 0 means "no budget": mistyped values fall back to disabled, never to
      // a surprise truncation.
      maxTotalTokens: clampInt(config.get<number>('maxTotalTokens', 0), 0, 0),
      taskHeader: typeof taskHeader === 'string' ? taskHeader : '',
    };
  }

  isStatusBarEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('codesheaf');
    return asBoolean(config.get<boolean>('statusBar.enabled', true), true);
  }
}
