import type { BundleFormat, BundleOptions, InputRef } from '../../core/domain/bundle';
import type { ConfigPort, LoggerPort, NotificationPort, PreviewPort } from '../../core/ports';
import type { BundleBuilder } from '../../core/services/bundle-builder';
import { formatTokenCount } from '../../core/utils/format';
import {
  collectSecretFindings,
  describe,
  resolveOptions,
  summarizeSecretFindings,
  type CopyOverrides,
} from './copy-as-context';

export interface PreviewUseCaseDeps {
  readonly builder: BundleBuilder;
  readonly config: ConfigPort;
  readonly preview: PreviewPort;
  readonly notifier: NotificationPort;
  readonly logger: LoggerPort;
}

/** Maps a bundle format to the editor language used for its preview tab. */
export function previewLanguageForFormat(format: BundleFormat): string {
  switch (format) {
    case 'xml':
      return 'xml';
    case 'plain':
      return 'plaintext';
    case 'markdown':
    default:
      return 'markdown';
  }
}

/**
 * Use case: weave the given inputs into a bundle and open the rendered text
 * in a separate editor tab (no clipboard write) — handy for inspecting
 * exactly what an LLM would receive before pasting it anywhere. Untitled
 * tabs are technically editable; that is a documented trade-off, not a
 * read-only view.
 */
export async function previewAsContext(
  deps: PreviewUseCaseDeps,
  refs: readonly InputRef[],
  overrides: CopyOverrides = {},
): Promise<boolean> {
  // Previews are the review surface: unlike clipboard copies they render the
  // skipped-files section, so "why did this file not make it in?" is
  // answerable without opening the output channel.
  const options: BundleOptions = {
    ...resolveOptions(deps.config.getBundleOptions(), overrides),
    includeSkippedSection: true,
  };
  try {
    const bundle = await deps.builder.build(refs, options);
    if (bundle.files.length === 0) {
      deps.notifier.showWarning(
        'CodeSheaf: nothing to preview — every candidate file was skipped.',
      );
      return false;
    }
    // Previews are the review surface (ADR-0008): a flagged bundle still
    // opens — the user asked to look at it — but the warning names what the
    // scan saw. Copying that same bundle keeps its own confirmation.
    if (options.secretScan === 'warn') {
      const findings = collectSecretFindings(bundle.files);
      if (findings.length > 0) {
        deps.notifier.showWarning(
          `CodeSheaf: ${summarizeSecretFindings(findings, 'preview')}. Copying will still ask for confirmation.`,
        );
      }
    }
    await deps.preview.openText(bundle.rendered, previewLanguageForFormat(bundle.format));
    deps.notifier.showInformation(
      `CodeSheaf: previewing ${bundle.files.length} file(s) · ~${formatTokenCount(bundle.estimatedTokens)} tokens`,
    );
    return true;
  } catch (error) {
    const message = describe(error);
    deps.logger.error(message);
    deps.notifier.showError(`CodeSheaf: ${message}`);
    return false;
  }
}
