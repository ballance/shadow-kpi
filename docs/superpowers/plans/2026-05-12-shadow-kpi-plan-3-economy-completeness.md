# shadow-kpi Plan 3 — Economy Completeness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the doughnut economy loop — extend the spendable-allowance formula to handle refunds, add the void/refund flow, run the weekly allowance reset on a cron, and surface a team leaderboard. After this plan, the 12-per-week budget cycles correctly, market creators can call off mistakes before lockup, and accumulated holdings are visible team-wide.

**Architecture:** Three new services land alongside the existing `src/server/` layer: `voidMarket` is appended to `markets.ts`, `runWeeklyReset` gets its own file (`weekly-reset.ts`), and a `getTeamLeaderboard` helper joins onto `teams.ts`. The `getSpendableAllowance` query extends from one-table to a two-query union (allowance entries + qualifying refunds), and a new `getSpendableAllowanceForWeek(weekStart)` factor lets the cron compute prior-week evaporation with the same logic. The cron route follows the Plan 2 pattern (bearer auth via `CRON_SECRET`). UI gets a Void button on the market detail page (creator, before lockup) and a leaderboard page linked from the team dashboard.

**Tech Stack:** No new dependencies. Reuses Drizzle, Auth.js v5, Vitest, testcontainers, Playwright from Plans 1 and 2.

**Reference:** Design spec at `docs/superpowers/specs/2026-05-12-shadow-kpi-design.md`. Plan 1 (foundation + identity) and Plan 2 (first market + bets + resolve) are shipped.

---

## File Structure

```
shadow-kpi/
├── src/
│   ├── app/
│   │   ├── (app)/t/[teamId]/
│   │   │   ├── page.tsx                              # MODIFY: link to leaderboard
│   │   │   ├── leaderboard/page.tsx                  # CREATE
│   │   │   └── markets/[marketId]/page.tsx           # MODIFY: void button
│   │   └── api/cron/weekly-reset/route.ts            # CREATE
│   └── server/
│       ├── ledger.ts                                 # MODIFY: refund-aware allowance
│       ├── markets.ts                                # MODIFY: append voidMarket
│       ├── teams.ts                                  # MODIFY: append getTeamLeaderboard
│       └── weekly-reset.ts                           # CREATE
├── tests/
│   ├── integration/
│   │   ├── ledger.integration.test.ts                # MODIFY: append refund cases
│   │   ├── markets.integration.test.ts               # n/a (resolve has its own file; void gets its own)
│   │   ├── teams.integration.test.ts                 # MODIFY: append leaderboard cases
│   │   ├── void.integration.test.ts                  # CREATE
│   │   └── weekly-reset.integration.test.ts          # CREATE
│   └── e2e/
│       └── void-and-leaderboard.spec.ts              # CREATE
├── vercel.json                                       # MODIFY: add weekly-reset cron
└── docs/superpowers/plans/2026-05-12-shadow-kpi-plan-3-economy-completeness.md
```

**Decomposition rationale.** `voidMarket` lives in `markets.ts` because it's a market-lifecycle action that owns the same row. `runWeeklyReset` gets its own file because it operates across all teams and uses neither the markets nor bets tables directly — it's a pure ledger maintenance job. `getTeamLeaderboard` belongs in `teams.ts` next to `listMembershipsForUser` (both walk memberships and compute balances). `getSpendableAllowance` stays in `ledger.ts` but now needs a bets-table join, which is a new dependency — acceptable because the rule "refunds of this-week stakes count toward this-week allowance" can't be expressed without knowing when the stake was placed.

---

## Conventions used throughout

- **Commit format:** Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Every commit body ends with a haiku.
- **No Claude/AI attribution in commit messages.**
- **TS strict.** No `any`. Use `unknown` and narrow.
- **No comments** unless the *why* is non-obvious.
- **Run** all commands from `/Users/ballance/home/code/shadow-kpi`.
- **Use Node 22** (`source ~/.nvm/nvm.sh && nvm use`).
- **Do not touch `.env.local`** — it has real secrets and is gitignored.

---

### Task 1: Extend `getSpendableAllowance` for refunds + add `getSpendableAllowanceForWeek` helper (TDD)

**Files:**
- Modify: `src/server/ledger.ts`
- Modify: `tests/integration/ledger.integration.test.ts`

- [ ] **Step 1: Append new test cases**

The existing `tests/integration/ledger.integration.test.ts` already imports `getSpendableAllowance`. Add `getSpendableAllowanceForWeek` to that same import. Also add `bets` to the existing `@/server/db/schema` import.

Update the top-of-file imports so they end up as:

```ts
import {
  getBalance,
  getSpendableAllowance,
  getSpendableAllowanceForWeek,
  grantInitialAllowance,
  WEEKLY_ALLOWANCE,
} from '@/server/ledger';
import { users, teams, ledgerEntries, bets, markets } from '@/server/db/schema';
```

Then append three new `it()` blocks inside the existing `describe('getSpendableAllowance', () => { ... })` block (i.e., right before the closing `});` of that describe). Insert these tests:

```ts
    it('adds back refund-of-this-week-stake (restoring allowance)', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      // Need a market and a bet so the refund ledger entry can reference a real bet whose placed_at is this week
      await handle.db.insert(markets).values({
        id: 'm1',
        teamId,
        creatorId: 'creator',
        title: 'voided',
        description: null,
        lockupAt: new Date('2026-05-20T00:00:00Z'),
        resolvesAt: new Date('2026-05-21T00:00:00Z'),
        status: 'voided',
      });
      // Also a creator user so the FK passes
      await handle.db.insert(users).values({ id: 'creator', email: 'c@example.com' });
      // Recreate the user-team membership so the test setup is consistent (no-op if already there)
      await handle.db.insert(bets).values({
        id: 'b1',
        marketId: 'm1',
        userId,
        side: 'yes',
        amount: 5,
        placedAt: new Date('2026-05-12T10:00:00Z'),
      });
      await handle.db.insert(ledgerEntries).values([
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-11T00:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'stake',
          amount: -5,
          marketId: 'm1',
          betId: 'b1',
          createdAt: new Date('2026-05-12T10:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'refund',
          amount: 5,
          marketId: 'm1',
          betId: 'b1',
          createdAt: new Date('2026-05-13T11:00:00Z'),
        },
      ]);
      // Allowance: 12 grant - 5 stake + 5 refund-of-this-week-stake = 12
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(12);
    });

    it('does NOT add back refund-of-prior-week-stake (refund goes to holdings)', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      await handle.db.insert(users).values({ id: 'creator', email: 'c@example.com' });
      await handle.db.insert(markets).values({
        id: 'm1',
        teamId,
        creatorId: 'creator',
        title: 'voided',
        description: null,
        lockupAt: new Date('2026-05-20T00:00:00Z'),
        resolvesAt: new Date('2026-05-21T00:00:00Z'),
        status: 'voided',
      });
      await handle.db.insert(bets).values({
        id: 'b1',
        marketId: 'm1',
        userId,
        side: 'yes',
        amount: 5,
        placedAt: new Date('2026-05-05T10:00:00Z'), // last week
      });
      await handle.db.insert(ledgerEntries).values([
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-11T00:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'refund',
          amount: 5,
          marketId: 'm1',
          betId: 'b1',
          createdAt: new Date('2026-05-13T11:00:00Z'), // refund happens this week
        },
      ]);
      // Allowance: 12 grant (no stakes this week, refund is of a last-week stake) = 12
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(12);
    });

    it('getSpendableAllowanceForWeek computes allowance for a specified prior week', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
      const lastWeekStart = new Date('2026-05-04T00:00:00Z');
      await handle.db.insert(ledgerEntries).values([
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-04T00:00:00Z'), // last week's Monday
        },
        {
          userId,
          teamId,
          kind: 'stake',
          amount: -3,
          createdAt: new Date('2026-05-06T10:00:00Z'),
        },
        {
          userId,
          teamId,
          kind: 'allowance_grant',
          amount: 12,
          createdAt: new Date('2026-05-11T00:00:00Z'), // this week's grant
        },
      ]);
      const lastWeek = await getSpendableAllowanceForWeek(handle.db, {
        userId,
        teamId,
        weekStart: lastWeekStart,
      });
      expect(lastWeek).toBe(9); // 12 - 3 from last week, this-week grant excluded
    });
```

- [ ] **Step 2: Run, watch fail**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test -- tests/integration/ledger.integration.test.ts
```

Expected: existing 9 tests still pass; the 3 new ones fail (TypeError or wrong number).

- [ ] **Step 3: Update `src/server/ledger.ts`**

The current `getSpendableAllowance` body returns `max(0, sum of allowance_grant + allowance_evaporate + stake within this week)`. Replace it with a refactor that:
1. Adds a new exported `getSpendableAllowanceForWeek(db, { userId, teamId, weekStart })`.
2. Rewrites `getSpendableAllowance` to call the new function with `currentWeekStart()`.
3. The new function sums allowance/stake kinds within `[weekStart, weekStart + 7d)`, then ADDS refunds where the underlying bet's `placed_at` falls in the same `[weekStart, weekStart + 7d)` window AND the refund's own `created_at` is in that window.

Open `src/server/ledger.ts`. Replace these two existing functions (`getSpendableAllowance` and `currentWeekStart`) and the export list — leave `getBalance`, `grantInitialAllowance`, `WEEKLY_ALLOWANCE` and the interfaces unchanged.

Replace the entire body of `src/server/ledger.ts` with this content (rewriting in one shot to avoid drift; the unchanged exports are reproduced verbatim):

```ts
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { bets, ledgerEntries } from '@/server/db/schema';
import { now } from '@/server/time';

export const WEEKLY_ALLOWANCE = 12;

export interface UserTeamRef {
  userId: string;
  teamId: string;
}

export interface UserTeamWeekRef extends UserTeamRef {
  weekStart: Date;
}

export async function getBalance(db: Db, { userId, teamId }: UserTeamRef): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.teamId, teamId)));
  return result[0]?.total ?? 0;
}

export async function getSpendableAllowanceForWeek(
  db: Db,
  { userId, teamId, weekStart }: UserTeamWeekRef,
): Promise<number> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const allowanceResult = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, userId),
        eq(ledgerEntries.teamId, teamId),
        gte(ledgerEntries.createdAt, weekStart),
        lt(ledgerEntries.createdAt, weekEnd),
        inArray(ledgerEntries.kind, ['allowance_grant', 'allowance_evaporate', 'stake']),
      ),
    );

  const refundResult = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .innerJoin(bets, eq(ledgerEntries.betId, bets.id))
    .where(
      and(
        eq(ledgerEntries.userId, userId),
        eq(ledgerEntries.teamId, teamId),
        eq(ledgerEntries.kind, 'refund'),
        gte(bets.placedAt, weekStart),
        lt(bets.placedAt, weekEnd),
        gte(ledgerEntries.createdAt, weekStart),
        lt(ledgerEntries.createdAt, weekEnd),
      ),
    );

  const raw = (allowanceResult[0]?.total ?? 0) + (refundResult[0]?.total ?? 0);
  return raw < 0 ? 0 : raw;
}

export async function getSpendableAllowance(
  db: Db,
  ref: UserTeamRef,
): Promise<number> {
  return await getSpendableAllowanceForWeek(db, {
    ...ref,
    weekStart: currentWeekStart(),
  });
}

export async function grantInitialAllowance(
  db: Db,
  { userId, teamId }: UserTeamRef,
): Promise<void> {
  await db.insert(ledgerEntries).values({
    userId,
    teamId,
    kind: 'allowance_grant',
    amount: WEEKLY_ALLOWANCE,
  });
}

export function currentWeekStart(): Date {
  const n = now();
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  const dow = d.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/ledger.integration.test.ts
```

Expected: 12 passing tests (9 original + 3 new).

- [ ] **Step 5: Run the full suite to make sure nothing else regressed**

```bash
npm test
```

Expected: every prior test still green.

- [ ] **Step 6: Commit**

```bash
git add src/server/ledger.ts tests/integration/ledger.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: ledger allowance now refund-aware

getSpendableAllowance adds back refunds of this-week stakes
(but not refunds of prior-week stakes). Exposes a new
getSpendableAllowanceForWeek helper so the weekly-reset cron
can compute prior-week evaporation with the same formula.

Refund finds its week —
this one's stakes come back to you,
last one's go to keep.
EOF
)"
```

---

### Task 2: `markets.voidMarket` service (TDD)

**Files:**
- Modify: `src/server/markets.ts` (append `voidMarket`)
- Create: `tests/integration/void.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/void.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { voidMarket } from '@/server/markets';
import {
  users,
  teams,
  memberships,
  markets,
  bets,
  ledgerEntries,
} from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';
import { getBalance, WEEKLY_ALLOWANCE, grantInitialAllowance } from '@/server/ledger';

describe('markets.voidMarket', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
    __setNowForTests(null);
  });

  beforeEach(async () => {
    await handle.truncateAll();
    __setNowForTests(null);
    await handle.db.insert(users).values([
      { id: 'creator', email: 'creator@example.com' },
      { id: 'a', email: 'a@example.com' },
      { id: 'b', email: 'b@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'creator', teamId: 't1' },
      { userId: 'a', teamId: 't1' },
      { userId: 'b', teamId: 't1' },
    ]);
    await grantInitialAllowance(handle.db, { userId: 'a', teamId: 't1' });
    await grantInitialAllowance(handle.db, { userId: 'b', teamId: 't1' });
    await handle.db.insert(markets).values({
      id: 'm1',
      teamId: 't1',
      creatorId: 'creator',
      title: 'Test',
      description: null,
      lockupAt: new Date('2026-05-20T00:00:00Z'),
      resolvesAt: new Date('2026-05-21T00:00:00Z'),
      status: 'open',
    });
  });

  it('rejects when caller is not the creator', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      voidMarket(handle.db, { marketId: 'm1', userId: 'a' }),
    ).rejects.toMatchObject({ code: 'NOT_MARKET_CREATOR' });
  });

  it('rejects when now is at or after lockupAt', async () => {
    __setNowForTests(new Date('2026-05-20T00:00:01Z'));
    await expect(
      voidMarket(handle.db, { marketId: 'm1', userId: 'creator' }),
    ).rejects.toMatchObject({ code: 'BET_AFTER_LOCKUP' });
  });

  it('rejects when market is already locked or resolved', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.update(markets).set({ status: 'locked' });
    await expect(
      voidMarket(handle.db, { marketId: 'm1', userId: 'creator' }),
    ).rejects.toMatchObject({ code: 'MARKET_NOT_RESOLVABLE' });
  });

  it('voids an open market with no bets — no refunds, status flips', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    const result = await voidMarket(handle.db, { marketId: 'm1', userId: 'creator' });
    expect(result.status).toBe('voided');
    const refunds = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'refund',
    );
    expect(refunds).toHaveLength(0);
  });

  it('refunds every stake when there are bets', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'yes', amount: 4 },
      { id: 'b2', marketId: 'm1', userId: 'b', side: 'no', amount: 7 },
    ]);
    await handle.db.insert(ledgerEntries).values([
      { userId: 'a', teamId: 't1', kind: 'stake', amount: -4, marketId: 'm1', betId: 'b1' },
      { userId: 'b', teamId: 't1', kind: 'stake', amount: -7, marketId: 'm1', betId: 'b2' },
    ]);

    await voidMarket(handle.db, { marketId: 'm1', userId: 'creator' });

    const refunds = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'refund',
    );
    expect(refunds).toHaveLength(2);

    const aBalance = await getBalance(handle.db, { userId: 'a', teamId: 't1' });
    const bBalance = await getBalance(handle.db, { userId: 'b', teamId: 't1' });
    expect(aBalance).toBe(WEEKLY_ALLOWANCE); // 12 - 4 + 4 = 12
    expect(bBalance).toBe(WEEKLY_ALLOWANCE);
  });

  it('refund ledger entry references the correct bet and market', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.insert(bets).values({
      id: 'b1',
      marketId: 'm1',
      userId: 'a',
      side: 'yes',
      amount: 5,
    });
    await handle.db.insert(ledgerEntries).values({
      userId: 'a',
      teamId: 't1',
      kind: 'stake',
      amount: -5,
      marketId: 'm1',
      betId: 'b1',
    });

    await voidMarket(handle.db, { marketId: 'm1', userId: 'creator' });

    const refund = (await handle.db.select().from(ledgerEntries)).find(
      (e) => e.kind === 'refund',
    );
    expect(refund).toMatchObject({
      userId: 'a',
      teamId: 't1',
      amount: 5,
      marketId: 'm1',
      betId: 'b1',
    });
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/void.integration.test.ts
```

Expected: FAIL — `voidMarket` doesn't exist yet.

- [ ] **Step 3: Append `voidMarket` to `src/server/markets.ts`**

Append at the end of `src/server/markets.ts` (do not duplicate imports — `sql`, `eq`, `betsTable`/`bets`, `ledgerEntries`, `DomainError`, `eventBus`, `now` are already imported by earlier additions):

```ts
export interface VoidMarketInput {
  marketId: string;
  userId: string;
}

export async function voidMarket(db: Db, input: VoidMarketInput): Promise<Market> {
  const updated = await db.transaction(async (tx) => {
    const lockResult = await tx.execute(
      sql`SELECT id FROM market WHERE id = ${input.marketId} FOR UPDATE`,
    );
    const lockRows = lockResult as unknown as Array<{ id: string }>;
    if (lockRows.length === 0) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }

    const [market] = await tx
      .select()
      .from(markets)
      .where(eq(markets.id, input.marketId))
      .limit(1);
    if (!market) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }

    if (market.creatorId !== input.userId) {
      throw new DomainError(
        'NOT_MARKET_CREATOR',
        'Only the market creator can void this market.',
      );
    }

    if (market.status !== 'open') {
      throw new DomainError(
        'MARKET_NOT_RESOLVABLE',
        'You can only void an open market (before lockup).',
      );
    }

    if (now().getTime() >= market.lockupAt.getTime()) {
      throw new DomainError(
        'BET_AFTER_LOCKUP',
        'You cannot void a market past its lockup time.',
      );
    }

    const allBets = await tx
      .select()
      .from(betsTable)
      .where(eq(betsTable.marketId, input.marketId));

    for (const b of allBets) {
      await tx.insert(ledgerEntries).values({
        teamId: market.teamId,
        userId: b.userId,
        amount: b.amount,
        kind: 'refund',
        marketId: input.marketId,
        betId: b.id,
      });
    }

    const [row] = await tx
      .update(markets)
      .set({ status: 'voided' })
      .where(eq(markets.id, input.marketId))
      .returning();
    return row;
  });

  await eventBus.emit({
    type: 'MarketVoided',
    marketId: updated.id,
    teamId: updated.teamId,
  });

  return updated;
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/void.integration.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Run the full markets/resolve/lockup-sweep suite**

```bash
npm test -- tests/integration/markets.integration.test.ts tests/integration/resolve.integration.test.ts tests/integration/lockup-sweep.integration.test.ts tests/integration/void.integration.test.ts
```

Expected: all prior tests still pass; total = 18 (existing) + 6 (new) = 24.

- [ ] **Step 6: Commit**

```bash
git add src/server/markets.ts tests/integration/void.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add markets.voidMarket with stake refunds

Creator-only, pre-lockup escape hatch. Locks the market row,
writes one refund ledger entry per existing bet, flips status
to voided. Emits MarketVoided for Plan 4 notification fanout.

Take it all back now —
stakes return before the bell,
mistake folds away.
EOF
)"
```

---

### Task 3: `weekly-reset` service (TDD)

**Files:**
- Create: `src/server/weekly-reset.ts`
- Create: `tests/integration/weekly-reset.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/weekly-reset.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { runWeeklyReset } from '@/server/weekly-reset';
import { users, teams, memberships, ledgerEntries } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';
import { getBalance, getSpendableAllowance, WEEKLY_ALLOWANCE } from '@/server/ledger';

describe('weekly-reset.runWeeklyReset', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
    __setNowForTests(null);
  });

  beforeEach(async () => {
    await handle.truncateAll();
    __setNowForTests(null);
  });

  async function setupOneUserOneTeam() {
    await handle.db.insert(users).values({ id: 'u1', email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values({ userId: 'u1', teamId: 't1' });
  }

  it('grants WEEKLY_ALLOWANCE to every member of every team', async () => {
    __setNowForTests(new Date('2026-05-11T00:01:00Z')); // Monday morning
    await setupOneUserOneTeam();
    await handle.db.insert(users).values({ id: 'u2', email: 'u2@example.com' });
    await handle.db.insert(memberships).values({ userId: 'u2', teamId: 't1' });

    const result = await runWeeklyReset(handle.db);
    expect(result.resetsApplied).toBe(2);

    const grants = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'allowance_grant',
    );
    expect(grants).toHaveLength(2);
    for (const g of grants) expect(g.amount).toBe(WEEKLY_ALLOWANCE);
  });

  it('evaporates unspent allowance from the previous week', async () => {
    __setNowForTests(new Date('2026-05-11T00:01:00Z'));
    await setupOneUserOneTeam();
    // Previous week's grant of 12, untouched
    await handle.db.insert(ledgerEntries).values({
      userId: 'u1',
      teamId: 't1',
      kind: 'allowance_grant',
      amount: 12,
      createdAt: new Date('2026-05-04T00:01:00Z'),
    });

    await runWeeklyReset(handle.db);

    const entries = await handle.db.select().from(ledgerEntries);
    const evaporates = entries.filter((e) => e.kind === 'allowance_evaporate');
    expect(evaporates).toHaveLength(1);
    expect(evaporates[0].amount).toBe(-12);

    const balance = await getBalance(handle.db, { userId: 'u1', teamId: 't1' });
    expect(balance).toBe(WEEKLY_ALLOWANCE); // -12 + 12 + 12 = 12 (last grant + evap + new grant)
  });

  it('does NOT evaporate prior holdings (winnings persist)', async () => {
    __setNowForTests(new Date('2026-05-11T00:01:00Z'));
    await setupOneUserOneTeam();
    await handle.db.insert(ledgerEntries).values([
      {
        userId: 'u1',
        teamId: 't1',
        kind: 'allowance_grant',
        amount: 12,
        createdAt: new Date('2026-05-04T00:01:00Z'),
      },
      {
        userId: 'u1',
        teamId: 't1',
        kind: 'stake',
        amount: -10,
        createdAt: new Date('2026-05-05T12:00:00Z'),
      },
      {
        userId: 'u1',
        teamId: 't1',
        kind: 'payout',
        amount: 25,
        createdAt: new Date('2026-05-06T12:00:00Z'),
      },
    ]);

    await runWeeklyReset(handle.db);

    // Before reset: 12 - 10 + 25 = 27
    // Last week's remaining allowance = 12 - 10 = 2 (clamped >= 0)
    // After evaporate (-2) + new grant (+12): 27 - 2 + 12 = 37
    const balance = await getBalance(handle.db, { userId: 'u1', teamId: 't1' });
    expect(balance).toBe(37);
  });

  it('is idempotent — running twice in the same week is a no-op', async () => {
    __setNowForTests(new Date('2026-05-11T00:01:00Z'));
    await setupOneUserOneTeam();
    await handle.db.insert(ledgerEntries).values({
      userId: 'u1',
      teamId: 't1',
      kind: 'allowance_grant',
      amount: 12,
      createdAt: new Date('2026-05-04T00:01:00Z'),
    });

    const first = await runWeeklyReset(handle.db);
    const second = await runWeeklyReset(handle.db);
    expect(first.resetsApplied).toBe(1);
    expect(second.resetsApplied).toBe(0);

    const grants = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'allowance_grant',
    );
    expect(grants).toHaveLength(2); // original + one new (idempotent)
  });

  it('skips members whose initial grant lives in the current week (just-joined users)', async () => {
    // User joins on Tuesday after the cron ran Monday. Next Monday, the cron should NOT skip them
    // — they need their new weekly grant. But if the SAME-WEEK Monday cron runs while their
    // signup grant is still the only allowance entry, the cron should detect it and skip.
    __setNowForTests(new Date('2026-05-11T00:01:00Z')); // Monday 00:01
    await setupOneUserOneTeam();
    // Simulate the signup grant landing at 00:00:30 (same Monday, just before the cron)
    await handle.db.insert(ledgerEntries).values({
      userId: 'u1',
      teamId: 't1',
      kind: 'allowance_grant',
      amount: 12,
      createdAt: new Date('2026-05-11T00:00:30Z'),
    });

    const result = await runWeeklyReset(handle.db);
    expect(result.resetsApplied).toBe(0); // signup already gave them this week's allowance

    const grants = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'allowance_grant',
    );
    expect(grants).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/weekly-reset.integration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/weekly-reset.ts`**

```ts
import { and, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { memberships, ledgerEntries } from '@/server/db/schema';
import {
  WEEKLY_ALLOWANCE,
  currentWeekStart,
  getSpendableAllowanceForWeek,
} from '@/server/ledger';

export interface WeeklyResetResult {
  resetsApplied: number;
}

export async function runWeeklyReset(db: Db): Promise<WeeklyResetResult> {
  const weekStart = currentWeekStart();
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const allMemberships = await db.select().from(memberships);

  let resetsApplied = 0;
  for (const m of allMemberships) {
    const applied = await db.transaction(async (tx) => {
      const recentGrants = await tx
        .select()
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.userId, m.userId),
            eq(ledgerEntries.teamId, m.teamId),
            eq(ledgerEntries.kind, 'allowance_grant'),
            gte(ledgerEntries.createdAt, weekStart),
          ),
        )
        .limit(1);
      if (recentGrants.length > 0) return false;

      const remaining = await getSpendableAllowanceForWeek(tx as unknown as Db, {
        userId: m.userId,
        teamId: m.teamId,
        weekStart: prevWeekStart,
      });
      if (remaining > 0) {
        await tx.insert(ledgerEntries).values({
          userId: m.userId,
          teamId: m.teamId,
          kind: 'allowance_evaporate',
          amount: -remaining,
        });
      }

      await tx.insert(ledgerEntries).values({
        userId: m.userId,
        teamId: m.teamId,
        kind: 'allowance_grant',
        amount: WEEKLY_ALLOWANCE,
      });
      return true;
    });
    if (applied) resetsApplied += 1;
  }

  return { resetsApplied };
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/weekly-reset.integration.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/weekly-reset.ts tests/integration/weekly-reset.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add weekly-reset service

Walks every membership, evaporates last week's unspent
allowance (computed via getSpendableAllowanceForWeek), grants
a fresh 12. Idempotent per-user-per-week: a second run on the
same Monday is a no-op.

Monday wipes the slate —
unspent grants drift into mist,
twelve new doughnuts land.
EOF
)"
```

---

### Task 4: Cron route + vercel.json update

**Files:**
- Create: `src/app/api/cron/weekly-reset/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the route handler**

Create `src/app/api/cron/weekly-reset/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { runWeeklyReset } from '@/server/weekly-reset';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'CRON_SECRET not configured.' } },
      { status: 500 },
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: 'NOT_AUTHENTICATED', message: 'Bad cron auth.' } },
      { status: 401 },
    );
  }

  const result = await runWeeklyReset(db);
  return NextResponse.json({ resetsApplied: result.resetsApplied });
}
```

- [ ] **Step 2: Update vercel.json**

Replace the contents of `vercel.json` with:

```json
{
  "crons": [
    {
      "path": "/api/cron/lockup-sweep",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/weekly-reset",
      "schedule": "0 0 * * 1"
    }
  ]
}
```

(The new entry runs Monday 00:00 UTC. The Vercel hobby-plan caveat from Plan 2 still applies for the every-minute lockup sweep.)

- [ ] **Step 3: Build verification**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

Expected: build succeeds; route appears in table.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/weekly-reset vercel.json
git commit -m "$(cat <<'EOF'
feat: add /api/cron/weekly-reset route and Monday schedule

Bearer-auth POST endpoint that runs the weekly reset against
the production DB. vercel.json now schedules two crons: the
minute-level lockup sweep and the Monday-00-UTC weekly reset.

Two timers tick on —
minute hand and weekday wheel,
Monday flips the books.
EOF
)"
```

---

### Task 5: UI — Void button on the market detail page

**Files:**
- Modify: `src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx`

- [ ] **Step 1: Update the market detail page**

Find the import block at the top of `src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx`. Update the `@/server/markets` import to include `voidMarket`:

```ts
import { getMarketDetail, resolveMarket, voidMarket } from '@/server/markets';
```

Find the section that defines `canResolve` and `canBet`. Add a `canVoid` const right after them:

```ts
  const canVoid = isCreator && market.status === 'open' && beforeLockup;
```

(The spec is "creator can void before lockup" with full refunds — bets are allowed; they get refunded by the service.)

Find the `async function resolveAction(formData: FormData) { ... }` block. Right after it, add a `voidAction`:

```ts
  async function voidAction() {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    await voidMarket(db, { marketId, userId: session.user.id });
    revalidatePath(`/t/${teamId}/markets/${marketId}`);
  }
```

Find the existing `{canResolve && (...)}` block in the JSX. Add a sibling block immediately after it for the void button:

```tsx
      {canVoid && (
        <Card>
          <CardHeader>
            <CardTitle>Void this market</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Voiding refunds every bet. Only available before lockup.
            </p>
            <form action={voidAction}>
              <Button type="submit" variant="outline">
                Void market
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: add void button on market detail page

Creator-only, pre-lockup. Card sits next to resolve and bet
forms; submitting calls voidMarket and revalidates the page.

Pre-bell mistake door —
creator pulls one lever,
stakes go marching home.
EOF
)"
```

---

### Task 6: Leaderboard service + page

**Files:**
- Modify: `src/server/teams.ts` (append `getTeamLeaderboard`)
- Modify: `tests/integration/teams.integration.test.ts` (append leaderboard cases)
- Create: `src/app/(app)/t/[teamId]/leaderboard/page.tsx`

- [ ] **Step 1: Write the failing service tests**

Update the top-of-file imports in `tests/integration/teams.integration.test.ts` to add `getTeamLeaderboard`:

```ts
import {
  createTeam,
  findTeamByInviteCode,
  joinByInviteCode,
  listMembershipsForUser,
  rotateInviteCode,
  getTeamLeaderboard,
} from '@/server/teams';
```

Append a new describe block at the bottom of the file (before the final closing `});`):

```ts
describe('teams.getTeamLeaderboard', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await handle.truncateAll();
  });

  it('returns members ordered by balance desc with display names', async () => {
    await handle.db.insert(users).values([
      { id: 'u1', email: 'alice@example.com' },
      { id: 'u2', email: 'bob@example.com' },
      { id: 'u3', email: 'carol@example.com' },
    ]);
    const t1 = await createTeam(handle.db, { name: 'X', creatorId: 'u1' });
    await joinByInviteCode(handle.db, { userId: 'u2', inviteCode: t1.inviteCode });
    await joinByInviteCode(handle.db, { userId: 'u3', inviteCode: t1.inviteCode });

    // Manually adjust balances via direct ledger inserts so the order is non-trivial.
    await handle.db.insert(ledgerEntries).values([
      { userId: 'u2', teamId: t1.id, kind: 'payout', amount: 50 },
      { userId: 'u3', teamId: t1.id, kind: 'stake', amount: -3 },
    ]);

    const rows = await getTeamLeaderboard(handle.db, t1.id);
    expect(rows.map((r) => r.userId)).toEqual(['u2', 'u1', 'u3']);
    expect(rows[0]).toMatchObject({ userId: 'u2', email: 'bob@example.com', balance: 62 });
    expect(rows[1]).toMatchObject({ userId: 'u1', email: 'alice@example.com', balance: 12 });
    expect(rows[2]).toMatchObject({ userId: 'u3', email: 'carol@example.com', balance: 9 });
  });

  it('returns empty array when team has no members', async () => {
    await handle.db
      .insert(teams)
      .values({ id: 't-empty', name: 'Empty', inviteCode: 'empty1' });
    const rows = await getTeamLeaderboard(handle.db, 't-empty');
    expect(rows).toEqual([]);
  });
});
```

Note: this test imports `ledgerEntries` from the schema — that import is already present from the createTeam tests. No further import changes needed.

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/teams.integration.test.ts
```

Expected: existing 12 still pass; new 2 fail.

- [ ] **Step 3: Implement `getTeamLeaderboard`**

Append to `src/server/teams.ts`:

```ts
import { desc, sql as sqlOp } from 'drizzle-orm';
import { ledgerEntries, users, type User } from '@/server/db/schema';

export interface LeaderboardRow {
  userId: string;
  email: string;
  balance: number;
}

export async function getTeamLeaderboard(
  db: Db,
  teamId: string,
): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      balance: sqlOp<number>`COALESCE(SUM(${ledgerEntries.amount}) FILTER (WHERE ${ledgerEntries.teamId} = ${teamId}), 0)::int`,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(
      ledgerEntries,
      and(
        eq(ledgerEntries.userId, users.id),
        eq(ledgerEntries.teamId, teamId),
      ),
    )
    .where(eq(memberships.teamId, teamId))
    .groupBy(users.id, users.email)
    .orderBy(desc(sqlOp`COALESCE(SUM(${ledgerEntries.amount}) FILTER (WHERE ${ledgerEntries.teamId} = ${teamId}), 0)`));

  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    balance: r.balance ?? 0,
  }));
}
```

**Imports note:** `desc` and `sql` are not yet imported in `teams.ts`. Add them to the existing `drizzle-orm` import line at the top of the file (the existing line already imports `and, eq`). Combine into one line — no duplicates. The schema import already has `teams, memberships`; you need to add `ledgerEntries, users, type User`. Consolidate that import too.

The FILTER clause is a Postgres-specific conditional aggregate. With the leftJoin filtered to this team, the FILTER is technically redundant but documents intent and prevents cross-team bleed if a user belongs to multiple teams in the joined rows.

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/teams.integration.test.ts
```

Expected: 14 passing tests.

- [ ] **Step 5: Build the leaderboard UI page**

Create `src/app/(app)/t/[teamId]/leaderboard/page.tsx`:

```tsx
import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import { teams } from '@/server/db/schema';
import { getTeamLeaderboard } from '@/server/teams';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LeaderboardPageProps {
  params: Promise<{ teamId: string }>;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function LeaderboardPage({ params }: LeaderboardPageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const rows = await getTeamLeaderboard(db, teamId);
  const myId = session.user.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Leaderboard — {team.name}</h1>
        <Button asChild variant="outline">
          <Link href={`/t/${teamId}`}>Back to team</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total doughnuts held</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">No members yet.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <li
                  key={r.userId}
                  className={`flex items-center justify-between ${
                    r.userId === myId ? 'font-semibold' : ''
                  }`}
                >
                  <span>
                    <span className="text-muted-foreground">{i + 1}.</span>{' '}
                    {nameFromEmail(r.email)}
                    {r.userId === myId && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </span>
                  <span>🍩 {r.balance}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Build verification**

```bash
npm run build
```

Expected: success; `/t/[teamId]/leaderboard` shows in the route table.

- [ ] **Step 7: Commit**

```bash
git add src/server/teams.ts tests/integration/teams.integration.test.ts "src/app/(app)/t/[teamId]/leaderboard"
git commit -m "$(cat <<'EOF'
feat: add leaderboard service and page

getTeamLeaderboard joins memberships to users + per-team
ledger sums, ordered by balance desc. New page at
/t/[teamId]/leaderboard renders the list and highlights the
viewer's own row.

Names in falling rank —
sums of every grant and bet,
"you" stands out in bold.
EOF
)"
```

---

### Task 7: Team dashboard links to leaderboard

**Files:**
- Modify: `src/app/(app)/t/[teamId]/page.tsx`

- [ ] **Step 1: Add a leaderboard link button to the dashboard**

Open `src/app/(app)/t/[teamId]/page.tsx`. Find the `<h1>` line near the top of the returned JSX:

```tsx
      <h1 className="text-3xl font-semibold">{team.name}</h1>
```

Replace just that line with a flex row that also contains a leaderboard button:

```tsx
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{team.name}</h1>
        <Button asChild variant="outline">
          <Link href={`/t/${teamId}/leaderboard`}>Leaderboard</Link>
        </Button>
      </div>
```

(The existing imports already include `Link` and `Button` — no import changes needed.)

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/t/[teamId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: add leaderboard link on team dashboard

Top-right button next to the team name. One-tap path from
"my balance" to "everyone's balance".

Title on the left —
leaderboard on the right side,
one click does the rest.
EOF
)"
```

---

### Task 8: Playwright E2E for void + leaderboard

**Files:**
- Create: `tests/e2e/void-and-leaderboard.spec.ts`

- [ ] **Step 1: Build the spec**

Create `tests/e2e/void-and-leaderboard.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';
import postgres from 'postgres';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';

test.beforeEach(async () => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE ledger_entry, bet, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('founder voids a market with bets — joiner gets refund and shows up on leaderboard', async ({
  browser,
}) => {
  const founderCtx = await browser.newContext();
  const founder = await founderCtx.newPage();
  await signInAs(founder, 'founder@example.com');
  await founder.waitForURL('**/teams');
  await founder.getByRole('link', { name: 'Create team' }).click();
  await founder.getByLabel('Team name').fill('Refund Crew');
  await founder.getByRole('button', { name: 'Create team' }).click();
  await founder.waitForURL((url) => /\/t\//.test(url.pathname) && !url.pathname.endsWith('/new'));
  const teamUrl = founder.url();

  const inviteUrl = await founder
    .locator('code')
    .filter({ hasText: /\/join\// })
    .first()
    .innerText();

  const joinerCtx = await browser.newContext();
  const joiner = await joinerCtx.newPage();
  await signInAs(joiner, 'joiner@example.com');
  await joiner.waitForURL('**/teams');
  await joiner.goto(inviteUrl);
  await joiner.getByRole('button', { name: 'Join team' }).click();
  await joiner.waitForURL((url) => /\/t\//.test(url.pathname) && !url.pathname.endsWith('/new'));

  // Founder creates a market far in the future so it stays open and voidable.
  await founder.goto(teamUrl);
  await founder.getByRole('link', { name: 'New market' }).click();
  await founder.getByLabel('Title').fill('Will rain ruin Sunday?');
  const toLocal = (offsetSec: number): string => {
    const d = new Date(Date.now() + offsetSec * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  await founder.getByLabel('Lockup time (bets close)').fill(toLocal(60 * 60));
  await founder.getByLabel('Resolution time (when you call it)').fill(toLocal(2 * 60 * 60));
  await founder.getByRole('button', { name: 'Create market' }).click();
  await founder.waitForURL(/\/markets\/[^/]+$/);
  const marketUrl = founder.url();

  // Joiner places a 4-doughnut bet.
  await joiner.goto(marketUrl);
  await joiner.getByLabel('Amount (🍩)').fill('4');
  await joiner.getByRole('button', { name: 'Bet Yes' }).click();
  await joiner.waitForLoadState('networkidle');

  await joiner.goto(teamUrl);
  await expect(joiner.getByText('🍩 8').first()).toBeVisible();

  // Founder voids the market.
  await founder.goto(marketUrl);
  await founder.getByRole('button', { name: 'Void market' }).click();
  await founder.waitForLoadState('networkidle');

  // Joiner's balance is back to 12.
  await joiner.goto(teamUrl);
  await expect(joiner.getByText('🍩 12').first()).toBeVisible();

  // Leaderboard shows both members with their balances.
  await joiner.getByRole('link', { name: 'Leaderboard' }).click();
  await joiner.waitForURL(/\/leaderboard$/);
  await expect(joiner.getByText(/Founder/)).toBeVisible();
  await expect(joiner.getByText(/Joiner/)).toBeVisible();

  await founderCtx.close();
  await joinerCtx.close();
});
```

- [ ] **Step 2: Run the e2e suite**

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
docker compose -f docker-compose.dev.yml up -d postgres-e2e
sleep 3
source ~/.nvm/nvm.sh && nvm use && npm run test:e2e
```

Bash timeout 600000 ms. Expected: 3 passing tests (signup-and-join + full-game-loop + void-and-leaderboard).

If anything fails, capture the Playwright error output verbatim. Try one round of fixes. If the second run also fails, report BLOCKED.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/void-and-leaderboard.spec.ts
git commit -m "$(cat <<'EOF'
test: add void-and-leaderboard Playwright e2e

Founder creates a market, joiner bets 4, founder voids,
joiner's balance returns to 12. Leaderboard page renders
both members from the joiner's view.

Bet placed, then erased —
balance climbs back as it was,
list shows two names tall.
EOF
)"
```

---

### Task 9: Final pass — typecheck, full test suite, e2e, README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Full unit + integration suite**

Ensure dev Postgres is up:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Then:

```bash
npm test
```

Bash timeout 600000 ms. Expected: every test passes. Paste the summary line.

- [ ] **Step 3: Full e2e suite**

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
npm run test:e2e
```

Expected: 3 passing.

- [ ] **Step 4: Update `README.md`**

In `## Status`, replace the body with:

```markdown
- **Plan 1 (Foundation + Identity):** Complete. Magic-link signup, teams, invite codes, balance.
- **Plan 2 (First Market End-to-End):** Complete. Create markets, place bets, lockup, resolve with parimutuel payouts.
- **Plan 3 (Economy Completeness):** Complete. Weekly allowance reset, market void/refund, leaderboard.
- Plan 4 (Social — comments, notifications, profile, activity feed) is next.
```

In `## Docs`, after the Plan 2 line, add:

```markdown
- Plan 3: `docs/superpowers/plans/2026-05-12-shadow-kpi-plan-3-economy-completeness.md`
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: update README for Plan 3 completion

Adds the economy-closure status (weekly reset, void, leaderboard)
and links to the plan doc.

Three slabs on the floor —
auth, markets, and now the loop,
social comes in four.
EOF
)"
```

- [ ] **Step 6: Final check**

```bash
git status
git log --oneline | head -25
```

Expected: clean working tree.

---

## Definition of Done for Plan 3

- A team member who has spent some of their week's 12 allowance and then gets a refund from a voided market sees their spendable allowance restored (within the same week).
- The weekly-reset cron grants 12 fresh doughnuts every Monday 00:00 UTC, evaporates unspent allowance from the prior week, leaves all stakes/payouts untouched, and is idempotent.
- The market creator can void an open market before lockup; every bet is fully refunded; the market status flips to `voided`; a `MarketVoided` event is emitted.
- The team dashboard links to a leaderboard page that ranks members by total doughnuts held (highest first), highlighting the viewer's own row.
- All unit, integration, and e2e tests pass (15 unit/integration files, 3 e2e specs).
- `npm run build` and `npm run typecheck` both succeed.
