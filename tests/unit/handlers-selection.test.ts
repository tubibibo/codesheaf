import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputRef } from '../../src/core/domain/bundle';

type CopyFn = (
  deps: unknown,
  refs: readonly InputRef[],
  overrides?: Record<string, unknown>,
) => Promise<undefined>;

const copyAsContext = vi.fn<CopyFn>(async () => undefined);

vi.mock('../../src/application', () => ({
  copyAsContext: (...args: [unknown, readonly InputRef[], Record<string, unknown>?]) =>
    copyAsContext(...args),
  previewAsContext: vi.fn(async () => true),
}));

import {
  copyActiveFile,
  copySelection,
  type AppContainer,
} from '../../src/adapters/commands/handlers';
import { reset, window } from '../support/vscode-stub';

interface FakeDocument {
  uri: { scheme: string; fsPath: string };
  getText: () => string;
  languageId: string;
}

function editorWith(
  uri: { scheme: string; fsPath: string },
  selection: {
    isEmpty: boolean;
    start?: { line: number; character: number };
    end?: { line: number; character: number };
  },
): { document: FakeDocument; selection: object } {
  return {
    document: {
      uri,
      getText: () => 'line0\nline1\nline2\nline3',
      languageId: 'typescript',
    },
    selection,
  };
}

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

function lastRef(): InputRef {
  const call = copyAsContext.mock.calls.at(-1);
  const refs = call?.[1];
  const ref = refs?.[0];
  if (ref === undefined) throw new Error('copyAsContext was not called with a ref');
  return ref;
}

describe('editor command input refs', () => {
  beforeEach(() => {
    reset();
    copyAsContext.mockClear();
  });

  it('disables import following for selections in untitled documents (ADR-0006)', () => {
    window.activeTextEditor = editorWith(
      { scheme: 'untitled', fsPath: '\\Untitled-1' },
      { isEmpty: false, start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    ) as never;
    copySelection(makeDeps());
    expect(lastRef()).toMatchObject({ kind: 'selection', resolveImports: false });
  });

  it('leaves import following on for selections in real files', () => {
    window.activeTextEditor = editorWith(
      { scheme: 'file', fsPath: 'C:/proj/src/a.ts' },
      { isEmpty: false, start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    ) as never;
    copySelection(makeDeps());
    expect('resolveImports' in lastRef()).toBe(false);
  });

  it('disables import following for untitled whole-file copies too', () => {
    window.activeTextEditor = editorWith(
      { scheme: 'untitled', fsPath: '\\Untitled-2' },
      { isEmpty: false },
    ) as never;
    copyActiveFile(makeDeps());
    expect(lastRef()).toMatchObject({ kind: 'file', resolveImports: false });
  });

  it('computes the 1-based inclusive selection range for both end-of-line shapes', () => {
    const deps = makeDeps();
    window.activeTextEditor = editorWith(
      { scheme: 'file', fsPath: 'C:/proj/src/a.ts' },
      // Ends at column 0 of line 3 (0-based): the range must stay 2..3.
      { isEmpty: false, start: { line: 1, character: 0 }, end: { line: 3, character: 0 } },
    ) as never;
    copySelection(deps);
    expect(lastRef()).toMatchObject({ kind: 'selection', startLine: 2, endLine: 3 });

    copyAsContext.mockClear();
    window.activeTextEditor = editorWith(
      { scheme: 'file', fsPath: 'C:/proj/src/a.ts' },
      // Ends mid-line 3: the range extends through line 3.
      { isEmpty: false, start: { line: 1, character: 2 }, end: { line: 3, character: 4 } },
    ) as never;
    copySelection(deps);
    expect(lastRef()).toMatchObject({ kind: 'selection', startLine: 2, endLine: 4 });
  });

  it('warns instead of copying when the selection is empty', async () => {
    const deps = makeDeps();
    window.activeTextEditor = editorWith(
      { scheme: 'file', fsPath: 'C:/proj/src/a.ts' },
      { isEmpty: true },
    ) as never;
    copySelection(deps);
    await Promise.resolve();
    expect(copyAsContext).not.toHaveBeenCalled();
    expect(deps.notifier.showWarning).toHaveBeenCalledTimes(1);
  });
});
