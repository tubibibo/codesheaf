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
  /** Settings overrides keyed by `section.key` (e.g. `codesheaf.format`). */
  settings: new Map<string, unknown>(),
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
  getConfiguration: (section: string) => ({
    get: (key: string, fallback?: unknown) => {
      const fullKey = `${section}.${key}`;
      if (state.settings.has(fullKey)) return state.settings.get(fullKey);
      // Preserve the historical default: the status-bar toggle is driven by
      // `setEnabled` unless a test pins an explicit setting override.
      if (fullKey === 'codesheaf.statusBar.enabled') return state.enabled;
      return fallback;
    },
  }),
  onDidChangeConfiguration: events.configuration.subscribe,
  onDidChangeTextDocument: events.document.subscribe,
};
export const StatusBarAlignment = { Right: 2 };

/** Pins a settings value for `getConfiguration(section).get(key, fallback)`. */
export function setSetting(fullKey: string, value: unknown): void {
  state.settings.set(fullKey, value);
}

export function setEnabled(enabled: boolean): void {
  state.enabled = enabled;
  events.configuration.fire({
    affectsConfiguration: (section) => section === 'codesheaf.statusBar.enabled',
  });
}

export function reset(): void {
  state.enabled = true;
  state.items.length = 0;
  state.settings.clear();
  for (const event of Object.values(events)) event.listeners.clear();
}
