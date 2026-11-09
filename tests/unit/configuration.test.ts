import { beforeEach, describe, expect, it } from 'vitest';
import { VsCodeConfiguration } from '../../src/adapters/vscode/configuration.adapter';
import { DEFAULT_BUNDLE_OPTIONS } from '../../src/core/domain/bundle';
import { reset, setSetting } from '../support/vscode-stub';

beforeEach(() => reset());

const options = () => new VsCodeConfiguration().getBundleOptions();

describe('VsCodeConfiguration poisoning guards', () => {
  it('returns the documented defaults when nothing is set', () => {
    const value = options();
    expect(value.format).toBe(DEFAULT_BUNDLE_OPTIONS.format);
    expect(value.includeLineNumbers).toBe(false);
    expect(value.includeTree).toBe(true);
    expect(value.maxImportDepth).toBe(3);
    expect(value.maxFileSizeKB).toBe(256);
    expect(value.respectGitignore).toBe(true);
    expect(value.exclude).toEqual(DEFAULT_BUNDLE_OPTIONS.exclude);
    expect(value.secretScan).toBe('warn');
  });

  it('falls back to defaults for non-numeric numeric settings (CS-P1-01 class)', () => {
    setSetting('codesheaf.maxImportDepth', '5');
    setSetting('codesheaf.maxFileSizeKB', 'abc');
    expect(options().maxImportDepth).toBe(3);
    expect(options().maxFileSizeKB).toBe(256);
  });

  it('falls back to defaults for non-boolean boolean settings', () => {
    // A string "off" is truthy: without the guard it would silently *enable*
    // the feature it was meant to disable.
    setSetting('codesheaf.includeLineNumbers', 'off');
    setSetting('codesheaf.includeTree', 0);
    expect(options().includeLineNumbers).toBe(false);
    expect(options().includeTree).toBe(true);
  });

  it('honors real boolean settings', () => {
    setSetting('codesheaf.includeLineNumbers', true);
    setSetting('codesheaf.respectGitignore', false);
    expect(options().includeLineNumbers).toBe(true);
    expect(options().respectGitignore).toBe(false);
  });

  it('drops non-string entries from the exclude list instead of crashing the matcher', () => {
    setSetting('codesheaf.exclude', [5, 'dist-extra/**', {}, null]);
    expect(options().exclude).toEqual([...DEFAULT_BUNDLE_OPTIONS.exclude, 'dist-extra/**']);
  });

  it('rejects unknown formats', () => {
    setSetting('codesheaf.format', 'yaml');
    expect(options().format).toBe('markdown');
  });

  it('honors a real secretScan mode and falls back to warn for mistyped values', () => {
    setSetting('codesheaf.secretScan', 'off');
    expect(options().secretScan).toBe('off');
    setSetting('codesheaf.secretScan', 'enabled'); // not one of off/warn
    expect(options().secretScan).toBe('warn');
    setSetting('codesheaf.secretScan', 42);
    expect(options().secretScan).toBe('warn');
  });
});

describe('VsCodeConfiguration.isStatusBarEnabled', () => {
  it('defaults to enabled', () => {
    expect(new VsCodeConfiguration().isStatusBarEnabled()).toBe(true);
  });

  it('honors a real false and guards mistyped values', () => {
    setSetting('codesheaf.statusBar.enabled', false);
    expect(new VsCodeConfiguration().isStatusBarEnabled()).toBe(false);
    setSetting('codesheaf.statusBar.enabled', 'no');
    expect(new VsCodeConfiguration().isStatusBarEnabled()).toBe(true);
  });
});
