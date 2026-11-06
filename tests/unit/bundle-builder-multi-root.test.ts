import { describe, expect, it } from 'vitest';
import { DEFAULT_BUNDLE_OPTIONS } from '../../src/core';
import { PROJECT_ROOT } from '../support/fake-fs';
import { makeBuilder } from '../support/harness';

describe('BundleBuilder multi-root display paths', () => {
  it('keeps identically named files from different roots distinct in paths and the tree', async () => {
    const roots = [`${PROJECT_ROOT}/client`, `${PROJECT_ROOT}/server`];
    const paths = roots.map((root) => `${root}/src/index.ts`);
    const { builder } = makeBuilder(
      Object.fromEntries(paths.map((path) => [path, 'value'])),
      roots,
    );
    const bundle = await builder.build(
      paths.map((absolutePath) => ({ kind: 'file', absolutePath })),
      DEFAULT_BUNDLE_OPTIONS,
    );
    expect(bundle.files.map((file) => file.path)).toEqual([
      'client/src/index.ts',
      'server/src/index.ts',
    ]);
    expect(bundle.tree).toBe(
      'project/\n├── client/\n│   └── src/\n│       └── index.ts\n└── server/\n    └── src/\n        └── index.ts',
    );
  });

  it('disambiguates duplicate root names without colliding with literal suffixed root names', async () => {
    const roots = [`${PROJECT_ROOT}/a/app`, `${PROJECT_ROOT}/b/app`, `${PROJECT_ROOT}/app [1]`];
    const paths = roots.map((root) => `${root}/same.ts`);
    const { builder } = makeBuilder(
      Object.fromEntries(paths.map((path) => [path, 'value'])),
      roots,
    );
    const bundle = await builder.build(
      paths.map((absolutePath) => ({ kind: 'file', absolutePath })),
      DEFAULT_BUNDLE_OPTIONS,
    );
    expect(bundle.files.map((file) => file.path)).toEqual([
      'app [2]/same.ts',
      'app [3]/same.ts',
      'app [1]/same.ts',
    ]);
  });

  it('qualifies skipped paths while matching gitignore against root-relative paths', async () => {
    const roots = [`${PROJECT_ROOT}/client`, `${PROJECT_ROOT}/server`];
    const { builder } = makeBuilder(
      {
        [`${roots[0]}/.gitignore`]: '/secret.ts\n',
        [`${roots[0]}/secret.ts`]: 'hidden',
        [`${roots[1]}/secret.ts`]: 'visible',
      },
      roots,
    );
    const bundle = await builder.build(
      roots.map((root) => ({
        kind: 'file',
        absolutePath: `${root}/secret.ts`,
        ignorePolicy: 'respect',
      })),
      DEFAULT_BUNDLE_OPTIONS,
    );
    expect(bundle.files.map((file) => file.path)).toEqual(['server/secret.ts']);
    expect(bundle.skipped).toEqual([{ path: 'client/secret.ts', reason: 'ignored' }]);
  });

  it('preserves single-root and outside-workspace display paths', async () => {
    const root = `${PROJECT_ROOT}/client`;
    const { builder } = makeBuilder(
      { [`${root}/src/index.ts`]: 'value', [`${PROJECT_ROOT}/outside.ts`]: 'outside' },
      root,
    );
    const bundle = await builder.build(
      [
        { kind: 'file', absolutePath: `${root}/src/index.ts` },
        { kind: 'file', absolutePath: `${PROJECT_ROOT}/outside.ts` },
      ],
      DEFAULT_BUNDLE_OPTIONS,
    );
    expect(bundle.files.map((file) => file.path)).toEqual(['src/index.ts', 'outside.ts']);
  });
});
