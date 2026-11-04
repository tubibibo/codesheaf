/** Compact human-readable token estimate: 999 -> "999", 1500 -> "~1.5k", 1200000 -> "~1.2M". */
export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0';
  if (tokens < 999_500) {
    if (tokens < 1_000) return String(Math.round(tokens));
    const k = tokens / 1_000;
    const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
    return `~${rounded}k`;
  }
  const m = tokens / 1_000_000;
  return `~${Math.round(m * 10) / 10}M`;
}
