import { describe, expect, it } from 'vitest';
import { computePayouts, type BetInput } from '@/server/payouts';

function bet(
  id: string,
  side: 'yes' | 'no',
  amount: number,
  placedAt = new Date('2026-05-12T00:00:00Z'),
): BetInput {
  return { id, side, amount, placedAt };
}

describe('computePayouts', () => {
  describe('standard parimutuel', () => {
    it('pays winner back stake plus proportional share of losing pool', () => {
      const bets = [
        bet('y1', 'yes', 10),
        bet('n1', 'no', 10),
        bet('n2', 'no', 20),
      ];
      const result = computePayouts(bets, 'no');
      const n1 = result.payouts.find((p) => p.betId === 'n1');
      const n2 = result.payouts.find((p) => p.betId === 'n2');
      expect(n1?.payout).toBe(13);
      expect(n2?.payout).toBe(27); // 26 base + 1 dust
      expect(result.vaporized).toBe(0);
    });

    it('breaks dust ties by earliest placedAt when amounts are equal', () => {
      const t = (s: number) => new Date(`2026-05-12T00:00:0${s}Z`);
      const bets = [
        bet('y0', 'yes', 1, t(0)),
        bet('y1', 'yes', 1, t(1)),
        bet('y2', 'yes', 1, t(2)),
        bet('y3', 'yes', 1, t(3)),
        bet('y4', 'yes', 1, t(4)),
        bet('y5', 'yes', 1, t(5)),
        bet('y6', 'yes', 1, t(6)),
        bet('n', 'no', 5),
      ];
      const result = computePayouts(bets, 'yes');
      const y0 = result.payouts.find((p) => p.betId === 'y0');
      expect(y0?.payout).toBe(6);
      for (const id of ['y1', 'y2', 'y3', 'y4', 'y5', 'y6']) {
        expect(result.payouts.find((p) => p.betId === id)?.payout).toBe(1);
      }
    });
  });

  describe('no bets on the winning side', () => {
    it('vaporizes the losing pool (no payouts)', () => {
      const bets = [bet('n1', 'no', 10), bet('n2', 'no', 20)];
      const result = computePayouts(bets, 'yes');
      expect(result.payouts).toEqual([]);
      expect(result.vaporized).toBe(30);
    });
  });

  describe('no bets at all', () => {
    it('returns empty payouts and zero vaporized', () => {
      const result = computePayouts([], 'yes');
      expect(result.payouts).toEqual([]);
      expect(result.vaporized).toBe(0);
    });
  });

  describe('one-sided pool — winning side only', () => {
    it('returns each winning bet stake unchanged (no losers to take from)', () => {
      const bets = [bet('y1', 'yes', 5), bet('y2', 'yes', 10)];
      const result = computePayouts(bets, 'yes');
      const y1 = result.payouts.find((p) => p.betId === 'y1');
      const y2 = result.payouts.find((p) => p.betId === 'y2');
      expect(y1?.payout).toBe(5);
      expect(y2?.payout).toBe(10);
      expect(result.vaporized).toBe(0);
    });
  });

  describe('single winner', () => {
    it('takes the entire losing pool', () => {
      const bets = [bet('y1', 'yes', 5), bet('n1', 'no', 8), bet('n2', 'no', 12)];
      const result = computePayouts(bets, 'yes');
      const y1 = result.payouts.find((p) => p.betId === 'y1');
      expect(y1?.payout).toBe(25);
      expect(result.vaporized).toBe(0);
    });
  });

  describe('payout sum invariant', () => {
    it('total payouts never exceed total pool', () => {
      const bets = [
        bet('y1', 'yes', 7),
        bet('y2', 'yes', 3),
        bet('n1', 'no', 11),
        bet('n2', 'no', 4),
      ];
      const totalPool = 7 + 3 + 11 + 4;
      const result = computePayouts(bets, 'yes');
      const totalPaid = result.payouts.reduce((s, p) => s + p.payout, 0);
      expect(totalPaid + result.vaporized).toBe(totalPool);
    });
  });
});
