import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BUNDLE_OPTIONS } from '../../src/core/domain/bundle';
// The real resolveOptions (the application barrel is mocked below for the
// command shell; this use-case module is not).
import { resolveOptions } from '../../src/application/use-cases/copy-as-context';
import { copyWithFormat, type AppContainer } from '../../src/adapters/commands/handlers';
import { reset, state, window } from '../support/vscode-stub';

type CopyFn = (
  deps: unknown,
  refs: readonly InputRef[],
  overrides?: Record<string, unknown>,
) => Promise<undefined>;

import type { InputRef } from '../../src/core/domain/bundle';

const copyAsContext = vi.fn<CopyFn>(async () => undefined);

vi.mock('../../src/application', () => ({
  copyAsContext: (...args: [unknown, readonly InputRef[], Record<string, unknown>?]) =>
    copyAsContext(...args),
  previewAsContext: vi.fn(async () => true),
}));

function makeDeps(): AppContainer {
  return {
    notifier: {
      showInformation: vi.fn(),
      showWarning: vi.fn(),
      showError: vi.fn(),
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as AppContainer;
}

function editorFor(fsPath: string): unknown {
  return {
    document: {
      uri: { scheme: 'file', fsPath },
      getText: () => 'export const live = 1;\n',
      languageId: 'typescript',
    },
    selection: { isEmpty: true },
  };
}

describe('copyWithFormat command', () => {
  beforeEach(() => {
    reset();
    copyAsContext.mockClear();
  });

  it('copies the active file with the picked format as override', async () => {
    state.quickPickChoice = 'XML';
    window.activeTextEditor = editorFor('C:/proj/src/a.ts') as never;
    await copyWithFormat(makeDeps());
    expect(copyAsContext).toHaveBeenCalledTimes(1);
    const refs = copyAsContext.mock.calls[0]?.[1];
    expect(refs).toEqual([
      {
        kind: 'file',
        absolutePath: 'C:/proj/src/a.ts',
        content: 'export const live = 1;\n',
        languageId: 'typescript',
      },
    ]);
    expect(copyAsContext.mock.calls[0]?.[2]).toEqual({ format: 'xml' });
  });

  it('invokes nothing when the QuickPick is dismissed (Esc)', async () => {
    window.activeTextEditor = editorFor('C:/proj/src/a.ts') as never;
    // state.quickPickChoice stays undefined = dismissed pick.
    await copyWithFormat(makeDeps());
    expect(copyAsContext).not.toHaveBeenCalled();
  });

  it('warns instead of picking when no editor is open', async () => {
    const deps = makeDeps();
    window.activeTextEditor = undefined as never;
    await copyWithFormat(deps);
    expect(copyAsContext).not.toHaveBeenCalled();
    expect(deps.notifier.showWarning).toHaveBeenCalledTimes(1);
  });
});

describe('resolveOptions format override', () => {
  it('lets a validated format override the configured one', () => {
    const options = resolveOptions(DEFAULT_BUNDLE_OPTIONS, { format: 'xml' });
    expect(options.format).toBe('xml');
    // Every other option passes through untouched.
    expect(options.maxImportDepth).toBe(DEFAULT_BUNDLE_OPTIONS.maxImportDepth);
    expect(options.secretScan).toBe(DEFAULT_BUNDLE_OPTIONS.secretScan);
  });

  it('combines the format with the import-depth floor', () => {
    const options = resolveOptions(
      { ...DEFAULT_BUNDLE_OPTIONS, maxImportDepth: 1 },
      { format: 'plain', ensureImportDepth: 3 },
    );
    expect(options.format).toBe('plain');
    expect(options.maxImportDepth).toBe(3);
  });

  it('returns the base options object when no override applies', () => {
    expect(resolveOptions(DEFAULT_BUNDLE_OPTIONS, {})).toBe(DEFAULT_BUNDLE_OPTIONS);
  });
});
