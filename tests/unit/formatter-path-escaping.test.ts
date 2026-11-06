import { describe, expect, it } from 'vitest';
import type { BundledFile } from '../../src/core/domain/bundle';
import { renderBundle } from '../../src/core/services/formatter';

function renderPath(path: string, content = 'const value = "# [content](url)";'): string {
  const file: BundledFile = {
    path,
    absolutePath: `/project/${path}`,
    languageId: 'typescript',
    content,
    origin: 'explicit',
    chars: content.length,
    estimatedTokens: 1,
  };
  return renderBundle({
    files: [file],
    tree: '',
    format: 'markdown',
    includeLineNumbers: false,
    includeTree: false,
    generator: 'test',
  });
}

describe('Markdown file path headings', () => {
  it('escapes Markdown and HTML syntax while leaving file content unchanged', () => {
    const content = 'const value = "# [content](url)";';
    const out = renderPath('src/# *_[link](url)<tag>&copy;`x`!{x}|~\\.ts', content);
    expect(out).toContain(
      '## src/\\# \\*\\_\\[link\\]\\(url\\)\\<tag\\>&amp;copy;\\`x\\`\\!\\{x\\}\\|\\~\\\\.ts',
    );
    expect(out).toContain(`\n\n\`\`\`ts\n${content}\n\`\`\`\n`);
  });

  it('keeps CR and LF in a path inside one heading instead of creating new blocks', () => {
    const out = renderPath('src/name\r\n## injected\n[link](url).ts');
    expect(out).toContain('## src/name&#13;&#10;\\#\\# injected&#10;\\[link\\]\\(url\\).ts\n');
    expect(out).not.toContain('\n## injected');
    expect(out.split('\n').filter((line) => line.startsWith('## '))).toHaveLength(1);
  });

  it('preserves ordinary path headings', () => {
    expect(renderPath('src/my-file.test.ts')).toContain('## src/my-file.test.ts\n');
  });
});
