/**
 * Domain model for CodeSheaf bundles.
 *
 * This layer is pure data and pure logic: it must never import `vscode`,
 * node-only IO modules, or adapter implementations (enforced by ESLint —
 * see `eslint.config.mjs` and `docs/architecture.md`).
 */

/** Output formats supported by the bundle renderer. */
export type BundleFormat = 'markdown' | 'xml' | 'plain';

/** Why a candidate file was not included in the bundle. */
export type SkipReason =
  | 'ignored'
  | 'binary'
  | 'too-large'
  | 'not-found'
  | 'unreadable'
  | 'empty-selection'
  | 'depth-limit'
  | 'limit-reached';

/** How a file entered the bundle: explicitly requested, or pulled in via import scanning. */
export type FileOrigin = 'explicit' | 'import';

/** Whether a file should honor ignore rules when it is loaded. */
export type IgnorePolicy = 'respect' | 'bypass';

/** A file included in a bundle. */
export interface BundledFile {
  /** Workspace-relative POSIX-style display path (e.g. `src/core/domain.ts`). */
  readonly path: string;
  readonly absolutePath: string;
  readonly languageId: string;
  readonly content: string;
  readonly origin: FileOrigin;
  readonly chars: number;
  readonly estimatedTokens: number;
}

/** A candidate that was evaluated but left out of the bundle. */
export interface SkippedEntry {
  readonly path: string;
  readonly reason: SkipReason;
}

/** The final weave: structured result plus the rendered text. */
export interface ContextBundle {
  readonly files: readonly BundledFile[];
  readonly skipped: readonly SkippedEntry[];
  readonly tree: string;
  readonly rendered: string;
  readonly totalChars: number;
  readonly estimatedTokens: number;
  readonly format: BundleFormat;
}

/** All knobs the bundle builder understands. Immutable by convention. */
export interface BundleOptions {
  readonly format: BundleFormat;
  readonly includeLineNumbers: boolean;
  readonly includeTree: boolean;
  /** How deep to follow import declarations. `0` disables import following. */
  readonly maxImportDepth: number;
  /** Files larger than this (in KiB) are skipped. */
  readonly maxFileSizeKB: number;
  /** Whether `.gitignore` files in workspace roots are honored. */
  readonly respectGitignore: boolean;
  /** Extra exclude globs (gitignore syntax), applied on top of `.gitignore`. */
  readonly exclude: readonly string[];
}

/** Glob patterns always excluded, before any user patterns (see {@link resolveExcludePatterns}). */
export const DEFAULT_EXCLUDES: readonly string[] = [
  'node_modules/**',
  'dist/**',
  'out/**',
  'build/**',
  'coverage/**',
  '.git/**',
  '**/*.min.js',
  '**/*.map',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
];

/**
 * Merges the built-in default excludes with user-provided patterns.
 *
 * VS Code returns the user's array verbatim when a setting is present — it
 * never merges with the manifest default — so the merge has to happen here.
 * Defaults come first and user patterns last: the ignore matcher is
 * last-rule-wins, so a user `!node_modules/**` can re-include a default.
 */
export function resolveExcludePatterns(user: readonly string[]): readonly string[] {
  return [...DEFAULT_EXCLUDES, ...user];
}

export const DEFAULT_BUNDLE_OPTIONS: BundleOptions = {
  format: 'markdown',
  includeLineNumbers: false,
  includeTree: true,
  maxImportDepth: 3,
  maxFileSizeKB: 256,
  respectGitignore: true,
  exclude: DEFAULT_EXCLUDES,
};

/**
 * A bundle request. `file` refers to a whole file; `selection` is a 1-based,
 * inclusive line range; `directory` is expanded by the builder (with ignore
 * pruning and a hard file-count cap).
 *
 * `content`/`languageId` (file and selection only) carry the *editor buffer*
 * state: when present the builder uses them instead of reading the file from
 * disk, so unsaved changes and untitled documents weave correctly. Provided
 * content is not subject to the on-disk size cap — it is what the user is
 * looking at.
 */
export type InputRef =
  | {
      kind: 'file';
      absolutePath: string;
      ignorePolicy?: IgnorePolicy;
      content?: string;
      languageId?: string;
      /**
       * When `false`, this input's import declarations are not followed.
       * Untitled and other virtual documents have no real location, so
       * their imports cannot resolve against anything meaningful
       * (see ADR-0006). Defaults to `true`.
       */
      resolveImports?: boolean;
    }
  | { kind: 'directory'; absolutePath: string }
  | {
      kind: 'selection';
      absolutePath: string;
      startLine: number;
      endLine: number;
      content?: string;
      languageId?: string;
      /** See the `file` variant: `false` disables import following. */
      resolveImports?: boolean;
    };
