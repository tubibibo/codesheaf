import * as vscode from 'vscode';
import type { BundleFormat, BundleOptions } from '../../core/domain/bundle';
import { DEFAULT_EXCLUDES } from '../../core/domain/bundle';
import type { ConfigPort } from '../../core/ports';

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
      maxImportDepth: clamp(config.get<number>('maxImportDepth', 3), 0, 10),
      maxFileSizeKB: Math.max(1, config.get<number>('maxFileSizeKB', 256)),
      respectGitignore: config.get<boolean>('respectGitignore', true),
      exclude: config.get<string[]>('exclude', [...DEFAULT_EXCLUDES]),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}
