import { describe, expect, it } from 'vitest';
import { renderBundle, type RenderInput } from '../../src/core/services/formatter';

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

describe('renderBundle task header', () => {
  it('renders a markdown quote block between the title and the tree', () => {
    const rendered = renderBundle(
      input({ taskHeader: 'Review for security issues', includeTree: true, tree: 'proj/' }),
    );
    const title = rendered.indexOf('# CodeSheaf Context Bundle');
    const task = rendered.indexOf('> Review for security issues');
    const tree = rendered.indexOf('## Project Tree');
    expect(task).toBeGreaterThan(title);
    expect(tree).toBeGreaterThan(task);
  });

  it('prefixes every line of a multiline header (blank lines become >)', () => {
    const rendered = renderBundle(input({ taskHeader: 'first\n\nsecond' }));
    expect(rendered).toContain('> first\n>\n> second');
  });

  it('keeps backticks literal inside the markdown quote', () => {
    const rendered = renderBundle(input({ taskHeader: 'Run `npm test` first' }));
    expect(rendered).toContain('> Run `npm test` first');
  });

  it('defuses ]]> inside the XML task element', () => {
    const rendered = renderBundle(input({ format: 'xml', taskHeader: 'a ]]> b' }));
    expect(rendered).toContain('<task><![CDATA[a ]]]]><![CDATA[> b]]></task>');
  });

  it('renders the XML task before the tree', () => {
    const rendered = renderBundle(
      input({ format: 'xml', taskHeader: 'Check', includeTree: true, tree: 'proj/' }),
    );
    expect(rendered.indexOf('<task>')).toBeLessThan(rendered.indexOf('<tree>'));
  });

  it('embeds the header inside the plain title section', () => {
    const rendered = renderBundle(input({ format: 'plain', taskHeader: 'Check imports' }));
    const titleEnd = rendered.indexOf('CodeSheaf vTest');
    const task = rendered.indexOf('TASK:\nCheck imports');
    expect(task).toBeGreaterThan(titleEnd);
    // The closing separator of the title section follows the task block.
    expect(rendered.indexOf('='.repeat(78), task)).toBeGreaterThan(task);
  });

  it('preserves newlines in the plain section', () => {
    const rendered = renderBundle(input({ format: 'plain', taskHeader: 'one\ntwo' }));
    expect(rendered).toContain('TASK:\none\ntwo');
  });

  it('renders nothing for an empty or missing header in every format', () => {
    for (const taskHeader of [undefined, '']) {
      expect(renderBundle(input({ taskHeader }))).toBe(renderBundle(input()));
      expect(renderBundle(input({ format: 'xml', taskHeader }))).toBe(
        renderBundle(input({ format: 'xml' })),
      );
      expect(renderBundle(input({ format: 'plain', taskHeader }))).toBe(
        renderBundle(input({ format: 'plain' })),
      );
    }
  });
});
