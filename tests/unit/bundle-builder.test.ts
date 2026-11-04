import { describe, expect, it } from 'vitest';
import { DEFAULT_BUNDLE_OPTIONS, type BundleOptions, type InputRef } from '../../src/core';
import { BundleError } from '../../src/core/domain/errors';
import { makeBuilder } from '../support/harness';

const FIXTURES: Record<string, string> = {
  'C:/proj/src/a.ts': 'import { b } from "./b";\nexport const a = 1;\n',
  'C:/proj/src/b.ts': 'import { c } from "./c";\nexport const b = 2;\n',
  'C:/proj/src/c.ts': 'import "./b";\nexport const c = 3;\n',
  'C:/proj/src/d.ts': 'import { x } from "../node_modules/lib";\nexport const d = 4;\n',
  'C:/proj/src/lines.txt': 'one\ntwo\nthree\n',
  'C:/proj/node_modules/lib.js': 'module.exports = 1;\n',
  'C:/proj/.gitignore': 'node_modules/\nsecrets/\n*.secret\n',
  'C:/proj/secrets/key.txt': 'hidden\n',
  'C:/proj/secrets/deep/nested.txt': 'hidden too\n',
  'C:/proj/keep.secret': 'explicitly requested\n',
  'C:/proj/data.bin': 'text\x00with-nul\n',
  'C:/proj/empty.txt': '',
};

function options(overrides: Partial<BundleOptions> = {}): BundleOptions {
  return { ...DEFAULT_BUNDLE_OPTIONS, ...overrides };
}

const file = (path: string): InputRef => ({ kind: 'file', absolutePath: path });

describe('BundleBuilder', () => {
  it('follows relative imports breadth-first and marks their origin', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file('C:/proj/src/a.ts')], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(bundle.files[0]?.origin).toBe('explicit');
    expect(bundle.files[1]?.origin).toBe('import');
  });

  it('deduplicates files discovered through several import paths', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [file('C:/proj/src/a.ts'), file('C:/proj/src/c.ts')],
      options(),
    );
    const paths = bundle.files.map((f) => f.path);
    expect(paths.filter((p) => p === 'src/b.ts')).toHaveLength(1);
    // Explicit inputs come first, imports follow in discovery order.
    expect(paths.slice(0, 2)).toEqual(['src/a.ts', 'src/c.ts']);
  });

  it('stops following imports at maxImportDepth and records depth-limit skips', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file('C:/proj/src/a.ts')], options({ maxImportDepth: 1 }));
    expect(bundle.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(bundle.skipped).toContainEqual({ path: 'src/c.ts', reason: 'depth-limit' });
  });

  it('disables import following entirely at depth 0', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file('C:/proj/src/a.ts')], options({ maxImportDepth: 0 }));
    expect(bundle.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('applies .gitignore rules to import-discovered files', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file('C:/proj/src/d.ts')], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['src/d.ts']);
    expect(bundle.skipped).toContainEqual({ path: 'node_modules/lib.js', reason: 'ignored' });
  });

  it('bypasses ignore rules for explicitly picked files by default', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file('C:/proj/keep.secret')], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['keep.secret']);
  });

  it('respects ignore rules for explicit files when the policy says so', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'file', absolutePath: 'C:/proj/keep.secret', ignorePolicy: 'respect' }],
      options(),
    );
    expect(bundle.files).toHaveLength(0);
    expect(bundle.skipped).toContainEqual({ path: 'keep.secret', reason: 'ignored' });
  });

  it('honors user exclude globs on top of .gitignore', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [file('C:/proj/src/a.ts')],
      options({ exclude: ['src/b.ts'] }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(bundle.skipped).toContainEqual({ path: 'src/b.ts', reason: 'ignored' });
  });

  it('skips binary files with a precise reason', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file('C:/proj/data.bin')], options());
    expect(bundle.files).toHaveLength(0);
    expect(bundle.skipped).toContainEqual({ path: 'data.bin', reason: 'binary' });
  });

  it('skips files above the size cap', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [file('C:/proj/src/a.ts')],
      options({ maxFileSizeKB: 0.001 }),
    );
    expect(bundle.skipped).toContainEqual({ path: 'src/a.ts', reason: 'too-large' });
  });

  it('reports missing files instead of throwing', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file('C:/proj/ghost.ts')], options());
    expect(bundle.files).toHaveLength(0);
    expect(bundle.skipped).toContainEqual({ path: 'ghost.ts', reason: 'not-found' });
  });

  it('slices selections as 1-based inclusive line ranges', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'selection', absolutePath: 'C:/proj/src/lines.txt', startLine: 2, endLine: 3 }],
      options(),
    );
    expect(bundle.files[0]?.content).toBe('two\nthree');
  });

  it('clamps out-of-range selections', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'selection', absolutePath: 'C:/proj/src/lines.txt', startLine: 2, endLine: 99 }],
      options(),
    );
    expect(bundle.files[0]?.content).toBe('two\nthree');
  });

  it('records empty selections as skipped', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'selection', absolutePath: 'C:/proj/empty.txt', startLine: 1, endLine: 1 }],
      options(),
    );
    expect(bundle.skipped).toContainEqual({ path: 'empty.txt', reason: 'empty-selection' });
  });

  it('expands directories with ignore pruning', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'directory', absolutePath: 'C:/proj/src' }],
      options(),
    );
    const paths = bundle.files.map((f) => f.path).sort();
    expect(paths).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/lines.txt']);
  });

  it('prunes ignored directories entirely during expansion', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build(
      [{ kind: 'directory', absolutePath: 'C:/proj/secrets' }],
      options(),
    );
    expect(bundle.files).toHaveLength(0);
  });

  it('renders a tree and totals in the final bundle', async () => {
    const { builder } = makeBuilder(FIXTURES);
    const bundle = await builder.build([file('C:/proj/src/a.ts')], options());
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
});
