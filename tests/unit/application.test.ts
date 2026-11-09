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
  describeSecretFindings,
  describeSkips,
  previewAsContext,
  previewLanguageForFormat,
  type CopyUseCaseDeps,
  type PreviewUseCaseDeps,
} from '../../src/application';
import { PROJECT_ROOT } from '../support/fake-fs';
import { makeBuilder } from '../support/harness';

const FIXTURES: Record<string, string> = {
  [`${PROJECT_ROOT}/src/a.ts`]: 'import { b } from "./b";\nexport const a = 1;\n',
  [`${PROJECT_ROOT}/src/b.ts`]: 'export const b = 2;\n',
  // A stand-in leaked credential for the secret-scan warn flow (ADR-0008).
  [`${PROJECT_ROOT}/src/creds.ts`]:
    'const deployToken = "ghp_123456789012345678901234567890123456";\n',
  [`${PROJECT_ROOT}/data.bin`]: 'x\x00y\n',
};

class FakeClipboard implements ClipboardPort {
  readonly texts: string[] = [];
  failWith: Error | undefined;
  async writeText(text: string): Promise<void> {
    if (this.failWith !== undefined) throw this.failWith;
    this.texts.push(text);
  }
}

class FakeNotifier implements NotificationPort {
  readonly info: string[] = [];
  readonly warnings: string[] = [];
  readonly errors: string[] = [];
  readonly confirms: { message: string; actions: readonly string[] }[] = [];
  /** What the next `confirm` resolves with; `undefined` models a dismissed dialog. */
  confirmAnswer: string | undefined;
  showInformation(message: string): void {
    this.info.push(message);
  }
  showWarning(message: string): void {
    this.warnings.push(message);
  }
  showError(message: string): void {
    this.errors.push(message);
  }
  async confirm(message: string, actions: readonly string[]): Promise<string | undefined> {
    this.confirms.push({ message, actions });
    return this.confirmAnswer;
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
  isStatusBarEnabled() {
    return true;
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
  logger: FakeLogger;
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
    logger,
    previewPort,
  };
}

describe('copyAsContext', () => {
  it('wires bundle output into the clipboard and reports a summary', async () => {
    const deps = makeDeps();
    const result = await copyAsContext(deps.copy, [
      { kind: 'file', absolutePath: `${PROJECT_ROOT}/src/a.ts` },
    ]);
    expect(result).toEqual({ fileCount: 2, estimatedTokens: expect.any(Number), skippedCount: 0 });
    expect(deps.clipboard.texts[0]).toContain('## src/a.ts');
    expect(deps.clipboard.texts[0]).toContain('## src/b.ts');
    expect(deps.notifier.info[0]).toContain('copied 2 file(s)');
  });

  it('warns instead of copying when everything was skipped', async () => {
    const deps = makeDeps();
    const result = await copyAsContext(deps.copy, [
      { kind: 'file', absolutePath: `${PROJECT_ROOT}/data.bin` },
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
      [{ kind: 'file', absolutePath: `${PROJECT_ROOT}/src/a.ts` }],
      {
        ensureImportDepth: 3,
      },
    );
    expect(result?.fileCount).toBe(2);
  });

  it('reports clipboard failures instead of leaking an unhandled rejection', async () => {
    const deps = makeDeps();
    deps.clipboard.failWith = new Error('clipboard denied');
    const result = await copyAsContext(deps.copy, [
      { kind: 'file', absolutePath: `${PROJECT_ROOT}/src/a.ts` },
    ]);
    expect(result).toBeUndefined();
    expect(deps.clipboard.texts).toHaveLength(0);
    expect(deps.notifier.errors[0]).toContain('clipboard denied');
  });
});

describe('previewAsContext', () => {
  it('opens the rendered bundle in a preview editor', async () => {
    const deps = makeDeps();
    const ok = await previewAsContext(deps.preview, [
      { kind: 'file', absolutePath: `${PROJECT_ROOT}/src/a.ts` },
    ]);
    expect(ok).toBe(true);
    expect(deps.previewPort.opened[0]?.languageId).toBe('markdown');
    expect(deps.previewPort.opened[0]?.content).toContain('# CodeSheaf Context Bundle');
  });

  it('previews xml bundles with xml highlighting', async () => {
    const deps = makeDeps({ format: 'xml' });
    await previewAsContext(deps.preview, [
      { kind: 'file', absolutePath: `${PROJECT_ROOT}/src/a.ts` },
    ]);
    expect(deps.previewPort.opened[0]?.languageId).toBe('xml');
    expect(deps.previewPort.opened[0]?.content).toContain('<codesheaf');
  });

  it('previews plain bundles without highlighting', async () => {
    const deps = makeDeps({ format: 'plain' });
    await previewAsContext(deps.preview, [
      { kind: 'file', absolutePath: `${PROJECT_ROOT}/src/a.ts` },
    ]);
    expect(deps.previewPort.opened[0]?.languageId).toBe('plaintext');
  });

  it('returns false when nothing could be woven', async () => {
    const deps = makeDeps();
    const ok = await previewAsContext(deps.preview, []);
    expect(ok).toBe(false);
    expect(deps.notifier.errors[0]).toContain('zero inputs');
  });
});

describe('previewLanguageForFormat', () => {
  it('maps every bundle format to an editor language', () => {
    expect(previewLanguageForFormat('markdown')).toBe('markdown');
    expect(previewLanguageForFormat('xml')).toBe('xml');
    expect(previewLanguageForFormat('plain')).toBe('plaintext');
  });
});

describe('describeSkips', () => {
  it('lists every skip with its reason', () => {
    expect(
      describeSkips([
        { path: 'a.png', reason: 'binary' },
        { path: 'legacy.txt', reason: 'encoding' },
      ]),
    ).toBe('binary a.png, encoding legacy.txt');
  });

  it('truncates huge directory picks to 50 rows plus a count', () => {
    const entries = Array.from({ length: 60 }, (_, index) => ({
      path: `f${index}.ts`,
      reason: 'ignored' as const,
    }));
    const text = describeSkips(entries);
    expect(text).toContain('ignored f49.ts');
    expect(text).not.toContain('f50.ts');
    expect(text.endsWith('…and 10 more')).toBe(true);
  });
});

describe('secret scanning (warn flow, ADR-0008)', () => {
  const secretRef = { kind: 'file' as const, absolutePath: `${PROJECT_ROOT}/src/creds.ts` };

  it('blocks the clipboard behind a confirm when a finding is reported', async () => {
    const deps = makeDeps();
    const result = await copyAsContext(deps.copy, [secretRef]);
    expect(deps.notifier.confirms).toHaveLength(1);
    expect(deps.notifier.confirms[0]?.message).toContain('1 possible secret(s) in this bundle');
    expect(deps.notifier.confirms[0]?.message).toContain('GitHub token');
    expect(deps.notifier.confirms[0]?.message).toContain('src/creds.ts:1');
    expect(deps.notifier.confirms[0]?.message).not.toContain('ghp_');
    expect(deps.notifier.confirms[0]?.actions).toEqual(['Copy anyway', 'Cancel']);
    // dismissed (undefined) means: nothing copied, user told why, details logged
    expect(result).toBeUndefined();
    expect(deps.clipboard.texts).toHaveLength(0);
    expect(deps.notifier.warnings.at(-1)).toContain('nothing was copied');
    expect(deps.logger.lines.at(-1)).toContain('secret findings:');
    expect(deps.logger.lines.at(-1)).toContain('src/creds.ts:1 github-token');
  });

  it('copies when the user chooses Copy anyway', async () => {
    const deps = makeDeps();
    deps.notifier.confirmAnswer = 'Copy anyway';
    const result = await copyAsContext(deps.copy, [secretRef]);
    expect(result?.fileCount).toBe(1);
    expect(deps.clipboard.texts).toHaveLength(1);
  });

  it('never confirms and copies straight away when secretScan is off', async () => {
    const deps = makeDeps({ secretScan: 'off' });
    const result = await copyAsContext(deps.copy, [secretRef]);
    expect(deps.notifier.confirms).toHaveLength(0);
    expect(deps.clipboard.texts).toHaveLength(1);
    expect(result?.fileCount).toBe(1);
  });

  it('leaves clean bundles alone', async () => {
    const deps = makeDeps();
    const result = await copyAsContext(deps.copy, [
      { kind: 'file', absolutePath: `${PROJECT_ROOT}/src/a.ts` },
    ]);
    expect(deps.notifier.confirms).toHaveLength(0);
    expect(deps.clipboard.texts).toHaveLength(1);
    expect(result?.fileCount).toBe(2);
  });

  it('warns about findings in preview without blocking it', async () => {
    const deps = makeDeps();
    const ok = await previewAsContext(deps.preview, [secretRef]);
    expect(ok).toBe(true);
    expect(deps.previewPort.opened).toHaveLength(1);
    expect(deps.notifier.confirms).toHaveLength(0);
    expect(deps.notifier.warnings[0]).toContain('1 possible secret(s) in this preview');
    expect(deps.notifier.warnings[0]).toContain('src/creds.ts:1');
    expect(deps.notifier.warnings[0]).not.toContain('ghp_');
  });

  it('stays silent in preview when secretScan is off', async () => {
    const deps = makeDeps({ secretScan: 'off' });
    const ok = await previewAsContext(deps.preview, [secretRef]);
    expect(ok).toBe(true);
    expect(deps.notifier.warnings).toHaveLength(0);
    expect(deps.previewPort.opened).toHaveLength(1);
  });
});

describe('describeSecretFindings', () => {
  it('lists path:line ruleId entries and truncates like skip details', () => {
    const findings = Array.from({ length: 60 }, (_, index) => ({
      path: `f${index}.ts`,
      ruleId: 'aws-access-key',
      label: 'AWS access key ID',
      line: index + 1,
    }));
    const text = describeSecretFindings(findings);
    expect(text).toContain('f0.ts:1 aws-access-key');
    expect(text).toContain('f49.ts:50 aws-access-key');
    expect(text).not.toContain('f50.ts');
    expect(text.endsWith('…and 10 more')).toBe(true);
  });
});
