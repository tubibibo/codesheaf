import { describe, expect, it } from 'vitest';
import { renderBundle, type RenderInput } from '../../src/core/services/formatter';
import type { SkippedEntry } from '../../src/core/domain/bundle';

function input(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    files: [],
    tree: '',
    format: 'markdown',
    includeLineNumbers: false,
    includeTree: false,
    generator: 'CodeSheaf vTest',
    ...overrides,
  };
}

function skips(count: number): SkippedEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `src/file${index}.ts`,
    reason: 'binary' as const,
  }));
}

describe('renderBundle skipped section', () => {
  it('omits the section when skipped is undefined (clipboard copies)', () => {
    const rendered = renderBundle(input());
    expect(rendered).not.toContain('Skipped');
    expect(rendered).not.toContain('SKIPPED');
  });

  it('omits the section when nothing was skipped', () => {
    const rendered = renderBundle(input({ skipped: [] }));
    expect(rendered).not.toContain('Skipped');
  });

  it('renders a markdown list with escaped paths and reasons', () => {
    const rendered = renderBundle(
      input({ skipped: [{ path: 'docs/a#b`c.ts', reason: 'encoding' }] }),
    );
    expect(rendered).toContain('## Skipped Files');
    expect(rendered).toContain('`docs/a\\#b\\`c.ts` — encoding');
  });

  it('renders an XML block with escaped attributes and a total count', () => {
    const rendered = renderBundle(
      input({
        format: 'xml',
        skipped: [
          { path: 'a"b.ts', reason: 'too-large' },
          { path: 'c.ts', reason: 'ignored' },
        ],
      }),
    );
    expect(rendered).toContain('<skipped count="2">');
    expect(rendered).toContain('<file path="a&quot;b.ts" reason="too-large" />');
  });

  it('renders a plain section after the files', () => {
    const rendered = renderBundle(
      input({ format: 'plain', skipped: [{ path: 'img/logo.png', reason: 'binary' }] }),
    );
    expect(rendered).toContain('SKIPPED (1):');
    expect(rendered).toContain('  img/logo.png — binary');
  });

  it('caps the listing at 50 rows and points at the output channel', () => {
    const rendered = renderBundle(input({ skipped: skips(60) }));
    expect(rendered).toContain('… and 10 more (see the CodeSheaf output channel)');
    expect(rendered).toContain('file49.ts');
    expect(rendered).not.toContain('file50.ts');
    expect(rendered).not.toContain('file59.ts');
  });
});
