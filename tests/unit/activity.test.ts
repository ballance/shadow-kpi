import { describe, expect, it } from 'vitest';
import { mergeActivityFeed, type ActivityItem } from '@/server/activity';

describe('mergeActivityFeed', () => {
  it('merges market and comment items in descending time order', () => {
    const marketsIn: ActivityItem[] = [
      { kind: 'market_created', at: new Date('2026-05-12T10:00:00Z'), marketId: 'm1', title: 'A' },
      { kind: 'market_resolved', at: new Date('2026-05-12T14:00:00Z'), marketId: 'm1', title: 'A', outcome: 'yes' },
    ];
    const commentsIn: ActivityItem[] = [
      { kind: 'comment_posted', at: new Date('2026-05-12T12:00:00Z'), marketId: 'm1', title: 'A', commenterEmail: 'a@example.com' },
    ];
    const merged = mergeActivityFeed(marketsIn, commentsIn, 100);
    expect(merged.map((m) => m.at.toISOString())).toEqual([
      '2026-05-12T14:00:00.000Z',
      '2026-05-12T12:00:00.000Z',
      '2026-05-12T10:00:00.000Z',
    ]);
  });

  it('truncates to the limit', () => {
    const items: ActivityItem[] = Array.from({ length: 20 }, (_, i) => ({
      kind: 'market_created' as const,
      at: new Date(`2026-05-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
      marketId: `m${i}`,
      title: `M${i}`,
    }));
    const merged = mergeActivityFeed(items, [], 5);
    expect(merged).toHaveLength(5);
    expect(merged[0].marketId).toBe('m19');
  });
});
