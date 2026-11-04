import type { InputRef } from '../../core/domain/bundle';
import type { ConfigPort, LoggerPort, NotificationPort, PreviewPort } from '../../core/ports';
import type { BundleBuilder } from '../../core/services/bundle-builder';
import { formatTokenCount } from '../../core/utils/format';
import { describe, resolveOptions, type CopyOverrides } from './copy-as-context';

export interface PreviewUseCaseDeps {
  readonly builder: BundleBuilder;
  readonly config: ConfigPort;
  readonly preview: PreviewPort;
  readonly notifier: NotificationPort;
  readonly logger: LoggerPort;
}

/**
 * Use case: weave the given inputs into a bundle and open the rendered text
 * in a read-only editor instead of the clipboard — handy for inspecting
 * exactly what an LLM would receive before pasting it anywhere.
 */
export async function previewAsContext(
  deps: PreviewUseCaseDeps,
  refs: readonly InputRef[],
  overrides: CopyOverrides = {},
): Promise<boolean> {
  const options = resolveOptions(deps.config.getBundleOptions(), overrides);
  try {
    const bundle = await deps.builder.build(refs, options);
    if (bundle.files.length === 0) {
      deps.notifier.showWarning(
        'CodeSheaf: nothing to preview — every candidate file was skipped.',
      );
      return false;
    }
    await deps.preview.openText(bundle.rendered, 'markdown');
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
