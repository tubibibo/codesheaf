/** Minimal headless VS Code surface for extension lifecycle regression tests. */
export interface TrackedDisposable {
  disposeCalls: number;
  dispose(): void;
}

function event<T>(): {
  readonly listeners: Set<(value: T) => void>;
  subscribe(listener: (value: T) => void): TrackedDisposable;
  fire(value: T): void;
} {
  const listeners = new Set<(value: T) => void>();
  return {
    listeners,
    subscribe(listener) {
      listeners.add(listener);
      return {
        disposeCalls: 0,
        dispose() {
          this.disposeCalls++;
          listeners.delete(listener);
        },
      };
    },
    fire(value) {
      for (const listener of [...listeners]) listener(value);
    },
  };
}

export const events = {
  configuration: event<{ affectsConfiguration(section: string): boolean }>(),
  editor: event<unknown>(),
  selection: event<unknown>(),
  document: event<{ document: unknown }>(),
};
export const state = {
  enabled: true,
  items: [] as TrackedDisposable[],
};
const document = { getText: () => 'const value = 1;' };
export const window = {
  activeTextEditor: { document, selection: { isEmpty: true } },
  onDidChangeActiveTextEditor: events.editor.subscribe,
  onDidChangeTextEditorSelection: events.selection.subscribe,
  createStatusBarItem() {
    const item = {
      disposeCalls: 0,
      dispose() {
        this.disposeCalls++;
      },
      show() {},
      hide() {},
    };
    state.items.push(item);
    return item;
  },
};
export const workspace = {
  getConfiguration: () => ({ get: () => state.enabled }),
  onDidChangeConfiguration: events.configuration.subscribe,
  onDidChangeTextDocument: events.document.subscribe,
};
export const StatusBarAlignment = { Right: 2 };

export function setEnabled(enabled: boolean): void {
  state.enabled = enabled;
  events.configuration.fire({
    affectsConfiguration: (section) => section === 'codesheaf.statusBar.enabled',
  });
}

export function reset(): void {
  state.enabled = true;
  state.items.length = 0;
  for (const event of Object.values(events)) event.listeners.clear();
}
