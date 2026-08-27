export function parseDollarsToCents(raw: string): number {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('INVALID_PRICE');
  const cents = Math.round(parseFloat(s) * 100);
  if (cents <= 0 || cents > 100_000_000) throw new Error('INVALID_PRICE');
  return cents;
}
export function parseSymbols(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const s = part.trim().toUpperCase();
    if (!s) continue;
    if (!/^[A-Z][A-Z.]{0,6}$/.test(s)) throw new Error('INVALID_SYMBOL');
    if (!out.includes(s)) out.push(s);
  }
  if (out.length === 0) throw new Error('NO_SYMBOLS');
  return out;
}
export function parseTiers(raw: string): number[] {
  const out = raw.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    if (!/^\d+$/.test(p)) throw new Error('INVALID_TIER');
    return parseInt(p, 10);
  });
  if (out.length === 0 || out.some((n) => n <= 0)) throw new Error('INVALID_TIERS');
  return out;
}
export function pickSymbol(symbols: string[], cursor: number): string {
  return symbols[cursor % symbols.length];
}
