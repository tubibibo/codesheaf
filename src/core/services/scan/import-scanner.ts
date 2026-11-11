/**
 * Import scanning contract: a language strategy extracts import declarations
 * from source text and turns specifiers into *candidate* file paths.
 * Candidates may not exist — the bundle builder probes them against the
 * file-system port (that is what keeps external packages out for free).
 */

import type { TsconfigAliasMap } from './tsconfig-aliases';

export interface ResolvedCandidate {
  /** `absolute`: ready to probe. `root-relative`: probe against each workspace root. */
  readonly kind: 'absolute' | 'root-relative';
  /** Absolute path, or workspace-root-relative POSIX path. */
  readonly path: string;
}

/** Optional per-file context handed to strategies that can use it. */
export interface ImportScanContext {
  /**
   * tsconfig `paths` aliases of the file's workspace root (ADR-0009).
   * `undefined` — no workspace root, unreadable tsconfig, or the feature
   * switched off — keeps the pre-alias behavior (only relative specifiers).
   */
  readonly aliases?: TsconfigAliasMap;
}

export interface ImportLanguageStrategy {
  readonly id: string;
  /** VS Code language identifiers this strategy claims. */
  readonly languageIds: readonly string[];
  /** File extensions used as a fallback claim (when the language id is unknown). */
  readonly extensions: readonly string[];
  extractImports(
    source: string,
    importerAbsolutePath: string,
    context?: ImportScanContext,
  ): readonly ResolvedCandidate[];
}

export interface ImportScanInput {
  readonly languageId: string;
  readonly absolutePath: string;
  readonly content: string;
}

/** Registry that dispatches a source file to the right language strategy. */
export class ImportScannerService {
  constructor(private readonly strategies: readonly ImportLanguageStrategy[]) {}

  strategyFor(languageId: string, absolutePath: string): ImportLanguageStrategy | undefined {
    const lower = absolutePath.toLowerCase();
    return (
      this.strategies.find((s) => s.languageIds.includes(languageId)) ??
      this.strategies.find((s) => s.extensions.some((ext) => lower.endsWith(ext)))
    );
  }

  collectCandidates(
    input: ImportScanInput,
    context?: ImportScanContext,
  ): readonly ResolvedCandidate[] {
    const strategy = this.strategyFor(input.languageId, input.absolutePath);
    return strategy ? strategy.extractImports(input.content, input.absolutePath, context) : [];
  }
}
