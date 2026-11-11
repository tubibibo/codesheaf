import { describe, expect, it } from 'vitest';
import { DEFAULT_BUNDLE_OPTIONS, type BundleOptions, type InputRef } from '../../src/core';
import { OUTSIDE_ROOT, PROJECT_ROOT } from '../support/fake-fs';
import { makeBuilder } from '../support/harness';

/**
 * End-to-end alias resolution: a root tsconfig.json feeds the TypeScript
 * strategy through the bundle builder, and every mapped candidate still has
 * to pass the regular containment / ignore gates (ADR-0009).
 */

function options(overrides: Partial<BundleOptions> = {}): BundleOptions {
  return { ...DEFAULT_BUNDLE_OPTIONS, ...overrides };
}

const file = (path: string): InputRef => ({ kind: 'file', absolutePath: path });

const tsconfigWith = (paths: Record<string, string[]>, baseUrl = '.'): string =>
  JSON.stringify({ compilerOptions: { baseUrl, paths } });

describe('BundleBuilder tsconfig aliases', () => {
  it('weaves files reached through root tsconfig aliases', async () => {
    const { builder } = makeBuilder({
      [`${PROJECT_ROOT}/tsconfig.json`]: tsconfigWith({ '@/*': ['src/*'], '~/*': ['app/*'] }),
      [`${PROJECT_ROOT}/src/components/button.ts`]: 'export const button = 1;\n',
      [`${PROJECT_ROOT}/app/util.ts`]: 'export const util = 2;\n',
      [`${PROJECT_ROOT}/main.ts`]:
        'import { button } from "@/components/button";\nimport { util } from "~/util";\nexport const m = 1;\n',
    });
    const bundle = await builder.build([file(`${PROJECT_ROOT}/main.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual([
      'main.ts',
      'src/components/button.ts',
      'app/util.ts',
    ]);
    expect(bundle.files[1]?.origin).toBe('import');
  });

  it('resolves baseUrl-relative mappings against the baseUrl, not the root', async () => {
    const { builder } = makeBuilder({
      [`${PROJECT_ROOT}/tsconfig.json`]: tsconfigWith({ '@/*': ['*'] }, 'src'),
      [`${PROJECT_ROOT}/src/widget.ts`]: 'export const widget = 1;\n',
      [`${PROJECT_ROOT}/main.ts`]: 'import { widget } from "@/widget";\nexport const m = 1;\n',
    });
    const bundle = await builder.build([file(`${PROJECT_ROOT}/main.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts', 'src/widget.ts']);
  });

  it('rejects alias targets that point outside the workspace root', async () => {
    const { builder } = makeBuilder({
      [`${PROJECT_ROOT}/tsconfig.json`]: tsconfigWith({ '@evil/*': ['../outside/*'] }),
      [`${OUTSIDE_ROOT}/secret.ts`]: 'SECRET\n',
      [`${PROJECT_ROOT}/main.ts`]: 'import { s } from "@evil/secret";\nexport const m = 1;\n',
    });
    const bundle = await builder.build([file(`${PROJECT_ROOT}/main.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts']);
    // Containment rejections stay silent resolution misses (ADR-0006 style).
    expect(bundle.skipped.some((s) => s.path.includes('secret'))).toBe(false);
  });

  it('skips alias resolution entirely when the option is switched off', async () => {
    const { builder } = makeBuilder({
      [`${PROJECT_ROOT}/tsconfig.json`]: tsconfigWith({ '@/*': ['src/*'] }),
      [`${PROJECT_ROOT}/src/components/button.ts`]: 'export const button = 1;\n',
      [`${PROJECT_ROOT}/main.ts`]:
        'import { button } from "@/components/button";\nexport const m = 1;\n',
    });
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/main.ts`)],
      options({ resolveAliases: false }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts']);
  });

  it('does not resolve aliases without workspace roots (single-file mode)', async () => {
    // No roots means no root tsconfig to consult: mirror single-file mode by
    // building with an empty workspace root list (ADR-0009).
    const { builder } = makeBuilder(
      {
        [`${PROJECT_ROOT}/tsconfig.json`]: tsconfigWith({ '@/*': ['src/*'] }),
        [`${PROJECT_ROOT}/src/components/button.ts`]: 'export const button = 1;\n',
        [`${PROJECT_ROOT}/main.ts`]:
          'import { button } from "@/components/button";\nexport const m = 1;\n',
      },
      [],
    );
    const bundle = await builder.build([file(`${PROJECT_ROOT}/main.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts']);
  });

  it('silently keeps the previous behavior when the tsconfig is unreadable or broken', async () => {
    const { builder } = makeBuilder({
      [`${PROJECT_ROOT}/tsconfig.json`]: '{ "compilerOptions": { "paths": ',
      [`${PROJECT_ROOT}/src/components/button.ts`]: 'export const button = 1;\n',
      [`${PROJECT_ROOT}/main.ts`]:
        'import { button } from "@/components/button";\nexport const m = 1;\n',
    });
    const bundle = await builder.build([file(`${PROJECT_ROOT}/main.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts']);
    expect(bundle.skipped.some((s) => s.reason === 'not-found')).toBe(false);
  });

  it('still applies the import depth limit to alias-mapped candidates', async () => {
    const { builder } = makeBuilder({
      [`${PROJECT_ROOT}/tsconfig.json`]: tsconfigWith({ '@/*': ['src/*'] }),
      [`${PROJECT_ROOT}/src/one.ts`]: 'import { two } from "@/two";\nexport const one = 1;\n',
      [`${PROJECT_ROOT}/src/two.ts`]: 'export const two = 2;\n',
      [`${PROJECT_ROOT}/main.ts`]: 'import { one } from "@/one";\nexport const m = 1;\n',
    });
    const bundle = await builder.build(
      [file(`${PROJECT_ROOT}/main.ts`)],
      options({ maxImportDepth: 1 }),
    );
    expect(bundle.files.map((f) => f.path)).toEqual(['main.ts', 'src/one.ts']);
    expect(bundle.skipped).toContainEqual({ path: 'src/two.ts', reason: 'depth-limit' });
  });

  it('keeps each workspace root on its own tsconfig (multi-root isolation)', async () => {
    const DRIVE = PROJECT_ROOT.split('/')[0];
    const { builder } = makeBuilder(
      {
        [`${DRIVE}/alpha/tsconfig.json`]: tsconfigWith({ '@/*': ['src/*'] }),
        [`${DRIVE}/alpha/src/only-alpha.ts`]: 'export const a = 1;\n',
        [`${DRIVE}/alpha/main.ts`]:
          'import { a } from "@/only-alpha";\nimport { b } from "@/shared";\nexport const m = 1;\n',
        [`${DRIVE}/alpha/src/shared.ts`]: 'export const fromAlpha = 1;\n',
        // beta maps the same alias prefix elsewhere and has its own copy;
        // neither beta's mapping nor beta's file may leak into alpha's build.
        [`${DRIVE}/beta/tsconfig.json`]: tsconfigWith({ '@/*': ['other/*'] }),
        [`${DRIVE}/beta/other/shared.ts`]: 'export const fromBeta = 1;\n',
        [`${DRIVE}/beta/src/shared.ts`]: 'export const fromBetaSrc = 1;\n',
      },
      [`${DRIVE}/alpha`, `${DRIVE}/beta`],
    );
    const bundle = await builder.build([file(`${DRIVE}/alpha/main.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual([
      'alpha/main.ts',
      'alpha/src/only-alpha.ts',
      'alpha/src/shared.ts',
    ]);
  });

  it('reads each root tsconfig once per build even with several alias hits', async () => {
    let reads = 0;
    const { builder, fs } = makeBuilder({
      [`${PROJECT_ROOT}/tsconfig.json`]: tsconfigWith({ '@/*': ['src/*'] }),
      [`${PROJECT_ROOT}/src/a.ts`]: 'import { b } from "@/b";\nexport const a = 1;\n',
      [`${PROJECT_ROOT}/src/b.ts`]: 'import { c } from "@/c";\nexport const b = 2;\n',
      [`${PROJECT_ROOT}/src/c.ts`]: 'export const c = 3;\n',
      [`${PROJECT_ROOT}/main.ts`]: 'import { a } from "@/a";\nexport const m = 1;\n',
    });
    const originalRead = fs.readText.bind(fs);
    fs.readText = async (path: string, maxBytes: number) => {
      if (path.replace(/\\/g, '/').endsWith('/tsconfig.json')) reads += 1;
      return originalRead(path, maxBytes);
    };
    const bundle = await builder.build([file(`${PROJECT_ROOT}/main.ts`)], options());
    expect(bundle.files.map((f) => f.path)).toEqual([
      'main.ts',
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);
    expect(reads).toBe(1);
  });
});
