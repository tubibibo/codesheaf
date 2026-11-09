import type { BundleOptions } from '../domain/bundle';

/** Port: reads the user's bundle settings. */
export interface ConfigPort {
  getBundleOptions(): BundleOptions;
  /** Whether the live token meter should exist (guarded against mistyped values). */
  isStatusBarEnabled(): boolean;
}
