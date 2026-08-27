import { describe, it, expect } from 'vitest';
import { parseDollarsToCents, parseSymbols, parseTiers, pickSymbol } from '@/server/contests/config';
describe('parseDollarsToCents', () => {
  it('parses 2-decimal dollars', () => { expect(parseDollarsToCents('237.83')).toBe(23783); });
  it('accepts whole dollars', () => { expect(parseDollarsToCents('10')).toBe(1000); });
  it('rejects >2 decimals', () => { expect(() => parseDollarsToCents('1.234')).toThrow(); });
  it('rejects non-positive', () => { expect(() => parseDollarsToCents('0')).toThrow(); });
  it('rejects garbage', () => { expect(() => parseDollarsToCents('abc')).toThrow(); });
});
describe('parseSymbols', () => {
  it('uppercases, trims, dedupes', () => { expect(parseSymbols('aapl, TTWO ,aapl')).toEqual(['AAPL', 'TTWO']); });
  it('rejects invalid tickers', () => { expect(() => parseSymbols('AAPL, 12$')).toThrow(); });
});
describe('parseTiers', () => {
  it('parses positive ints', () => { expect(parseTiers('25, 15, 10')).toEqual([25, 15, 10]); });
  it('rejects empty', () => { expect(() => parseTiers('')).toThrow(); });
});
describe('pickSymbol', () => {
  it('round-robins by cursor', () => {
    expect(pickSymbol(['A', 'B', 'C'], 0)).toBe('A');
    expect(pickSymbol(['A', 'B', 'C'], 4)).toBe('B');
  });
});
