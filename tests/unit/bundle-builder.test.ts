import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUNDLE_OPTIONS,
  type BundleOptions,
  type DirectoryEntry,
  type FileReadResult,
  type FileSystemPort,
  type InputRef,
} from '../../src/core';
import { BundleError } from '../../src/core/domain/errors';
import { BundleBuilder } from '../../src/core/services/bundle-builder';
import { ImportScannerService } from '../../src/core/services/scan/import-scanner';
import { BUILT_IN_STRATEGIES } from '../../src/core/services/scan/strategies';
import {
  InMemoryFileSystem,
  InMemoryWorkspace,
  normalizePath,
  OUTSIDE_ROOT,
  PROJECT_ROOT,
} from '../support/fake-fs';
import { makeBuilder } from '../support/harness';

const FIXTURES: Record<string, string> = {
  [`${PROJECT_ROOT}/src/a.ts`]: 'import { b } from "./b";\nexport const a = 1;\n',
  [`${PROJECT_ROOT}/src/b.ts`]: 'import { c } from "./c";\nexport const b = 2;\n',
  [`${PROJECT_ROOT}/src/c.ts`]: 'import "./b";\nexport const c = 3;\n',
  [`${PROJECT_ROOT}/src/d.ts`]: 'import { x } from "../node_modules/lib";\nexport const d = 4;\n',
  [`${PROJECT_ROOT}/src/escape.ts`]: 'import s from "../../outside/secret";\nexport const e = 1;\n',
  [`${PROJECT_ROOT}/src/main.c`]:
    '#include "../../outside/secret.h"\nint main(void) { return 0; }\n',
  [`${PROJECT_ROOT}/src/lines.txt`]: 'one\ntwo\nthree\n',
  [`${OUTSIDE_ROOT}/secret.ts`]: 'SECRET\n',
  [`${OUTSIDE_ROOT}/secret.h`]: '#pragma once\n',
  [`${PROJECT_ROOT}/node_modules/lib.js`]: 'module.exports = 1;\n',
  [`${PROJECT_ROOT}/.gitignore`]: 'node_modules/\nsecrets/\n*.secret\n',
  [`${PROJECT_ROOT}/secrets/key.txt`]: 'hidden\n',
  [`${PROJECT_ROOT}/secrets/deep/nested.txt`]: 'hidden too\n',
  [`${PROJECT_ROOT}/keep.secret`]: 'explicitly requested\n',
  [`${PROJECT_ROOT}/data.bin`]: 'text\x00with-nul\n',
  [`${PROJECT_ROOT}/empty.txt`]: '',
};

function options(overrides: Partial<BundleOptions> = {}): BundleOptions {
  return { ...DEFAULT_BUNDLE_OPTIONS, ...overrides };
}

const file = (path: string): InputRef => ({ kind: 'file', absolutePath: path });

describe('BundleBuilder', () => {
  it('follows relative imports breadth-first and marks their origin', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file(`${PROJECT_ROOT}/src/a.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(bundle.files[0]?.origin).toBe('explicit');
    expect(bundle.files[1]?.origin).toBe('import');
  });

  it('deduplicates files discovered through several import paths', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/src/a.ts`), file(`${PROJECT_ROOT}/src/c.ts`)],
      options(),
    );
    const paths = bundle.files.map((f) => f.path);
    expect(paths.filter((p) => p === 'src/b.ts')).toHaveLength(1);
    // Explicit inputs come first, imports follow in discovery order.
    expect(paths.slice(0, 2)).toEqual(['src/a.ts', 'src/c.ts']);
  });

  it('stops following imports at maxImportDepth and records depth-limit skips', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/src/a.ts`)],
      options({ maxImportDepth: 1 }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(bundle.skipped).toContainEqual({ path: 'src/c.ts', reason: 'depth-limit' });
  });

  it('disables import following entirely at depth 0', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/src/a.ts`)],
      options({ maxImportDepth: 0 }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('applies .gitignore rules to import-discovered files', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file(`${PROJECT_ROOT}/src/d.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['src/d.ts']);
    expect(bundle.skipped).toContainEqual({ path: 'node_modules/lib.js', reason: 'ignored' });
  });

  it('never weaves import candidates from outside the workspace', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file(`${PROJECT_ROOT}/src/escape.ts`)], options());
    // The '../../outside/secret' import resolves outside the root: silently
    // dropped, not even a skip entry.
    expect(bundle.files.map((f) => f.path)).toEqual(['src/escape.ts']);
    expect(bundle.skipped.some((s) => s.path.includes('outside'))).toBe(false);
    expect(bundle.skipped.some((s) => s.reason === 'not-found')).toBe(false);
  });

  it('never weaves root-relative candidates that traverse outside (C include)', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file(`${PROJECT_ROOT}/src/main.c`)], options());
    // c-family duplicates every specifier as a root-relative candidate;
    // '../../outside/secret.h' must not escape through that branch either.
    expect(bundle.files.map((f) => f.path)).toEqual(['src/main.c']);
    expect(bundle.skipped.some((s) => s.path.includes('outside'))).toBe(false);
  });

  it('admits legitimately named ..-prefixed files inside the workspace', async () => {
    const { builder } = makeBuilder({
      [`${PROJECT_ROOT}/src/main.ts`]: 'import { v } from "../..foo";\nexport const m = v;\n',
      [`${PROJECT_ROOT}/..foo.ts`]: 'export const v = 1;\n',
    });
    const bundle = await builder.build([file(`${PROJECT_ROOT}/src/main.ts`)], options());
    // '..foo.ts' is a file *name*, not a traversal — the old prefix check
    // rejected it; segment-aware containment admits it.
    expect(bundle.files.map((f) => f.path)).toEqual(['src/main.ts', '..foo.ts']);
  });

  it('drops candidates whose symlink target lies outside the workspace', async () => {
    // A symlink inside the workspace pointing outside: lexically inside,
    // physically outside. The realpath guard must catch it.
    class SymlinkFileSystem extends InMemoryFileSystem {
      override async realPath(absolutePath: string): Promise<string | undefined> {
        const key = normalizePath(absolutePath);
        if (key === `${PROJECT_ROOT}/src/link.ts`) return `${OUTSIDE_ROOT}/secret.ts`;
        return super.realPath(absolutePath);
      }
    }
    const workspace = new InMemoryWorkspace(PROJECT_ROOT);
    const builder = new BundleBuilder({
      workspace,
      fs: new SymlinkFileSystem({
        [`${PROJECT_ROOT}/src/main.ts`]: 'import { s } from "./link";\nexport const m = s;\n',
        [`${PROJECT_ROOT}/src/link.ts`]: 'export const s = 1;\n',
        [`${OUTSIDE_ROOT}/secret.ts`]: 'SECRET\n',
      }),
      scanner: new ImportScannerService(BUILT_IN_STRATEGIES),
    });
    const bundle = await builder.build([file(`${PROJECT_ROOT}/src/main.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['src/main.ts']);
    expect(bundle.skipped.some((s) => s.path.includes('secret'))).toBe(false);
  });

  it('keeps allowing explicitly picked files from outside the workspace', async () => {
    const { builder } = makeBuilder({ [`${OUTSIDE_ROOT}/secret.ts`]: 'SECRET\n' });
    const bundle = await builder.build([file(`${OUTSIDE_ROOT}/secret.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['secret.ts']);
  });

  it('bypasses ignore rules for explicitly picked files by default', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file(`${PROJECT_ROOT}/keep.secret`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['keep.secret']);
  });

  it('respects ignore rules for explicit files when the policy says so', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'file', absolutePath: `${PROJECT_ROOT}/keep.secret`, ignorePolicy: 'respect' }],
      options(),
    );
    expect(bundle.files).toHaveLength(0);
    expect(bundle.skipped).toContainEqual({ path: 'keep.secret', reason: 'ignored' });
  });

  it('honors user exclude globs on top of .gitignore', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/src/a.ts`)],
      options({ exclude: ['src/b.ts'] }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(bundle.skipped).toContainEqual({ path: 'src/b.ts', reason: 'ignored' });
  });

  it('skips binary files with a precise reason', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file(`${PROJECT_ROOT}/data.bin`)], options());
    expect(bundle.files).toHaveLength(0);
    expect(bundle.skipped).toContainEqual({ path: 'data.bin', reason: 'binary' });
  });

  it('skips files above the size cap', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/src/a.ts`)],
      options({ maxFileSizeKB: 0.001 }),
    );
    expect(bundle.skipped).toContainEqual({ path: 'src/a.ts', reason: 'too-large' });
  });

  it('reports missing files instead of throwing', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file(`${PROJECT_ROOT}/ghost.ts`)], options());
    expect(bundle.files).toHaveLength(0);
    expect(bundle.skipped).toContainEqual({ path: 'ghost.ts', reason: 'not-found' });
  });

  it('slices selections as 1-based inclusive line ranges', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [
        {
          kind: 'selection',
          absolutePath: `${PROJECT_ROOT}/src/lines.txt`,
          startLine: 2,
          endLine: 3,
        },
      ],
      options(),
    );
    expect(bundle.files[0]?.content).toBe('two\nthree');
  });

  it('prefers provided buffer content over the file on disk', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [
        {
          kind: 'file',
          absolutePath: `${PROJECT_ROOT}/src/a.ts`,
          content: 'export const a = "unsaved edit";\n',
          languageId: 'typescript',
        },
      ],
      options({ maxImportDepth: 0 }),
    );
    expect(bundle.files).toHaveLength(1);
    expect(bundle.files[0]?.content).toBe('export const a = "unsaved edit";\n');
    expect(bundle.skipped).toHaveLength(0);
  });

  it('normalizes CRLF endings from disk and buffers (no stray \\r)', async () => {
    const crlfFiles: Record<string, string> = {
      [`${PROJECT_ROOT}/win/lines.txt`]: 'one\r\ntwo\r\nthree\r\n',
    };
    const { builder } = makeBuilder(crlfFiles);
    const whole = await builder.build([file(`${PROJECT_ROOT}/win/lines.txt`)], options());
    expect(whole.files[0]?.content).toBe('one\ntwo\nthree\n');
    expect(whole.files[0]?.content.includes('\r')).toBe(false);

    const sliced = await builder.build(
      [
        {
          kind: 'selection',
          absolutePath: `${PROJECT_ROOT}/win/lines.txt`,
          startLine: 2,
          endLine: 2,
        },
      ],
      options(),
    );
    expect(sliced.files[0]?.content).toBe('two');
    expect(sliced.files[0]?.content.includes('\r')).toBe(false);
  });

  it('normalizes CRLF endings in provided buffer content too', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [
        {
          kind: 'file',
          absolutePath: `${PROJECT_ROOT}/scratch-2`,
          content: 'alpha\r\nbeta\r\n',
          languageId: 'plaintext',
        },
      ],
      options(),
    );
    expect(bundle.files[0]?.content).toBe('alpha\nbeta\n');
  });

  it('weaves documents that exist only as buffers (untitled)', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [
        {
          kind: 'file',
          absolutePath: `${PROJECT_ROOT}/scratch-1`,
          content: 'quick note\n',
          languageId: 'markdown',
        },
      ],
      options(),
    );
    expect(bundle.files).toHaveLength(1);
    expect(bundle.files[0]?.content).toBe('quick note\n');
    expect(bundle.files[0]?.languageId).toBe('markdown');
    expect(bundle.skipped.some((s) => s.reason === 'not-found')).toBe(false);
  });

  it('slices selections from provided buffer content', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const buffer = 'alpha\nbeta\ngamma\n';
    const bundle = await builder.build(
      [
        {
          kind: 'selection',
          absolutePath: `${PROJECT_ROOT}/only-in-editor.ts`,
          startLine: 2,
          endLine: 2,
          content: buffer,
          languageId: 'typescript',
        },
      ],
      options(),
    );
    expect(bundle.files[0]?.content).toBe('beta');
  });

  it('clamps ranges that partially overhang the file', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [
        {
          kind: 'selection',
          absolutePath: `${PROJECT_ROOT}/src/lines.txt`,
          startLine: 2,
          endLine: 99,
        },
      ],
      options(),
    );
    expect(bundle.files[0]?.content).toBe('two\nthree');
  });

  it('treats fully out-of-range selections as empty', async () => {
    const { builder } = makeBuilder(FIXTURES);
    // start beyond the last line used to clamp onto line 3 and weave it;
    // an entirely out-of-file range is an empty selection instead.
    const bundle = await builder.build(
      [
        {
          kind: 'selection',
          absolutePath: `${PROJECT_ROOT}/src/lines.txt`,
          startLine: 99,
          endLine: 100,
        },
      ],
      options(),
    );
    expect(bundle.files).toHaveLength(0);
    expect(bundle.skipped).toContainEqual({ path: 'src/lines.txt', reason: 'empty-selection' });
  });

  it('records empty selections as skipped', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'selection', absolutePath: `${PROJECT_ROOT}/empty.txt`, startLine: 1, endLine: 1 }],
      options(),
    );
    expect(bundle.skipped).toContainEqual({ path: 'empty.txt', reason: 'empty-selection' });
  });

  it('expands directories with ignore pruning', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'directory', absolutePath: `${PROJECT_ROOT}/src` }],
      options(),
    );
    const paths = bundle.files.map((f) => f.path).sort();
    expect(paths).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'src/escape.ts',
      'src/lines.txt',
      'src/main.c',
    ]);
  });

  it('prunes ignored directories entirely during expansion', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'directory', absolutePath: `${PROJECT_ROOT}/secrets` }],
      options(),
    );
    expect(bundle.files).toHaveLength(0);
  });

  it('isolates gitignore rules per workspace root (multi-root)', async () => {
    const DRIVE = PROJECT_ROOT.split('/')[0];
    // "vendored" keeps the fixtures clear of the built-in default excludes
    // (build/** is always excluded, which would mask the isolation).
    const multiRootFiles: Record<string, string> = {
      [`${DRIVE}/alpha/.gitignore`]: '/vendored\n',
      [`${DRIVE}/alpha/vendored/generated.ts`]: 'export const a = 1;\n',
      [`${DRIVE}/alpha/src/main.ts`]: 'import { b } from "./b";\nexport const m = 1;\n',
      [`${DRIVE}/alpha/src/b.ts`]: 'export const b = 2;\n',
      [`${DRIVE}/beta/vendored/b.ts`]: 'export const b = 3;\n',
    };
    const { builder } = makeBuilder(multiRootFiles, [`${DRIVE}/alpha`, `${DRIVE}/beta`]);
    // Directory expansion applies ignore rules (unlike explicit file picks).
    const bundle = await builder.build(
      [
        { kind: 'directory', absolutePath: `${DRIVE}/alpha` },
        { kind: 'directory', absolutePath: `${DRIVE}/beta` },
      ],
      options(),
    );
    const paths = bundle.files.map((f) => f.path).sort();
    // alpha's anchored /vendored prunes alpha/vendored — but must not reach
    // into beta, whose vendored/b.ts is kept. (The root .gitignore file
    // itself is an ordinary file and is woven.)
    expect(paths).toEqual(['.gitignore', 'src/b.ts', 'src/main.ts', 'vendored/b.ts']);
  });

  it('applies user exclude globs to every workspace root', async () => {
    const DRIVE = PROJECT_ROOT.split('/')[0];
    const multiRootFiles: Record<string, string> = {
      [`${DRIVE}/alpha/x.log`]: 'noise\n',
      [`${DRIVE}/beta/y.log`]: 'noise\n',
      [`${DRIVE}/beta/keep.ts`]: 'export const k = 1;\n',
    };
    const { builder } = makeBuilder(multiRootFiles, [`${DRIVE}/alpha`, `${DRIVE}/beta`]);
    const bundle = await builder.build(
      [
        { kind: 'directory', absolutePath: `${DRIVE}/alpha` },
        { kind: 'directory', absolutePath: `${DRIVE}/beta` },
      ],
      options({ exclude: ['*.log'] }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['keep.ts']);
  });

  it('renders a tree and totals in the final bundle', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file(`${PROJECT_ROOT}/src/a.ts`)], options());
    expect(bundle.tree).toContain('src/');
    expect(bundle.rendered).toContain('## Project Tree');
    expect(bundle.totalChars).toBeGreaterThan(0);
    expect(bundle.estimatedTokens).toBeGreaterThan(0);
    expect(bundle.format).toBe('markdown');
  });

  it('rejects empty input lists', async () => {
    const { builder } = makeBuilder(FIXTURES);
    await expect(builder.build([], options())).rejects.toBeInstanceOf(BundleError);
  });

  it('sorts directory entries deterministically regardless of host order', async () => {
    // A host could list files in any order; the woven order must not care.
    class UnsortedFileSystem extends InMemoryFileSystem {
      private static readonly NAMES = ['charlie.ts', 'alpha.ts', 'bravo.ts'];
      override async listDir(dir: string): Promise<readonly DirectoryEntry[]> {
        const dirKey = normalizePath(dir).replace(/\/+$/, '');
        if (dirKey !== `${PROJECT_ROOT}/src`) return [];
        return UnsortedFileSystem.NAMES.map<DirectoryEntry>((name) => ({
          name,
          isDirectory: false,
        }));
      }
    }
    const builder = new BundleBuilder({
      workspace: new InMemoryWorkspace(PROJECT_ROOT),
      fs: new UnsortedFileSystem({
        [`${PROJECT_ROOT}/src/alpha.ts`]: 'export const a = 1;\n',
        [`${PROJECT_ROOT}/src/bravo.ts`]: 'export const b = 2;\n',
        [`${PROJECT_ROOT}/src/charlie.ts`]: 'export const c = 3;\n',
      }),
      scanner: new ImportScannerService(BUILT_IN_STRATEGIES),
    });
    const bundle = await builder.build(
      [{ kind: 'directory', absolutePath: `${PROJECT_ROOT}/src` }],
      options({ maxImportDepth: 0 }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual([
      'src/alpha.ts',
      'src/bravo.ts',
      'src/charlie.ts',
    ]);
  });

  it('terminates on cyclic directory trees (symlink loop guard)', async () => {
    // A→B→A directory cycle: joined paths grow on every level, so a
    // path-keyed visited set never repeats — the depth cap is what bounds
    // the walk; neither guard alone terminates cycles.
    class CyclicDirectoryFileSystem implements FileSystemPort {
      async exists(): Promise<boolean> {
        return false;
      }
      async realPath(p: string): Promise<string | undefined> {
        return p;
      }
      async readText(): Promise<FileReadResult> {
        return { ok: false, reason: 'not-found' };
      }
      async listDir(dir: string): Promise<readonly DirectoryEntry[]> {
        return dir.endsWith('/A')
          ? [
              { name: 'B', isDirectory: true },
              { name: 'a.txt', isDirectory: false },
            ]
          : [
              { name: 'A', isDirectory: true },
              { name: 'b.txt', isDirectory: false },
            ];
      }
    }
    const builder = new BundleBuilder({
      workspace: new InMemoryWorkspace(`${PROJECT_ROOT}`),
      fs: new CyclicDirectoryFileSystem(),
      scanner: new ImportScannerService(BUILT_IN_STRATEGIES),
    });
    const bundle = await builder.build(
      [{ kind: 'directory', absolutePath: `${PROJECT_ROOT}/A` }],
      options(),
    );
    expect(bundle.files).toHaveLength(0);
    expect(bundle.skipped.length).toBeGreaterThan(0);
    expect(bundle.skipped.some((s) => s.reason === 'limit-reached')).toBe(true);
  });
});
