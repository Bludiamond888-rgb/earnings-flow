const SYM: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: 'CN¥', CAD: 'C$', AUD: 'A$', INR: '₹', KRW: '₩', CHF: 'CHF ', BRL: 'R$', TWD: 'NT$', HKD: 'HK$', DKK: 'DKK ', SEK: 'SEK ', MXN: 'MX$' };
let sym = '$';
/** Currency used by money(); set to the displayed company's reporting currency. */
export function setCurrency(cur?: string) { sym = !cur ? '$' : SYM[cur] ?? cur + ' '; }
export function money(v: number, signed = false): string {
  const a = Math.abs(v); const s = v < 0 ? '−' : signed ? '+' : '';
  if (a >= 1e12) return `${s}${sym}${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}${sym}${(a / 1e9).toFixed(a >= 1e11 ? 1 : 2)}B`;
  if (a >= 1e6) return `${s}${sym}${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}${sym}${(a / 1e3).toFixed(0)}K`;
  return `${s}${sym}${a.toFixed(2)}`;
}
export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
export function change(cur: number, prev: number): number | null {
  if (prev === 0 || !isFinite(prev)) return null;
  return (cur - prev) / Math.abs(prev);
}
