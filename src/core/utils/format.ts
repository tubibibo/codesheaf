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

/**
 * Caps a detail list for logs and rendered sections: the first `limit` rows
 * plus how many were hidden. One helper for the three "cap at 50" surfaces —
 * skip logs, secret-finding logs, and the preview's skipped section.
 */
export function capRows<T>(
  rows: readonly T[],
  limit: number,
): { rows: readonly T[]; hidden: number } {
  if (rows.length <= limit) return { rows, hidden: 0 };
  return { rows: rows.slice(0, limit), hidden: rows.length - limit };
}
