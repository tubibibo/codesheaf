import { describe, expect, it } from 'vitest';
import { DEFAULT_BUNDLE_OPTIONS, type BundleOptions, type InputRef } from '../../src/core';
import { PROJECT_ROOT } from '../support/fake-fs';
import { makeBuilder } from '../support/harness';

/**
 * The estimated-token budget (`codesheaf.maxTotalTokens`): once the running
 * estimate reaches the budget, further *discovered* files — directory
 * expansion and the import closure, in breadth-first admission order — are
 * skipped as `limit-reached`. Explicit picks are never withheld, and `0`
 * (the default) changes nothing.
 */

function options(overrides: Partial<BundleOptions> = {}): BundleOptions {
  return { ...DEFAULT_BUNDLE_OPTIONS, ...overrides };
}

const file = (path: string): InputRef => ({ kind: 'file', absolutePath: path });

/**
 * Pads a source snippet to exactly `tokens * 4` ASCII characters — the
 * estimator counts ceil(chars / 4) for ASCII, so this fixes each fixture's
 * estimate deterministically.
 */
function withTokens(base: string, tokens: number): string {
  const pad = 'x'.repeat(4 * tokens - base.length - 4);
  if (pad.length < 0) throw new Error(`snippet too long for ${tokens} tokens: ${base}`);
  return `${base}// ${pad}\n`;
}

function fixtures(): Record<string, string> {
  return {
    [`${PROJECT_ROOT}/main.ts`]: withTokens(
      'import { b } from "./b";\nimport { c } from "./c";\n',
      25,
    ),
    [`${PROJECT_ROOT}/b.ts`]: withTokens('export const b = 1;\n', 25),
    [`${PROJECT_ROOT}/c.ts`]: withTokens('export const c = 2;\n', 25),
    [`${PROJECT_ROOT}/dir/f1.ts`]: withTokens('export const f1 = 1;\n', 25),
    [`${PROJECT_ROOT}/dir/f2.ts`]: withTokens('export const f2 = 2;\n', 25),
    [`${PROJECT_ROOT}/dir/f3.ts`]: withTokens('export const f3 = 3;\n', 25),
  };
}

describe('BundleBuilder token budget', () => {
  it('admits everything when the budget is not reached', async () => {
    const { builder } = makeBuilder(fixtures());
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/main.ts`)],
      options({ maxTotalTokens: 500 }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts', 'b.ts', 'c.ts']);
    expect(bundle.skipped).toHaveLength(0);
  });

  it('keeps the default budget of 0 unlimited', async () => {
    const { builder } = makeBuilder(fixtures());
    const bundle = await builder.build([file(`${PROJECT_ROOT}/main.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts', 'b.ts', 'c.ts']);
  });

  it('stops the import closure once the budget is reached and skips the rest', async () => {
    const { builder } = makeBuilder(fixtures());
    // main (25) is explicit and always admitted; b (25) fits before the
    // running estimate reaches 50; c is over budget at that point.
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/main.ts`)],
      options({ maxTotalTokens: 50 }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts', 'b.ts']);
    expect(bundle.skipped).toContainEqual({ path: 'c.ts', reason: 'limit-reached' });
  });

  it('withholds import candidates at the exact budget boundary too', async () => {
    const { builder } = makeBuilder(fixtures());
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/main.ts`)],
      options({ maxTotalTokens: 25 }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts']);
    expect(bundle.skipped).toContainEqual({ path: 'b.ts', reason: 'limit-reached' });
    expect(bundle.skipped).toContainEqual({ path: 'c.ts', reason: 'limit-reached' });
  });

  it('stops directory expansion mid-walk at the budget', async () => {
    const { builder } = makeBuilder(fixtures());
    const bundle = await builder.build(
      [{ kind: 'directory', absolutePath: `${PROJECT_ROOT}/dir` }],
      options({ maxTotalTokens: 50 }),
    );
    // Breadth-first admission order (sorted names): f1, f2 fit; the walk
    // stops at f3 with one cut-off skip entry.
    expect(bundle.files.map((f) => f.path)).toEqual(['dir/f1.ts', 'dir/f2.ts']);
    expect(bundle.skipped).toEqual([{ path: 'dir/f3.ts', reason: 'limit-reached' }]);
  });

  it('never withholds explicit picks, whatever the budget', async () => {
    const { builder } = makeBuilder(fixtures());
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/main.ts`), file(`${PROJECT_ROOT}/b.ts`), file(`${PROJECT_ROOT}/c.ts`)],
      options({ maxTotalTokens: 1 }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts', 'b.ts', 'c.ts']);
    expect(bundle.skipped).toHaveLength(0);
  });

  it('uses one global meter: a second directory input cannot re-spend the budget', async () => {
    // Review fix R2: the walk used to carry a per-input pending window, so
    // each directory could spend the full budget independently (two dirs ×
    // budget 50 wove 100 tokens). Files now register as they load.
    const { builder } = makeBuilder({
      [`${PROJECT_ROOT}/dirA/f1.ts`]: withTokens('export const a1 = 1;\n', 25),
      [`${PROJECT_ROOT}/dirA/f2.ts`]: withTokens('export const a2 = 2;\n', 25),
      [`${PROJECT_ROOT}/dirB/f1.ts`]: withTokens('export const b1 = 1;\n', 25),
      [`${PROJECT_ROOT}/dirB/f2.ts`]: withTokens('export const b2 = 2;\n', 25),
    });
    const bundle = await builder.build(
      [
        { kind: 'directory', absolutePath: `${PROJECT_ROOT}/dirA` },
        { kind: 'directory', absolutePath: `${PROJECT_ROOT}/dirB` },
      ],
      options({ maxTotalTokens: 50 }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['dirA/f1.ts', 'dirA/f2.ts']);
    expect(bundle.skipped).toEqual([{ path: 'dirB/f1.ts', reason: 'limit-reached' }]);
    expect(bundle.estimatedTokens).toBe(50);
  });

  it('an explicit pick after a budgeted directory is still admitted', async () => {
    const { builder } = makeBuilder({
      [`${PROJECT_ROOT}/dir/f1.ts`]: withTokens('export const f1 = 1;\n', 25),
      [`${PROJECT_ROOT}/dir/f2.ts`]: withTokens('export const f2 = 2;\n', 25),
      [`${PROJECT_ROOT}/late.ts`]: withTokens('export const late = 1;\n', 25),
    });
    const bundle = await builder.build(
      [{ kind: 'directory', absolutePath: `${PROJECT_ROOT}/dir` }, file(`${PROJECT_ROOT}/late.ts`)],
      options({ maxTotalTokens: 50 }),
    );
    // The directory walk hits the global budget; the directly named file
    // still wins (explicit picks pass no budget gate).
    expect(bundle.files.map((f) => f.path)).toEqual(['dir/f1.ts', 'dir/f2.ts', 'late.ts']);
    expect(bundle.skipped).toHaveLength(0);
  });
});
