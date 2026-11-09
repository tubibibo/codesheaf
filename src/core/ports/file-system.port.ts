import type { SkipReason } from '../domain/bundle';

/**
 * Result of reading a text file through the {@link FileSystemPort}.
 * Errors are values here (not exceptions) so the use case can record
 * per-file skip reasons instead of aborting the whole bundle.
 */
export type FileReadResult =
  | { ok: true; content: string }
  | {
      ok: false;
      reason: Extract<SkipReason, 'binary' | 'encoding' | 'too-large' | 'not-found' | 'unreadable'>;
    };

/** One row of a directory listing. */
export interface DirectoryEntry {
  readonly name: string;
  readonly isDirectory: boolean;
}

/**
 * Port: everything the core needs to know about the file system.
 * Implemented by the VS Code adapter in production and by an in-memory
 * fake in tests. Implementations should catch their own platform errors
 * and translate them into {@link FileReadResult} values or thrown
 * `Error`s for `listDir` (the builder records those as `unreadable`).
 */
export interface FileSystemPort {
  exists(absolutePath: string): Promise<boolean>;
  readText(absolutePath: string, maxBytes: number): Promise<FileReadResult>;
  /** Lists one directory level. May throw; the caller handles failures. */
  listDir(absoluteDir: string): Promise<readonly DirectoryEntry[]>;
  /**
   * Resolves symlinks to the true location of a path, or `undefined` when
   * it cannot be resolved. Used to keep import candidates that traverse a
   * symlink outside the workspace from being woven.
   */
  realPath(absolutePath: string): Promise<string | undefined>;
}

/**
 * Port: workspace layout. Lets the core compute display paths and resolve
 * root-relative import candidates without knowing what a "workspace" is.
 */
export interface WorkspacePort {
  /** Absolute paths of the workspace roots (empty when not in a workspace). */
  roots(): readonly string[];
  /** Workspace-relative POSIX path, or `undefined` when outside the workspace. */
  relativePath(absolutePath: string): string | undefined;
  /**
   * The root that contains this path, or `undefined` when outside every
   * root. Multi-root workspaces isolate per-root rules (e.g. each root's
   * `.gitignore` must not leak into the other roots).
   */
  rootFor(absolutePath: string): string | undefined;
}
