import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputRef } from '../../src/core/domain/bundle';

type UseCaseFn = (
  deps: unknown,
  refs: readonly InputRef[],
  overrides?: Record<string, unknown>,
) => Promise<unknown>;

const copyAsContext = vi.fn<UseCaseFn>(async () => undefined);
const previewAsContext = vi.fn<UseCaseFn>(async () => true);

vi.mock('../../src/application', () => ({
  copyAsContext: (...args: Parameters<UseCaseFn>) => copyAsContext(...args),
  previewAsContext: (...args: Parameters<UseCaseFn>) => previewAsContext(...args),
}));

import {
  copyFromExplorer,
  previewFromExplorer,
  type AppContainer,
} from '../../src/adapters/commands/handlers';
import * as vscode from 'vscode';
import { reset, state } from '../support/vscode-stub';

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

function refsOf(mock: typeof previewAsContext): readonly InputRef[] {
  const refs = mock.mock.calls.at(-1)?.[1];
  if (refs === undefined) throw new Error('use case was not called with refs');
  return refs;
}

describe('explorer commands (copy + preview)', () => {
  beforeEach(() => {
    reset();
    copyAsContext.mockClear();
    previewAsContext.mockClear();
  });

  it('previews the Explorer selection as file input refs', async () => {
    const deps = makeDeps();
    await previewFromExplorer(deps, [
      vscode.Uri.file('C:/proj/src/a.ts'),
      vscode.Uri.file('C:/proj/src/b.ts'),
    ]);
    expect(previewAsContext).toHaveBeenCalledTimes(1);
    expect(refsOf(previewAsContext)).toEqual([
      { kind: 'file', absolutePath: 'C:/proj/src/a.ts' },
      { kind: 'file', absolutePath: 'C:/proj/src/b.ts' },
    ]);
  });

  it('routes selected folders as directory inputs for preview too', async () => {
    state.directories.add('C:/proj/src');
    await previewFromExplorer(makeDeps(), [vscode.Uri.file('C:/proj/src')]);
    expect(refsOf(previewAsContext)).toEqual([{ kind: 'directory', absolutePath: 'C:/proj/src' }]);
  });

  it('flattens the multi-select array shape the Explorer passes', async () => {
    await previewFromExplorer(makeDeps(), [
      [vscode.Uri.file('C:/proj/a.ts'), vscode.Uri.file('C:/proj/b.ts')],
    ]);
    expect(refsOf(previewAsContext)).toHaveLength(2);
  });

  it('warns and invokes no use case for an empty selection', async () => {
    const deps = makeDeps();
    await previewFromExplorer(deps, []);
    expect(previewAsContext).not.toHaveBeenCalled();
    expect(deps.notifier.showWarning).toHaveBeenCalledTimes(1);
  });

  it('keeps routing copies through the same collection (shared plumbing)', async () => {
    const deps = makeDeps();
    await copyFromExplorer(deps, [vscode.Uri.file('C:/proj/src/a.ts')]);
    expect(copyAsContext).toHaveBeenCalledTimes(1);
    expect(refsOf(copyAsContext)).toEqual([{ kind: 'file', absolutePath: 'C:/proj/src/a.ts' }]);
    expect(previewAsContext).not.toHaveBeenCalled();
  });
});
