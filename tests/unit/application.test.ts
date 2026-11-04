import { describe, expect, it } from 'vitest';
import { DEFAULT_BUNDLE_OPTIONS } from '../../src/core/domain/bundle';
import type {
  ClipboardPort,
  ConfigPort,
  LoggerPort,
  NotificationPort,
  PreviewPort,
} from '../../src/core/ports';
import {
  copyAsContext,
  previewAsContext,
  type CopyUseCaseDeps,
  type PreviewUseCaseDeps,
} from '../../src/application';
import { makeBuilder } from '../support/harness';

const FIXTURES: Record<string, string> = {
  'C:/proj/src/a.ts': 'import { b } from "./b";\nexport const a = 1;\n',
  'C:/proj/src/b.ts': 'export const b = 2;\n',
  'C:/proj/data.bin': 'x\x00y\n',
};

class FakeClipboard implements ClipboardPort {
  readonly texts: string[] = [];
  async writeText(text: string): Promise<void> {
    this.texts.push(text);
  }
}

class FakeNotifier implements NotificationPort {
  readonly info: string[] = [];
  readonly warnings: string[] = [];
  readonly errors: string[] = [];
  showInformation(message: string): void {
    this.info.push(message);
  }
  showWarning(message: string): void {
    this.warnings.push(message);
  }
  showError(message: string): void {
    this.errors.push(message);
  }
}

class FakeLogger implements LoggerPort {
  readonly lines: string[] = [];
  debug(message: string): void {
    this.lines.push(message);
  }
  info(message: string): void {
    this.lines.push(message);
  }
  warn(message: string): void {
    this.lines.push(message);
  }
  error(message: string): void {
    this.lines.push(message);
  }
}

class FakeConfig implements ConfigPort {
  constructor(readonly options: Partial<typeof DEFAULT_BUNDLE_OPTIONS> = {}) {}
  getBundleOptions() {
    return { ...DEFAULT_BUNDLE_OPTIONS, ...this.options };
  }
}

class FakePreview implements PreviewPort {
  readonly opened: { content: string; languageId: string }[] = [];
  async openText(content: string, languageId: string): Promise<void> {
    this.opened.push({ content, languageId });
  }
}

function makeDeps(configOptions: Partial<typeof DEFAULT_BUNDLE_OPTIONS> = {}): {
  copy: CopyUseCaseDeps;
  preview: PreviewUseCaseDeps;
  clipboard: FakeClipboard;
  notifier: FakeNotifier;
  previewPort: FakePreview;
} {
  const { builder } = makeBuilder(FIXTURES);
  const clipboard = new FakeClipboard();
  const notifier = new FakeNotifier();
  const logger = new FakeLogger();
  const config = new FakeConfig(configOptions);
  const previewPort = new FakePreview();
  return {
    copy: { builder, config, clipboard, notifier, logger },
    preview: { builder, config, preview: previewPort, notifier, logger },
    clipboard,
    notifier,
    previewPort,
  };
}

describe('copyAsContext', () => {
  it('wires bundle output into the clipboard and reports a summary', async () => {
    const deps = makeDeps();
    const result = await copyAsContext(deps.copy, [
      { kind: 'file', absolutePath: 'C:/proj/src/a.ts' },
    ]);
    expect(result).toEqual({ fileCount: 2, estimatedTokens: expect.any(Number), skippedCount: 0 });
    expect(deps.clipboard.texts[0]).toContain('## src/a.ts');
    expect(deps.clipboard.texts[0]).toContain('## src/b.ts');
    expect(deps.notifier.info[0]).toContain('copied 2 file(s)');
  });

  it('warns instead of copying when everything was skipped', async () => {
    const deps = makeDeps();
    const result = await copyAsContext(deps.copy, [
      { kind: 'file', absolutePath: 'C:/proj/data.bin' },
    ]);
    expect(result).toBeUndefined();
    expect(deps.clipboard.texts).toHaveLength(0);
    expect(deps.notifier.warnings[0]).toContain('nothing to copy');
  });

  it('surfaces BundleError through the error notification', async () => {
    const deps = makeDeps();
    const result = await copyAsContext(deps.copy, []);
    expect(result).toBeUndefined();
    expect(deps.notifier.errors[0]).toContain('zero inputs');
  });

  it('raises the import depth when the command asks for it', async () => {
    const deps = makeDeps({ maxImportDepth: 0 });
    const result = await copyAsContext(
      deps.copy,
      [{ kind: 'file', absolutePath: 'C:/proj/src/a.ts' }],
      {
        ensureImportDepth: 3,
      },
    );
    expect(result?.fileCount).toBe(2);
  });
});

describe('previewAsContext', () => {
  it('opens the rendered bundle in a preview editor', async () => {
    const deps = makeDeps();
    const ok = await previewAsContext(deps.preview, [
      { kind: 'file', absolutePath: 'C:/proj/src/a.ts' },
    ]);
    expect(ok).toBe(true);
    expect(deps.previewPort.opened[0]?.languageId).toBe('markdown');
    expect(deps.previewPort.opened[0]?.content).toContain('# CodeSheaf Context Bundle');
  });

  it('returns false when nothing could be woven', async () => {
    const deps = makeDeps();
    const ok = await previewAsContext(deps.preview, []);
    expect(ok).toBe(false);
    expect(deps.notifier.errors[0]).toContain('zero inputs');
  });
});
