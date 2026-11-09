import type { ExtensionContext } from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, deactivate } from '../../src/extension';
import { events, reset, setEnabled, state, window } from '../support/vscode-stub';

// Isolate entry-point ownership while exercising the real TokenMeter.
vi.mock('../../src/composition/container', async () => {
  const { state } = await import('../support/vscode-stub');
  return {
    createContainer: () => ({
      estimator: () => 5,
      subscriptions: [],
      config: { isStatusBarEnabled: () => state.enabled },
    }),
  };
});
vi.mock('../../src/adapters/commands/register', () => ({ registerAllCommands: () => [] }));

function context(): ExtensionContext {
  return { subscriptions: [] } as unknown as ExtensionContext;
}

function disposeContext(ctx: ExtensionContext): void {
  for (const disposable of ctx.subscriptions) disposable.dispose();
}

function expectMeterListeners(count: number): void {
  expect(events.editor.listeners.size).toBe(count);
  expect(events.selection.listeners.size).toBe(count);
  expect(events.document.listeners.size).toBe(count);
}

describe('extension token meter ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reset();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    reset();
  });

  it('releases an enabled meter, its pending timer and listeners with the context', () => {
    const ctx = context();
    activate(ctx);
    expect(state.items).toHaveLength(1);
    expectMeterListeners(1);
    events.document.fire({ document: window.activeTextEditor.document });
    expect(vi.getTimerCount()).toBe(1);

    deactivate();
    disposeContext(ctx);
    expect(state.items[0]?.disposeCalls).toBe(1);
    expectMeterListeners(0);
    expect(events.configuration.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    disposeContext(ctx);
    expect(state.items[0]?.disposeCalls).toBe(1);
  });

  it('enables, disables and re-enables without retaining or re-disposing old meters', () => {
    state.enabled = false;
    const ctx = context();
    activate(ctx);
    const subscriptionCount = ctx.subscriptions.length;
    expect(state.items).toHaveLength(0);
    expectMeterListeners(0);

    for (let cycle = 0; cycle < 10; cycle++) {
      setEnabled(true);
      setEnabled(true);
      expect(state.items).toHaveLength(cycle + 1);
      expectMeterListeners(1);
      events.selection.fire(undefined);
      expect(vi.getTimerCount()).toBe(1);
      setEnabled(false);
      setEnabled(false);
      expect(state.items[cycle]?.disposeCalls).toBe(1);
      expectMeterListeners(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(ctx.subscriptions).toHaveLength(subscriptionCount);
    }

    setEnabled(true);
    expect(state.items).toHaveLength(11);
    expectMeterListeners(1);
    disposeContext(ctx);
    expect(state.items.every((item) => item.disposeCalls === 1)).toBe(true);
    expectMeterListeners(0);
    expect(events.configuration.listeners.size).toBe(0);
    setEnabled(true);
    expect(state.items).toHaveLength(11);
  });

  it('ignores unrelated configuration and disposes safely when initially disabled', () => {
    state.enabled = false;
    const ctx = context();
    activate(ctx);
    events.configuration.fire({ affectsConfiguration: () => false });
    expect(state.items).toHaveLength(0);
    expectMeterListeners(0);
    disposeContext(ctx);
    expect(events.configuration.listeners.size).toBe(0);
  });
});
