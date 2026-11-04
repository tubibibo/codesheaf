import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODESHEAF_VERSION } from '../../src/version';

describe('CODESHEAF_VERSION', () => {
  it('stays in sync with package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    ) as { version: string };
    expect(CODESHEAF_VERSION).toBe(pkg.version);
  });
});
