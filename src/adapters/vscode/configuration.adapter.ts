import * as vscode from 'vscode';
import type { BundleFormat, BundleOptions } from '../../core/domain/bundle';
import { resolveExcludePatterns } from '../../core/domain/bundle';
import type { ConfigPort } from '../../core/ports';
import { asBoolean, clampInt } from '../../core/utils/numbers';

const FORMATS: readonly BundleFormat[] = ['markdown', 'xml', 'plain'];

/** Adapter: VS Code configuration -> {@link ConfigPort}, with sane fallbacks. */
export class VsCodeConfiguration implements ConfigPort {
  getBundleOptions(): BundleOptions {
    const config = vscode.workspace.getConfiguration('codesheaf');
    const format = config.get<BundleFormat>('format', 'markdown');
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
    };
  }

  isStatusBarEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('codesheaf');
    return asBoolean(config.get<boolean>('statusBar.enabled', true), true);
  }
}
