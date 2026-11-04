import { describe, expect, it } from 'vitest';
import { renderFileTree } from '../../src/core/services/tree-renderer';

describe('renderFileTree', () => {
  it('renders directories first, alphabetically, with box-drawing branches', () => {
    const tree = renderFileTree(['src/a.ts', 'src/core/b.ts', 'README.md']);
    expect(tree.split('\n')).toEqual([
      'project/',
      '├── src/',
      '│   ├── core/',
      '│   │   └── b.ts',
      '│   └── a.ts',
      '└── README.md',
    ]);
  });

  it('marks directories with a trailing slash', () => {
    const tree = renderFileTree(['pkg/mod.py']);
    expect(tree).toContain('pkg/');
  });

  it('falls back to a bare root for no paths', () => {
    expect(renderFileTree([])).toBe('project/');
  });

  it('accepts a custom root label', () => {
    expect(renderFileTree(['a.ts'], 'bundle').startsWith('bundle/')).toBe(true);
  });
});
