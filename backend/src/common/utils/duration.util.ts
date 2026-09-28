/**
 * Mengubah string durasi JWT (mis. "15m", "7d", "3600s") menjadi milidetik
 * untuk `maxAge` cookie. Format tidak dikenali memakai fallback (A5).
 */
export function durationToMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = parseInt(match[1], 10);
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return amount * multiplier;
}
