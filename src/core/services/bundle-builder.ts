import * as nodePath from 'node:path';
import type {
  BundleOptions,
  BundledFile,
  ContextBundle,
  FileOrigin,
  IgnorePolicy,
  InputRef,
  SkipReason,
  SkippedEntry,
} from '../domain/bundle';
import { BundleError } from '../domain/errors';
import type { FileReadResult, FileSystemPort, WorkspacePort } from '../ports';
import { renderBundle } from './formatter';
import { IgnoreMatcher } from './ignore/gitignore-matcher';
import type { ResolvedCandidate } from './scan/import-scanner';
import { ImportScannerService } from './scan/import-scanner';
import { renderFileTree } from './tree-renderer';
import { estimateTokens } from './token-estimator';
import { compareNames, dedupeKey, hasDotDotSegment } from '../utils/paths';
import { normalizeNewlines } from '../utils/text';
import { languageIdForPath } from '../utils/languages';
import { CODESHEAF_VERSION } from '../../version';

export interface BundleBuilderDeps {
  readonly workspace: WorkspacePort;
  readonly fs: FileSystemPort;
  readonly scanner: ImportScannerService;
}

/** Hard cap on files pulled in by a single directory input (performance guard). */
export const MAX_DIRECTORY_FILES = 1000;

/** Hard cap on directory nesting during expansion; bounds symlink-cycle walks. */
export const MAX_DIRECTORY_DEPTH = 32;

type FileRef = Extract<InputRef, { kind: 'file' }>;
type SelectionRef = Extract<InputRef, { kind: 'selection' }>;

interface WorkingFile {
  readonly absolutePath: string;
  readonly displayPath: string;
  readonly languageId: string;
  /** Full file content — always used for import scanning. */
  readonly fullContent: string;
  /** Content that goes into the bundle (sliced for selections). */
  readonly outputContent: string;
  readonly origin: FileOrigin;
}

interface BuildContext {
  readonly options: BundleOptions;
  /** One matcher per workspace root, so a root's rules never leak into another. */
  readonly ignoreByRoot: Map<string, IgnoreMatcher>;
  readonly maxBytes: number;
  readonly filesByPath: Map<string, WorkingFile>;
  readonly order: string[];
  readonly skipped: SkippedEntry[];
  readonly skipSeen: Set<string>;
  /** Every path probed or registered, so imports are never processed twice. */
  readonly attempted: Set<string>;
}

/**
 * The central use case of CodeSheaf: weave a set of inputs (files,
 * selections, directories) plus — optionally — their import dependency
 * closure into a single LLM-ready bundle.
 *
 * Breadth-first over import declarations; every candidate path is probed
 * against the file-system port, so third-party packages are excluded simply
 * because they do not exist in the workspace.
 */
export class BundleBuilder {
  constructor(private readonly deps: BundleBuilderDeps) {}

  async build(inputs: readonly InputRef[], options: BundleOptions): Promise<ContextBundle> {
    if (inputs.length === 0) {
      throw new BundleError('Cannot weave a bundle from zero inputs.');
    }

    const ignoreByRoot = await this.buildIgnoreMatchers(options);
    const ctx: BuildContext = {
      options,
      ignoreByRoot,
      maxBytes: Math.max(1, Math.round(options.maxFileSizeKB * 1024)),
      filesByPath: new Map(),
      order: [],
      skipped: [],
      skipSeen: new Set(),
      attempted: new Set(),
    };

    // Level 0: explicit inputs, in the order given.
    const explicit: WorkingFile[] = [];
    for (const ref of inputs) {
      if (ref.kind === 'directory') {
        await this.expandDirectory(ref.absolutePath, ctx, explicit);
        continue;
      }
      const policy: IgnorePolicy =
        ref.kind === 'selection' ? 'bypass' : (ref.ignorePolicy ?? 'bypass');
      const file = await this.loadFile(ref, policy, 'explicit', ctx);
      if (file !== undefined) explicit.push(file);
    }
    for (const file of explicit) this.register(file, ctx);

    // Breadth-first import closure.
    const maxDepth = Math.max(0, Math.floor(options.maxImportDepth));
    let frontier: WorkingFile[] = [...explicit];
    for (let depth = 1; depth <= maxDepth; depth += 1) {
      const next = await this.expandImports(frontier, ctx);
      frontier = next;
      if (next.length === 0) break;
    }

    // Record what the closure *would* have pulled in had the depth been larger.
    if (maxDepth > 0 && frontier.length > 0) {
      for (const file of frontier) {
        for (const candidate of this.candidatesOf(file)) {
          const abs = await this.resolveCandidate(candidate);
          if (abs === undefined) continue;
          if (ctx.attempted.has(dedupeKey(abs))) continue;
          if (!(await this.deps.fs.exists(abs))) continue;
          this.recordSkip(abs, 'depth-limit', ctx);
        }
      }
    }

    return this.assemble(ctx, options);
  }

  private async expandImports(
    frontier: readonly WorkingFile[],
    ctx: BuildContext,
  ): Promise<WorkingFile[]> {
    const next: WorkingFile[] = [];
    for (const file of frontier) {
      for (const candidate of this.candidatesOf(file)) {
        const abs = await this.resolveCandidate(candidate);
        if (abs === undefined) continue;
        const key = dedupeKey(abs);
        if (ctx.filesByPath.has(key) || ctx.attempted.has(key)) continue;
        // Extension/index probing produces many non-existent variants; missing
        // candidates are resolution misses, not meaningful skips.
        const loaded = await this.loadFile(
          { kind: 'file', absolutePath: abs },
          'respect',
          'import',
          ctx,
          false,
        );
        if (loaded === undefined) continue;
        this.register(loaded, ctx);
        next.push(loaded);
      }
    }
    return next;
  }

  private candidatesOf(file: WorkingFile): readonly ResolvedCandidate[] {
    return this.deps.scanner.collectCandidates({
      languageId: file.languageId,
      absolutePath: file.absolutePath,
      content: file.fullContent,
    });
  }

  private async resolveCandidate(candidate: ResolvedCandidate): Promise<string | undefined> {
    if (candidate.kind === 'absolute') {
      // Import candidates must stay inside the workspace: a crafted
      // '../..' chain (or an absolute import) must never weave files from
      // outside the project. Explicit user inputs do not go through here.
      return this.admitCandidate(candidate.path);
    }
    // Root-relative paths are relative to a workspace root by definition,
    // so any `..` segment in them is malformed and could escape (defense in
    // depth: the strategies already reject such specifiers).
    if (hasDotDotSegment(candidate.path)) return undefined;
    for (const root of this.deps.workspace.roots()) {
      const abs = await this.admitCandidate(nodePath.join(root, candidate.path));
      if (abs !== undefined) return abs;
    }
    return undefined;
  }

  /**
   * Admits an import candidate only when it — and, if it resolves, the
   * symlink target it points at — lies inside the workspace. Returns the
   * (lexical) candidate path, or `undefined` for silent misses.
   */
  private async admitCandidate(absolutePath: string): Promise<string | undefined> {
    if (!this.isInsideWorkspace(absolutePath)) return undefined;
    if (!(await this.deps.fs.exists(absolutePath))) return undefined;
    const real = await this.deps.fs.realPath(absolutePath);
    if (real !== undefined && !this.isInsideWorkspace(real)) return undefined;
    return absolutePath;
  }

  /**
   * Workspace containment for import candidates. Returns `true` when there
   * are no workspace roots (no boundary to enforce). The `..` test checks
   * whole segments only, so a legitimately named `..foo` file is admitted.
   * Non-matches are silent resolution misses, never recorded as skips.
   */
  private isInsideWorkspace(absolutePath: string): boolean {
    const roots = this.deps.workspace.roots();
    if (roots.length === 0) return true;
    return roots.some((root) => {
      const rel = nodePath.relative(root, absolutePath);
      if (rel === '' || nodePath.isAbsolute(rel)) return false;
      const firstSegment = rel.split(/[\\/]/)[0];
      return firstSegment !== '..';
    });
  }

  private async loadFile(
    ref: FileRef | SelectionRef,
    policy: IgnorePolicy,
    origin: FileOrigin,
    ctx: BuildContext,
    recordNotFound = true,
  ): Promise<WorkingFile | undefined> {
    const absolutePath = ref.absolutePath;
    ctx.attempted.add(dedupeKey(absolutePath));

    const rel = this.deps.workspace.relativePath(absolutePath);
    if (
      policy === 'respect' &&
      ctx.options.respectGitignore &&
      rel !== undefined &&
      this.isIgnored(absolutePath, rel, ctx)
    ) {
      this.recordSkip(absolutePath, 'ignored', ctx);
      return undefined;
    }

    // Editor-buffer form: when the caller carries the document's live
    // content, the disk is not consulted at all (unsaved edits, untitled
    // documents). The on-disk size cap does not apply by design.
    const read: FileReadResult =
      ref.content !== undefined
        ? { ok: true, content: ref.content }
        : await this.deps.fs.readText(absolutePath, ctx.maxBytes);
    if (!read.ok) {
      if (read.reason !== 'not-found' || recordNotFound) {
        this.recordSkip(absolutePath, read.reason, ctx);
      }
      return undefined;
    }

    // CRLF (and lone CR) endings are normalized once, here, so line-number
    // markers and selection slicing never carry stray \r characters. This
    // covers disk reads and editor-buffer content alike.
    read.content = normalizeNewlines(read.content);

    let outputContent = read.content;
    if (ref.kind === 'selection') {
      const sliced = sliceLines(read.content, ref.startLine, ref.endLine);
      if (sliced === null) {
        this.recordSkip(absolutePath, 'empty-selection', ctx);
        return undefined;
      }
      outputContent = sliced;
    }

    return {
      absolutePath,
      displayPath: rel ?? nodePath.basename(absolutePath),
      languageId: ref.languageId ?? languageIdForPath(absolutePath),
      fullContent: read.content,
      outputContent,
      origin,
    };
  }

  /**
   * Walks a directory breadth-first, pruning ignored subtrees and capping
   * the file count. Two guards keep pathological trees finite:
   *
   * - a visited set (normalized paths) stops the same literal directory
   *   from being listed twice;
   * - a depth cap stops symlinked cycles (A → B → A), whose joined paths
   *   grow on every level and therefore never repeat as strings — a
   *   path-keyed visited set alone cannot catch them.
   */
  private async expandDirectory(
    rootDir: string,
    ctx: BuildContext,
    out: WorkingFile[],
  ): Promise<void> {
    const queue: { dir: string; depth: number }[] = [{ dir: rootDir, depth: 0 }];
    const visited = new Set<string>([dedupeKey(rootDir)]);
    let collected = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      let entries;
      try {
        entries = await this.deps.fs.listDir(current.dir);
      } catch {
        this.recordSkip(current.dir, 'unreadable', ctx);
        continue;
      }
      // Host listing order is unspecified; sort so bundles are reproducible
      // across platforms and locales.
      entries = [...entries].sort((a, b) => compareNames(a.name, b.name));
      for (const entry of entries) {
        const abs = nodePath.join(current.dir, entry.name);
        const rel = this.deps.workspace.relativePath(abs);
        if (rel === undefined) continue;
        if (ctx.options.respectGitignore && this.isIgnored(abs, rel, ctx)) continue;
        if (entry.isDirectory) {
          if (current.depth + 1 > MAX_DIRECTORY_DEPTH) {
            this.recordSkip(rootDir, 'limit-reached', ctx);
            continue;
          }
          const key = dedupeKey(abs);
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ dir: abs, depth: current.depth + 1 });
          }
          continue;
        }
        if (collected >= MAX_DIRECTORY_FILES) {
          this.recordSkip(rootDir, 'limit-reached', ctx);
          return;
        }
        // Count every file *encountered*, not just the ones that load —
        // otherwise a directory of 10k binary files never trips the cap.
        collected += 1;
        const file = await this.loadFile(
          { kind: 'file', absolutePath: abs },
          'respect',
          'explicit',
          ctx,
          true,
        );
        if (file !== undefined) {
          out.push(file);
        }
      }
    }
  }

  private register(file: WorkingFile, ctx: BuildContext): void {
    const key = dedupeKey(file.absolutePath);
    if (ctx.filesByPath.has(key)) return;
    ctx.filesByPath.set(key, file);
    ctx.order.push(key);
  }

  private recordSkip(absolutePath: string, reason: SkipReason, ctx: BuildContext): void {
    const pathKey = dedupeKey(absolutePath);
    ctx.attempted.add(pathKey);
    const key = `${pathKey}#${reason}`;
    if (ctx.skipSeen.has(key)) return;
    ctx.skipSeen.add(key);
    const rel = this.deps.workspace.relativePath(absolutePath);
    ctx.skipped.push({ path: rel ?? nodePath.basename(absolutePath), reason });
  }

  /**
   * Decides ignore status for a path using the matcher of the root that
   * contains it, so anchored rules (`/dist/**`) in one multi-root folder
   * never prune another folder's files. Paths outside every root are never
   * ignored (explicit picks, containment-guarded candidates only).
   */
  private isIgnored(absolutePath: string, relPosixPath: string, ctx: BuildContext): boolean {
    const root = this.deps.workspace.rootFor(absolutePath);
    if (root === undefined) return false;
    return ctx.ignoreByRoot.get(dedupeKey(root))?.isIgnored(relPosixPath) ?? false;
  }

  /**
   * Builds one matcher per workspace root: that root's own `.gitignore`
   * lines first, then the user's `codesheaf.exclude` globs (last rule wins,
   * so explicit configuration beats gitignore on ties). Nested
   * `.gitignore` files are not read — a documented limitation (ADR-0005).
   */
  private async buildIgnoreMatchers(options: BundleOptions): Promise<Map<string, IgnoreMatcher>> {
    const matchers = new Map<string, IgnoreMatcher>();
    for (const root of this.deps.workspace.roots()) {
      const patterns: string[] = [];
      if (options.respectGitignore) {
        const read = await this.deps.fs.readText(
          nodePath.join(root, '.gitignore'),
          Number.MAX_SAFE_INTEGER,
        );
        if (read.ok) patterns.push(...read.content.split(/\r?\n/));
      }
      // User exclude patterns come last: on ties, explicit configuration wins.
      patterns.push(...options.exclude);
      matchers.set(dedupeKey(root), IgnoreMatcher.fromPatterns(patterns));
    }
    return matchers;
  }

  private assemble(ctx: BuildContext, options: BundleOptions): ContextBundle {
    const files: BundledFile[] = [];
    for (const key of ctx.order) {
      const wf = ctx.filesByPath.get(key);
      if (wf === undefined) continue;
      files.push({
        path: wf.displayPath,
        absolutePath: wf.absolutePath,
        languageId: wf.languageId,
        content: wf.outputContent,
        origin: wf.origin,
        chars: wf.outputContent.length,
        estimatedTokens: estimateTokens(wf.outputContent),
      });
    }
    const totalChars = files.reduce((sum, f) => sum + f.chars, 0);
    const estimatedTokens = files.reduce((sum, f) => sum + f.estimatedTokens, 0);
    const tree = renderFileTree(files.map((f) => f.path));
    const rendered = renderBundle({
      files,
      tree,
      format: options.format,
      includeLineNumbers: options.includeLineNumbers,
      includeTree: options.includeTree,
      generator: `CodeSheaf v${CODESHEAF_VERSION}`,
    });
    return {
      files,
      skipped: ctx.skipped,
      tree,
      rendered,
      totalChars,
      estimatedTokens,
      format: options.format,
    };
  }
}

/**
 * Slices a 1-based inclusive line range; returns `null` when nothing
 * remains. Ranges that fall entirely outside the file (start beyond the
 * last line, or end before the first) are empty selections, not clamps
 * onto whatever happens to be the nearest line.
 */
function sliceLines(content: string, startLine: number, endLine: number): string | null {
  let lines = content.split('\n');
  // A trailing newline does not start a new (empty) line.
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines = lines.slice(0, -1);
  }
  const total = lines.length;
  let start = Math.floor(startLine);
  let end = Math.floor(endLine);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start > end) [start, end] = [end, start];
  if (start > total || end < 1) return null;
  start = Math.max(start, 1);
  end = Math.min(end, total);
  const sliced = lines.slice(start - 1, end).join('\n');
  return sliced.length > 0 ? sliced : null;
}
