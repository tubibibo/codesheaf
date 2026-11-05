import * as vscode from 'vscode';
import type { BundleFormat, BundleOptions } from '../../core/domain/bundle';
import { resolveExcludePatterns } from '../../core/domain/bundle';
import type { ConfigPort } from '../../core/ports';
import { clampInt } from '../../core/utils/numbers';

const FORMATS: readonly BundleFormat[] = ['markdown', 'xml', 'plain'];

/** Adapter: VS Code configuration -> {@link ConfigPort}, with sane fallbacks. */
export class VsCodeConfiguration implements ConfigPort {
  getBundleOptions(): BundleOptions {
    const config = vscode.workspace.getConfiguration('codesheaf');
    const format = config.get<BundleFormat>('format', 'markdown');
    return {
      format: FORMATS.includes(format) ? format : 'markdown',
      includeLineNumbers: config.get<boolean>('includeLineNumbers', false),
      includeTree: config.get<boolean>('includeTree', true),
      // Mistyped settings ("5" as a string) must not poison the numeric
      // options with NaN — a NaN size cap silently disabled the limit.
      maxImportDepth: clampInt(config.get<number>('maxImportDepth', 3), 3, 0, 10),
      maxFileSizeKB: clampInt(config.get<number>('maxFileSizeKB', 256), 256, 1),
      respectGitignore: config.get<boolean>('respectGitignore', true),
      exclude: resolveExcludePatterns(config.get<string[]>('exclude', [])),
    };
  }
}
