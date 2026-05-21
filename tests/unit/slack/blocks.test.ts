import { describe, expect, it } from 'vitest';
import {
  marketCreatedChannel,
  marketLockedChannel,
  marketLockedDm,
  marketResolvedChannel,
  marketResolvedDmWinner,
  marketResolvedDmLoser,
  marketVoidedDm,
} from '@/server/slack/blocks';

const baseUrl = 'https://shadow-kpi.example.com';

describe('block kit formatters', () => {
  it('marketCreatedChannel includes title, team, link button, and text fallback', () => {
    const out = marketCreatedChannel({
      baseUrl,
      teamName: 'Eng Predictions',
      marketId: 'm1',
      title: 'Will the deck ship?',
      lockupAtUnix: 1763067600,
      creatorDisplay: '<@U1>',
    });
    expect(out.text).toContain('Will the deck ship?');
    expect(out.text).toContain('Eng Predictions');
    expect(JSON.stringify(out.blocks)).toContain(`${baseUrl}/markets/m1`);
    expect(JSON.stringify(out.blocks)).toContain('Will the deck ship?');
  });

  it('marketResolvedDmWinner shows positive delta', () => {
    const out = marketResolvedDmWinner({
      baseUrl,
      title: 'Will the deck ship?',
      marketId: 'm1',
      outcome: 'yes',
      stake: 8,
      payout: 26,
      newBalance: 47,
    });
    expect(out.text).toMatch(/won 18/);
    expect(out.text).toContain('47');
  });

  it('marketResolvedDmLoser shows lost amount', () => {
    const out = marketResolvedDmLoser({
      baseUrl,
      title: 'Will the deck ship?',
      marketId: 'm1',
      outcome: 'no',
      stake: 8,
      newBalance: 21,
    });
    expect(out.text).toMatch(/lost 8/);
    expect(out.text).toContain('21');
  });

  it('marketVoidedDm shows refund amount', () => {
    const out = marketVoidedDm({
      baseUrl,
      title: 'Will the deck ship?',
      marketId: 'm1',
      stake: 8,
    });
    expect(out.text).toMatch(/Refund/i);
    expect(out.text).toContain('8');
  });

  it('marketLockedChannel includes pool stats', () => {
    const out = marketLockedChannel({
      baseUrl,
      teamName: 'Eng',
      marketId: 'm1',
      title: 'X',
      betCount: 23,
      poolTotal: 240,
      yesPct: 65,
      noPct: 35,
    });
    expect(out.text).toContain('23 bets');
    expect(out.text).toContain('240');
  });

  it('marketLockedDm includes stake and side', () => {
    const out = marketLockedDm({
      baseUrl,
      title: 'X',
      marketId: 'm1',
      stake: 8,
      side: 'yes',
      creatorDisplay: '@alice',
    });
    expect(out.text).toContain('8');
    expect(out.text).toMatch(/yes/i);
  });

  it('marketResolvedChannel includes winner count and pool', () => {
    const out = marketResolvedChannel({
      baseUrl,
      teamName: 'Eng',
      marketId: 'm1',
      title: 'X',
      outcome: 'yes',
      winnerCount: 12,
      poolTotal: 240,
      callerDisplay: '@alice',
    });
    expect(out.text).toContain('12 winners');
    expect(out.text).toContain('240');
  });
});
