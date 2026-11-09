/**
 * Numeric sanitizing for user configuration. VS Code returns whatever is
 * stored in settings.json verbatim, so a mistyped value (`"5"`, `"abc"`,
 * `null`) reaches the adapter typed as `number` but is not a finite number.
 * Without a guard, NaN used to propagate into `maxBytes` and silently
 * disable the size cap (audit finding CS-P1-01); non-numbers now fall back
 * to the documented default instead.
 */

/**
 * Floors a finite number and clamps it into `[min, max]` (open-ended when
 * `max` is omitted). Anything that is not a finite number — strings,
 * `NaN`, infinities — falls back to `fallback`, mirroring how LRC
 * Toolkit's config sanitizing treats mistyped settings.
 */
export function clampInt(value: number, fallback: number, min: number, max?: number): number {
  if (!Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  return Math.min(Math.max(floored, min), max ?? Number.POSITIVE_INFINITY);
}

/**
 * Guards a boolean setting the same way {@link clampInt} guards numbers:
 * VS Code hands back whatever settings.json stored, so a string `"off"`
 * typed as a boolean is truthy and would silently *enable* the very
 * feature it was meant to disable. Anything but a real boolean falls
 * back to the documented default.
 */
export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
