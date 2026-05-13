# shadow-kpi Plan 2 — First Market End-to-End

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full betting loop: a team member creates a binary market, teammates bet doughnuts, the market locks at its lockup time, the creator resolves it, and parimutuel payouts land in the ledger. No notifications, no comments, no void/refund — those land in Plans 3 and 4.

**Architecture:** Two new tables (`market`, `bet`) and three new service files (`payouts.ts`, `markets.ts`, `bets.ts`) inside the existing `src/server/` layer. The `payouts.ts` module is a pure-functions parimutuel math kernel. Service writes happen in DB transactions; the bet flow uses `SELECT ... FOR UPDATE` on the market row to serialize concurrent bets. A new `/api/cron/lockup-sweep` route flips expired open markets to `locked` and is gated by a `CRON_SECRET` bearer header. UI gets a Create Market form, a market detail page with pool totals + bet form + resolve button (with a tiny client polling component for live pool totals), and an updated team dashboard that lists markets.

**Tech Stack:** Same as Plan 1 (Next.js 16 · TypeScript · Tailwind 4 · shadcn/ui · Drizzle ORM · Postgres · Auth.js v5 · Vitest · testcontainers · Playwright · zod · nanoid).

**Reference:** Design spec at `docs/superpowers/specs/2026-05-12-shadow-kpi-design.md`. Plan 1 already shipped: auth, teams, invites, ledger primitives, base UI.

---

## File Structure

```
shadow-kpi/
├── src/
│   ├── app/
│   │   ├── (app)/t/[teamId]/
│   │   │   ├── page.tsx                              # MODIFY: list markets
│   │   │   └── markets/
│   │   │       ├── new/page.tsx                      # CREATE
│   │   │       └── [marketId]/
│   │   │           ├── page.tsx                      # CREATE: detail + bet form + resolve
│   │   │           └── live-poll.tsx                 # CREATE: client component, 5s router.refresh
│   │   └── api/cron/lockup-sweep/route.ts            # CREATE
│   └── server/
│       ├── db/schema.ts                              # MODIFY: add markets, bets; FK ledger_entry
│       ├── db/migrations/                            # generated migration appears here
│       ├── markets.ts                                # CREATE
│       ├── bets.ts                                   # CREATE
│       └── payouts.ts                                # CREATE (pure functions)
├── tests/
│   ├── helpers/db.ts                                 # MODIFY: extend truncate list
│   ├── unit/payouts.test.ts                          # CREATE
│   ├── integration/
│   │   ├── markets.integration.test.ts               # CREATE
│   │   ├── bets.integration.test.ts                  # CREATE
│   │   ├── resolve.integration.test.ts               # CREATE
│   │   └── lockup-sweep.integration.test.ts          # CREATE
│   └── e2e/
│       ├── full-game-loop.spec.ts                    # CREATE
│       └── helpers/                                  # existing
├── vercel.json                                       # CREATE
├── .env.example                                      # MODIFY: add CRON_SECRET
└── docs/superpowers/plans/2026-05-12-shadow-kpi-plan-2-first-market.md
```

**Decomposition rationale.** `payouts.ts` is intentionally a pure module — the parimutuel math has the highest correctness bar in the codebase and lives behind a function signature that takes a list of bets and returns a list of payouts. `markets.ts` owns lifecycle transitions (create / lock / resolve), `bets.ts` owns the place-bet transaction. The cron lives as a Route Handler so it can run on Vercel Cron later without rearchitecture. The market detail page is server-rendered; live pool totals come from a tiny client component that calls `router.refresh()` on a 5-second interval — no SSE, no WebSockets, no client-side state.

---

## Conventions used throughout

- **Commit format:** Conventional commits (`feat:`, `fix:`, `chore:`, `test:`). Each commit body ends with a haiku (user preference). Use the haiku provided in each task verbatim.
- **No Claude/AI attribution in commit messages.**
- **TS strict.** No `any`. Use `unknown` and narrow.
- **No comments** unless the *why* is non-obvious.
- **Run** all commands from `/Users/ballance/home/code/shadow-kpi`.
- **Use Node 22** (`nvm use` reads `.nvmrc`).
- **Do not touch `.env.local`** — it has real secrets and is gitignored.

---

### Task 1: Extend schema with `market` + `bet` tables, add FKs to `ledger_entry`, migrate

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `tests/helpers/db.ts` (truncate list)
- Modify: `tests/e2e/full-game-loop.spec.ts` — N/A this task (the spec doesn't exist yet); we update Plan 1's e2e truncate list when we touch it in Task 12.
- Create: `src/server/db/migrations/0001_*.sql` (generated)

- [ ] **Step 1: Add `markets` and `bets` table definitions and FK references**

Open `src/server/db/schema.ts`. Add the two new tables **after** the existing `ledgerEntries` definition. Then update the `ledgerEntries` table to add FK references on `marketId` and `betId`. Final file should look like this (the existing tables `users`, `accounts`, `sessions`, `verificationTokens`, `teams`, `memberships` are unchanged):

```ts
import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// --- Auth.js v5 tables (UNCHANGED from Plan 1) ---
export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  name: text('name'),
  image: text('image'),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (a) => ({ pk: primaryKey({ columns: [a.provider, a.providerAccountId] }) }),
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({ pk: primaryKey({ columns: [vt.identifier, vt.token] }) }),
);

// --- shadow-kpi domain ---
export const teams = pgTable(
  'team',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    inviteCode: text('invite_code').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({ inviteCodeIdx: uniqueIndex('team_invite_code_idx').on(t.inviteCode) }),
);

export const memberships = pgTable(
  'membership',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (m) => ({ pk: primaryKey({ columns: [m.userId, m.teamId] }) }),
);

// NEW: markets
export const markets = pgTable(
  'market',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    lockupAt: timestamp('lockup_at').notNull(),
    resolvesAt: timestamp('resolves_at').notNull(),
    status: text('status', { enum: ['open', 'locked', 'resolved', 'voided'] })
      .notNull()
      .default('open'),
    outcome: text('outcome', { enum: ['yes', 'no'] }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
  },
  (m) => ({
    byTeamStatusLockup: index('market_team_status_lockup_idx').on(
      m.teamId,
      m.status,
      m.lockupAt,
    ),
  }),
);

// NEW: bets
export const bets = pgTable(
  'bet',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    side: text('side', { enum: ['yes', 'no'] }).notNull(),
    amount: integer('amount').notNull(),
    placedAt: timestamp('placed_at').notNull().defaultNow(),
  },
  (b) => ({ byMarket: index('bet_market_idx').on(b.marketId) }),
);

// MODIFIED: ledgerEntries now has FK refs on market_id and bet_id
export const ledgerEntries = pgTable(
  'ledger_entry',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    kind: text('kind', {
      enum: ['allowance_grant', 'allowance_evaporate', 'stake', 'payout', 'refund'],
    }).notNull(),
    marketId: text('market_id').references(() => markets.id, { onDelete: 'set null' }),
    betId: text('bet_id').references(() => bets.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (l) => ({
    byUserTeamCreated: index('ledger_user_team_created_idx').on(
      l.teamId,
      l.userId,
      l.createdAt,
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;
export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
```

- [ ] **Step 2: Extend the test-helper truncate list**

Open `tests/helpers/db.ts`. Find the `tables` array (in the `startTestDb` function). Replace it with the new list (order is documentational; CASCADE handles real FK ordering):

```ts
const tables = [
  'ledger_entry',
  'bet',
  'membership',
  'market',
  'team',
  'session',
  'account',
  '"verificationToken"',
  '"user"',
];
```

- [ ] **Step 3: Generate the migration**

Make sure dev Postgres is running:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Generate:

```bash
nvm use
npm run db:generate
```

Expected: a new file at `src/server/db/migrations/0001_<slug>.sql` plus updated `meta/_journal.json` and a new snapshot. The SQL should include `CREATE TABLE "market"`, `CREATE TABLE "bet"`, and two `ALTER TABLE "ledger_entry" ADD CONSTRAINT ... FOREIGN KEY ...` statements.

- [ ] **Step 4: Apply migrations to dev DB**

```bash
npm run db:migrate
```

Expected: `Migrations applied.`

Verify:

```bash
docker exec shadowkpi-postgres psql -U shadowkpi -d shadowkpi -c "\dt"
```

Expected: now includes `market` and `bet` rows.

- [ ] **Step 5: Apply migrations to e2e DB**

```bash
DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e npm run db:migrate
```

Expected: `Migrations applied.`

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 7: Run existing tests to make sure nothing broke**

```bash
npm test
```

Expected: all previous tests still green. The new tables truncate fine because they exist.

- [ ] **Step 8: Commit**

```bash
git add src/server/db tests/helpers/db.ts
git commit -m "$(cat <<'EOF'
feat: add market and bet tables, link ledger entries

New domain tables for the betting loop. ledger_entry now has
nullable FK references to market and bet (set null on delete).

Two boards on the wall —
markets above, bets below,
ledger ties them in.
EOF
)"
```

---

### Task 2: Payouts module (pure functions, TDD)

**Files:**
- Create: `src/server/payouts.ts`, `tests/unit/payouts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/payouts.test.ts`:

```ts
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
      // Yes pool = 10 (one bet), No pool = 30 (two bets). Outcome = No.
      // No bettors split: 30/30 of the pool. Each gets stake + (stake/30)*10 profit.
      const bets = [
        bet('y1', 'yes', 10),
        bet('n1', 'no', 10),
        bet('n2', 'no', 20),
      ];
      const result = computePayouts(bets, 'no');
      // n1: 10 + floor(10*10/30) = 10 + 3 = 13
      // n2: 20 + floor(20*10/30) = 20 + 6 = 26
      // Total distributed from losing pool: 3 + 6 = 9. Dust = 10 - 9 = 1.
      // Dust goes to the largest winning bet (n2).
      const n1 = result.payouts.find((p) => p.betId === 'n1');
      const n2 = result.payouts.find((p) => p.betId === 'n2');
      expect(n1?.payout).toBe(13);
      expect(n2?.payout).toBe(27); // 26 base + 1 dust
      expect(result.vaporized).toBe(0);
    });

    it('breaks dust ties by earliest placedAt when amounts are equal', () => {
      // 7 yes bets of 1 doughnut each, 1 no bet of 5. Outcome = yes.
      // Yes pool = 7, No pool = 5. Each yes winner gets 1 + floor(1*5/7) = 1 + 0 = 1.
      // Distributed from losing pool: 0. Dust = 5.
      // All winners have the same amount (1); dust goes to the earliest by placedAt.
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
      expect(y0?.payout).toBe(6); // 1 stake + 0 profit + 5 dust
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
      // y1 gets 5 + floor(5*20/5) = 5 + 20 = 25. No dust (exact divide).
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
```

- [ ] **Step 2: Run, watch fail**

```bash
nvm use
npm test -- tests/unit/payouts.test.ts
```

Expected: FAIL with "Cannot find module '@/server/payouts'".

- [ ] **Step 3: Implement `payouts.ts`**

Create `src/server/payouts.ts`:

```ts
export interface BetInput {
  id: string;
  side: 'yes' | 'no';
  amount: number;
  placedAt: Date;
}

export interface PayoutOutput {
  betId: string;
  payout: number;
}

export interface PayoutResult {
  payouts: PayoutOutput[];
  vaporized: number;
}

export function computePayouts(
  bets: readonly BetInput[],
  outcome: 'yes' | 'no',
): PayoutResult {
  const winners = bets.filter((b) => b.side === outcome);
  const losers = bets.filter((b) => b.side !== outcome);

  if (bets.length === 0) {
    return { payouts: [], vaporized: 0 };
  }

  const winningPool = winners.reduce((s, b) => s + b.amount, 0);
  const losingPool = losers.reduce((s, b) => s + b.amount, 0);

  if (winners.length === 0) {
    return { payouts: [], vaporized: losingPool };
  }

  const payouts: PayoutOutput[] = winners.map((b) => {
    const profit = winningPool === 0 ? 0 : Math.floor((b.amount * losingPool) / winningPool);
    return { betId: b.id, payout: b.amount + profit };
  });

  const distributedProfit = payouts.reduce((s, p) => {
    const winner = winners.find((w) => w.id === p.betId);
    if (!winner) return s;
    return s + (p.payout - winner.amount);
  }, 0);
  const dust = losingPool - distributedProfit;

  if (dust > 0) {
    const sortedWinners = [...winners].sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.placedAt.getTime() - b.placedAt.getTime();
    });
    const luckyId = sortedWinners[0].id;
    const lucky = payouts.find((p) => p.betId === luckyId);
    if (lucky) lucky.payout += dust;
  }

  return { payouts, vaporized: 0 };
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/unit/payouts.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/payouts.ts tests/unit/payouts.test.ts
git commit -m "$(cat <<'EOF'
feat: add parimutuel payouts module

Pure-function math. Winners get stake back plus a floored
proportional share of the losing pool. Integer dust goes to
the largest winning bet (earliest placedAt as tiebreak). No
winners means the losing pool vaporizes.

Pool splits in fair thirds —
remainder leans to the biggest,
nothing is wasted.
EOF
)"
```

---

### Task 3: Markets service — `createMarket` (TDD)

**Files:**
- Create: `src/server/markets.ts`, `tests/integration/markets.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/markets.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { createMarket } from '@/server/markets';
import { users, teams, memberships, markets } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { __setNowForTests } from '@/server/time';

describe('markets.createMarket', () => {
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
    await handle.db.insert(users).values({ id: 'u1', email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values({ userId: 'u1', teamId: 't1' });
  });

  it('inserts an open market when input is valid', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    const market = await createMarket(handle.db, {
      teamId: 't1',
      creatorId: 'u1',
      title: 'Will the deploy ship Friday?',
      description: 'EOD Pacific',
      lockupAt: new Date('2026-05-15T17:00:00Z'),
      resolvesAt: new Date('2026-05-16T00:00:00Z'),
    });
    expect(market.id).toBeDefined();
    expect(market.status).toBe('open');
    expect(market.outcome).toBeNull();
    const rows = await handle.db.select().from(markets);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Will the deploy ship Friday?');
  });

  it('rejects when title is empty', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      createMarket(handle.db, {
        teamId: 't1',
        creatorId: 'u1',
        title: '   ',
        description: null,
        lockupAt: new Date('2026-05-15T17:00:00Z'),
        resolvesAt: new Date('2026-05-16T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects when lockupAt is in the past', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      createMarket(handle.db, {
        teamId: 't1',
        creatorId: 'u1',
        title: 'Late market',
        description: null,
        lockupAt: new Date('2026-05-11T12:00:00Z'),
        resolvesAt: new Date('2026-05-16T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects when resolvesAt is before lockupAt', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      createMarket(handle.db, {
        teamId: 't1',
        creatorId: 'u1',
        title: 'Backwards',
        description: null,
        lockupAt: new Date('2026-05-16T00:00:00Z'),
        resolvesAt: new Date('2026-05-15T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects when creator is not a team member', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.insert(users).values({ id: 'outsider', email: 'out@example.com' });
    await expect(
      createMarket(handle.db, {
        teamId: 't1',
        creatorId: 'outsider',
        title: 'Sneaky',
        description: null,
        lockupAt: new Date('2026-05-15T00:00:00Z'),
        resolvesAt: new Date('2026-05-16T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_TEAM_MEMBER' });
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/markets.integration.test.ts
```

Expected: FAIL with "Cannot find module '@/server/markets'".

- [ ] **Step 3: Implement `markets.ts` with `createMarket`**

Create `src/server/markets.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { markets, memberships, type Market } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { eventBus } from '@/server/events';
import { now } from '@/server/time';

export interface CreateMarketInput {
  teamId: string;
  creatorId: string;
  title: string;
  description: string | null;
  lockupAt: Date;
  resolvesAt: Date;
}

export async function createMarket(db: Db, input: CreateMarketInput): Promise<Market> {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'Market title cannot be empty.');
  }
  const currentTime = now();
  if (input.lockupAt.getTime() <= currentTime.getTime()) {
    throw new DomainError('VALIDATION_FAILED', 'Lockup time must be in the future.');
  }
  if (input.resolvesAt.getTime() < input.lockupAt.getTime()) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'Resolves time cannot be before lockup time.',
    );
  }

  const membership = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, input.creatorId), eq(memberships.teamId, input.teamId)),
    )
    .limit(1);
  if (membership.length === 0) {
    throw new DomainError('NOT_TEAM_MEMBER', 'You are not a member of this team.');
  }

  const [created] = await db
    .insert(markets)
    .values({
      teamId: input.teamId,
      creatorId: input.creatorId,
      title,
      description: input.description?.trim() || null,
      lockupAt: input.lockupAt,
      resolvesAt: input.resolvesAt,
    })
    .returning();

  await eventBus.emit({
    type: 'MarketCreated',
    marketId: created.id,
    teamId: created.teamId,
    creatorId: created.creatorId,
  });

  return created;
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/markets.integration.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/markets.ts tests/integration/markets.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add markets.createMarket service

Validates title, time ordering, and membership. Inserts an
open market and emits MarketCreated. Plan 4 will wire the
notification fanout to that event.

Title meets the form —
times must run from now to then,
member writes it down.
EOF
)"
```

---

### Task 4: Markets service — `listMarketsForTeam` + `getMarketDetail` (TDD)

**Files:**
- Modify: `src/server/markets.ts`
- Modify: `tests/integration/markets.integration.test.ts`

- [ ] **Step 1: Append new tests**

Add `listMarketsForTeam, getMarketDetail` to the existing `@/server/markets` import at the top of `tests/integration/markets.integration.test.ts`, and add `bets` to the existing `@/server/db/schema` import. Then append the new `describe` blocks below to the bottom of the file. (Each new `describe` uses its own `beforeAll`/`afterAll` to start a fresh container; this is consistent with the Plan 1 test layout but adds ~15s per added describe to suite runtime — acceptable for now.)

Top-of-file imports should end up as:

```ts
import { createMarket, listMarketsForTeam, getMarketDetail } from '@/server/markets';
import { users, teams, memberships, markets, bets } from '@/server/db/schema';
```

Append at the bottom of the file:

```ts

describe('markets.listMarketsForTeam', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await handle.truncateAll();
    await handle.db.insert(users).values({ id: 'u1', email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values({ userId: 'u1', teamId: 't1' });
  });

  async function makeMarket(id: string, status: 'open' | 'locked' | 'resolved' | 'voided', createdAt: Date) {
    await handle.db.insert(markets).values({
      id,
      teamId: 't1',
      creatorId: 'u1',
      title: `M-${id}`,
      description: null,
      lockupAt: new Date('2026-12-31T00:00:00Z'),
      resolvesAt: new Date('2026-12-31T01:00:00Z'),
      status,
      createdAt,
    });
  }

  it('returns markets for the team ordered by createdAt desc', async () => {
    await makeMarket('m1', 'open', new Date('2026-05-10T00:00:00Z'));
    await makeMarket('m2', 'open', new Date('2026-05-12T00:00:00Z'));
    await makeMarket('m3', 'open', new Date('2026-05-11T00:00:00Z'));
    const rows = await listMarketsForTeam(handle.db, 't1');
    expect(rows.map((r) => r.id)).toEqual(['m2', 'm3', 'm1']);
  });

  it('filters by status when provided', async () => {
    await makeMarket('m1', 'open', new Date('2026-05-10T00:00:00Z'));
    await makeMarket('m2', 'resolved', new Date('2026-05-11T00:00:00Z'));
    const openOnly = await listMarketsForTeam(handle.db, 't1', 'open');
    const resolvedOnly = await listMarketsForTeam(handle.db, 't1', 'resolved');
    expect(openOnly.map((r) => r.id)).toEqual(['m1']);
    expect(resolvedOnly.map((r) => r.id)).toEqual(['m2']);
  });

  it('returns empty array when team has no markets', async () => {
    const rows = await listMarketsForTeam(handle.db, 't1');
    expect(rows).toEqual([]);
  });
});

describe('markets.getMarketDetail', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await handle.truncateAll();
    await handle.db.insert(users).values([
      { id: 'u1', email: 'u1@example.com' },
      { id: 'u2', email: 'u2@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'u1', teamId: 't1' },
      { userId: 'u2', teamId: 't1' },
    ]);
    await handle.db.insert(markets).values({
      id: 'm1',
      teamId: 't1',
      creatorId: 'u1',
      title: 'Test market',
      description: null,
      lockupAt: new Date('2026-12-31T00:00:00Z'),
      resolvesAt: new Date('2026-12-31T01:00:00Z'),
      status: 'open',
    });
  });

  it('returns the market with zero pool totals when no bets exist', async () => {
    const detail = await getMarketDetail(handle.db, 'm1');
    expect(detail?.market.id).toBe('m1');
    expect(detail?.pools).toEqual({ yes: 0, no: 0 });
    expect(detail?.bets).toEqual([]);
  });

  it('returns aggregated pools and the bet list', async () => {
    await handle.db.insert(bets).values([
      { marketId: 'm1', userId: 'u2', side: 'yes', amount: 5 },
      { marketId: 'm1', userId: 'u2', side: 'yes', amount: 3 },
      { marketId: 'm1', userId: 'u2', side: 'no', amount: 4 },
    ]);
    const detail = await getMarketDetail(handle.db, 'm1');
    expect(detail?.pools).toEqual({ yes: 8, no: 4 });
    expect(detail?.bets).toHaveLength(3);
  });

  it('returns null when market does not exist', async () => {
    const detail = await getMarketDetail(handle.db, 'nope');
    expect(detail).toBeNull();
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/markets.integration.test.ts
```

Expected: previous 5 still pass; new tests fail because `listMarketsForTeam` and `getMarketDetail` don't exist yet.

- [ ] **Step 3: Add the two new exports to `src/server/markets.ts`**

Append to `src/server/markets.ts`:

```ts
import { desc, sql } from 'drizzle-orm';
import { bets as betsTable, type Bet } from '@/server/db/schema';

export type MarketStatus = 'open' | 'locked' | 'resolved' | 'voided';

export async function listMarketsForTeam(
  db: Db,
  teamId: string,
  status?: MarketStatus,
): Promise<Market[]> {
  const whereClause = status
    ? and(eq(markets.teamId, teamId), eq(markets.status, status))
    : eq(markets.teamId, teamId);
  return await db
    .select()
    .from(markets)
    .where(whereClause)
    .orderBy(desc(markets.createdAt));
}

export interface MarketDetail {
  market: Market;
  pools: { yes: number; no: number };
  bets: Bet[];
}

export async function getMarketDetail(
  db: Db,
  marketId: string,
): Promise<MarketDetail | null> {
  const [market] = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  if (!market) return null;

  const allBets = await db
    .select()
    .from(betsTable)
    .where(eq(betsTable.marketId, marketId));

  const pools = allBets.reduce(
    (acc, b) => {
      if (b.side === 'yes') acc.yes += b.amount;
      else acc.no += b.amount;
      return acc;
    },
    { yes: 0, no: 0 },
  );

  return { market, pools, bets: allBets };
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/markets.integration.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/markets.ts tests/integration/markets.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add markets.listMarketsForTeam and getMarketDetail

list returns team markets newest-first with optional status
filter. detail returns the market, computed pool totals, and
the bets list (caller decides whether to reveal identities).

Roll call by the date —
totals climb in two columns,
bets wait in a row.
EOF
)"
```

---

### Task 5: Bets service — `placeBet` (TDD with concurrent bet test)

**Files:**
- Create: `src/server/bets.ts`, `tests/integration/bets.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/bets.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { placeBet } from '@/server/bets';
import { users, teams, memberships, markets, bets, ledgerEntries } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';
import { WEEKLY_ALLOWANCE, grantInitialAllowance } from '@/server/ledger';

describe('bets.placeBet', () => {
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
      { id: 'bettor', email: 'bettor@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'creator', teamId: 't1' },
      { userId: 'bettor', teamId: 't1' },
    ]);
    await grantInitialAllowance(handle.db, { userId: 'bettor', teamId: 't1' });
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

  it('places a bet, writes a stake ledger entry, and returns the bet row', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    const placed = await placeBet(handle.db, {
      marketId: 'm1',
      userId: 'bettor',
      side: 'yes',
      amount: 5,
    });
    expect(placed.side).toBe('yes');
    expect(placed.amount).toBe(5);

    const allBets = await handle.db.select().from(bets);
    expect(allBets).toHaveLength(1);

    const stake = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'stake',
    );
    expect(stake).toHaveLength(1);
    expect(stake[0]).toMatchObject({
      userId: 'bettor',
      teamId: 't1',
      amount: -5,
      betId: placed.id,
    });
  });

  it('rejects with INSUFFICIENT_BALANCE when amount exceeds balance', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 99 }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    const allBets = await handle.db.select().from(bets);
    expect(allBets).toHaveLength(0);
  });

  it('rejects with CREATOR_CANNOT_BET when the bettor is the market creator', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await grantInitialAllowance(handle.db, { userId: 'creator', teamId: 't1' });
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'creator', side: 'yes', amount: 1 }),
    ).rejects.toMatchObject({ code: 'CREATOR_CANNOT_BET' });
  });

  it('rejects with BET_AFTER_LOCKUP when now is at or after lockupAt', async () => {
    __setNowForTests(new Date('2026-05-20T00:00:01Z'));
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 1 }),
    ).rejects.toMatchObject({ code: 'BET_AFTER_LOCKUP' });
  });

  it('rejects with AMOUNT_BELOW_MINIMUM when amount is 0 or negative', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 0 }),
    ).rejects.toMatchObject({ code: 'AMOUNT_BELOW_MINIMUM' });
  });

  it('rejects non-integer amounts', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 1.5 }),
    ).rejects.toMatchObject({ code: 'AMOUNT_BELOW_MINIMUM' });
  });

  it('rejects with NOT_TEAM_MEMBER when bettor is not in the team', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.insert(users).values({ id: 'outsider', email: 'o@example.com' });
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'outsider', side: 'yes', amount: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_TEAM_MEMBER' });
  });

  it('rejects with BET_AFTER_LOCKUP if market is already locked', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    await handle.db.update(markets).set({ status: 'locked' });
    await expect(
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 1 }),
    ).rejects.toMatchObject({ code: 'BET_AFTER_LOCKUP' });
  });

  it('serializes concurrent bets — two simultaneous bets cannot both overdraft', async () => {
    __setNowForTests(new Date('2026-05-12T12:00:00Z'));
    // bettor has 12 doughnuts. Two concurrent 8-doughnut bets must not both succeed.
    const results = await Promise.allSettled([
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'yes', amount: 8 }),
      placeBet(handle.db, { marketId: 'm1', userId: 'bettor', side: 'no', amount: 8 }),
    ]);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
    });
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/bets.integration.test.ts
```

Expected: FAIL with "Cannot find module '@/server/bets'".

- [ ] **Step 3: Implement `bets.ts`**

Create `src/server/bets.ts`:

```ts
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  markets,
  memberships,
  bets,
  ledgerEntries,
  type Bet,
} from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { now } from '@/server/time';

export interface PlaceBetInput {
  marketId: string;
  userId: string;
  side: 'yes' | 'no';
  amount: number;
}

export async function placeBet(db: Db, input: PlaceBetInput): Promise<Bet> {
  if (!Number.isInteger(input.amount) || input.amount < 1) {
    throw new DomainError(
      'AMOUNT_BELOW_MINIMUM',
      'Bet amount must be a positive integer.',
    );
  }

  return await db.transaction(async (tx) => {
    const lockedRows = await tx.execute(
      sql`SELECT id, team_id, creator_id, lockup_at, status FROM market WHERE id = ${input.marketId} FOR UPDATE`,
    );
    const marketRows = lockedRows as unknown as Array<{
      id: string;
      team_id: string;
      creator_id: string;
      lockup_at: Date;
      status: string;
    }>;
    if (marketRows.length === 0) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }
    const market = marketRows[0];

    if (market.creator_id === input.userId) {
      throw new DomainError(
        'CREATOR_CANNOT_BET',
        'You cannot bet on a market you created.',
      );
    }

    if (market.status !== 'open') {
      throw new DomainError('BET_AFTER_LOCKUP', 'Betting is closed for this market.');
    }

    const lockupAt = new Date(market.lockup_at);
    if (now().getTime() >= lockupAt.getTime()) {
      throw new DomainError('BET_AFTER_LOCKUP', 'Betting is closed for this market.');
    }

    const membership = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, input.userId),
          eq(memberships.teamId, market.team_id),
        ),
      )
      .limit(1);
    if (membership.length === 0) {
      throw new DomainError('NOT_TEAM_MEMBER', 'You are not a member of this team.');
    }

    const balanceRows = await tx.execute(
      sql`SELECT COALESCE(SUM(amount), 0)::int AS total FROM ledger_entry
          WHERE user_id = ${input.userId} AND team_id = ${market.team_id}
          FOR UPDATE`,
    );
    const balance = Number(
      (balanceRows as unknown as Array<{ total: number }>)[0]?.total ?? 0,
    );
    if (balance < input.amount) {
      throw new DomainError(
        'INSUFFICIENT_BALANCE',
        `You have ${balance} doughnuts, need ${input.amount}.`,
      );
    }

    const [placed] = await tx
      .insert(bets)
      .values({
        marketId: input.marketId,
        userId: input.userId,
        side: input.side,
        amount: input.amount,
      })
      .returning();

    await tx.insert(ledgerEntries).values({
      teamId: market.team_id,
      userId: input.userId,
      amount: -input.amount,
      kind: 'stake',
      marketId: input.marketId,
      betId: placed.id,
    });

    return placed;
  });
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/bets.integration.test.ts
```

Expected: all 9 tests pass. The concurrent-bet test is the canary for the `FOR UPDATE` locking.

- [ ] **Step 5: Commit**

```bash
git add src/server/bets.ts tests/integration/bets.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add bets.placeBet with FOR UPDATE serialization

Locks the market row and the user's ledger sum inside one
transaction. Two concurrent bets can't both overdraft; the
loser sees INSUFFICIENT_BALANCE and no row is written.

Two hands reach the till —
one gets ten, the other waits,
ledger holds the line.
EOF
)"
```

---

### Task 6: Markets service — `resolveMarket` (TDD)

**Files:**
- Modify: `src/server/markets.ts`
- Create: `tests/integration/resolve.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/resolve.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { resolveMarket } from '@/server/markets';
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

describe('markets.resolveMarket', () => {
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
      lockupAt: new Date('2026-05-12T18:00:00Z'),
      resolvesAt: new Date('2026-05-12T19:00:00Z'),
      status: 'locked',
    });
  });

  it('rejects when caller is not the creator', async () => {
    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    await expect(
      resolveMarket(handle.db, { marketId: 'm1', userId: 'a', outcome: 'yes' }),
    ).rejects.toMatchObject({ code: 'NOT_MARKET_CREATOR' });
  });

  it('rejects when called before resolvesAt', async () => {
    __setNowForTests(new Date('2026-05-12T18:30:00Z'));
    await expect(
      resolveMarket(handle.db, { marketId: 'm1', userId: 'creator', outcome: 'yes' }),
    ).rejects.toMatchObject({ code: 'RESOLVE_TOO_EARLY' });
  });

  it('rejects when market is already resolved', async () => {
    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    await handle.db.update(markets).set({ status: 'resolved', outcome: 'yes' });
    await expect(
      resolveMarket(handle.db, { marketId: 'm1', userId: 'creator', outcome: 'yes' }),
    ).rejects.toMatchObject({ code: 'MARKET_NOT_RESOLVABLE' });
  });

  it('pays winners and updates market status (single winner takes losing pool)', async () => {
    __setNowForTests(new Date('2026-05-12T15:00:00Z'));
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'yes', amount: 5 },
      { id: 'b2', marketId: 'm1', userId: 'b', side: 'no', amount: 10 },
    ]);
    await handle.db.insert(ledgerEntries).values([
      { userId: 'a', teamId: 't1', kind: 'stake', amount: -5, marketId: 'm1', betId: 'b1' },
      { userId: 'b', teamId: 't1', kind: 'stake', amount: -10, marketId: 'm1', betId: 'b2' },
    ]);

    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    const resolved = await resolveMarket(handle.db, {
      marketId: 'm1',
      userId: 'creator',
      outcome: 'yes',
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.outcome).toBe('yes');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);

    // a bet 5, won, profit = floor(5*10/5) = 10, payout = 15
    const aBalance = await getBalance(handle.db, { userId: 'a', teamId: 't1' });
    expect(aBalance).toBe(WEEKLY_ALLOWANCE - 5 + 15); // 12 - 5 + 15 = 22

    // b bet 10, lost, no payout
    const bBalance = await getBalance(handle.db, { userId: 'b', teamId: 't1' });
    expect(bBalance).toBe(WEEKLY_ALLOWANCE - 10); // 12 - 10 = 2
  });

  it('vaporizes losing-side stakes when no winners bet', async () => {
    __setNowForTests(new Date('2026-05-12T15:00:00Z'));
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'no', amount: 4 },
      { id: 'b2', marketId: 'm1', userId: 'b', side: 'no', amount: 6 },
    ]);
    await handle.db.insert(ledgerEntries).values([
      { userId: 'a', teamId: 't1', kind: 'stake', amount: -4, marketId: 'm1', betId: 'b1' },
      { userId: 'b', teamId: 't1', kind: 'stake', amount: -6, marketId: 'm1', betId: 'b2' },
    ]);

    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    await resolveMarket(handle.db, {
      marketId: 'm1',
      userId: 'creator',
      outcome: 'yes',
    });

    // No payout entries were written.
    const payouts = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'payout',
    );
    expect(payouts).toHaveLength(0);

    const aBalance = await getBalance(handle.db, { userId: 'a', teamId: 't1' });
    const bBalance = await getBalance(handle.db, { userId: 'b', teamId: 't1' });
    expect(aBalance).toBe(WEEKLY_ALLOWANCE - 4); // 8
    expect(bBalance).toBe(WEEKLY_ALLOWANCE - 6); // 6
  });

  it('one-sided pool (only winners bet) refunds stakes with no profit', async () => {
    __setNowForTests(new Date('2026-05-12T15:00:00Z'));
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'yes', amount: 7 },
    ]);
    await handle.db.insert(ledgerEntries).values([
      { userId: 'a', teamId: 't1', kind: 'stake', amount: -7, marketId: 'm1', betId: 'b1' },
    ]);

    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    await resolveMarket(handle.db, {
      marketId: 'm1',
      userId: 'creator',
      outcome: 'yes',
    });

    const aBalance = await getBalance(handle.db, { userId: 'a', teamId: 't1' });
    expect(aBalance).toBe(WEEKLY_ALLOWANCE); // 12 - 7 stake + 7 payout = 12
  });

  it('resolves a market that has no bets without writing payouts', async () => {
    __setNowForTests(new Date('2026-05-12T20:00:00Z'));
    const resolved = await resolveMarket(handle.db, {
      marketId: 'm1',
      userId: 'creator',
      outcome: 'yes',
    });
    expect(resolved.status).toBe('resolved');
    const payouts = (await handle.db.select().from(ledgerEntries)).filter(
      (e) => e.kind === 'payout',
    );
    expect(payouts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/resolve.integration.test.ts
```

Expected: FAIL — `resolveMarket` doesn't exist yet.

- [ ] **Step 3: Add `resolveMarket` to `src/server/markets.ts`**

Append to `src/server/markets.ts`:

```ts
import { ledgerEntries } from '@/server/db/schema';
import { computePayouts, type BetInput } from '@/server/payouts';
import { sql as sqlOp } from 'drizzle-orm';

export interface ResolveMarketInput {
  marketId: string;
  userId: string;
  outcome: 'yes' | 'no';
}

export async function resolveMarket(
  db: Db,
  input: ResolveMarketInput,
): Promise<Market> {
  return await db.transaction(async (tx) => {
    const lockedRows = await tx.execute(
      sqlOp`SELECT * FROM market WHERE id = ${input.marketId} FOR UPDATE`,
    );
    const rows = lockedRows as unknown as Array<{
      id: string;
      team_id: string;
      creator_id: string;
      resolves_at: Date;
      status: string;
    }>;
    if (rows.length === 0) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }
    const market = rows[0];

    if (market.creator_id !== input.userId) {
      throw new DomainError(
        'NOT_MARKET_CREATOR',
        'Only the market creator can resolve this market.',
      );
    }

    if (market.status !== 'open' && market.status !== 'locked') {
      throw new DomainError(
        'MARKET_NOT_RESOLVABLE',
        'This market has already been resolved or voided.',
      );
    }

    if (now().getTime() < new Date(market.resolves_at).getTime()) {
      throw new DomainError(
        'RESOLVE_TOO_EARLY',
        'You cannot resolve this market until its resolution time.',
      );
    }

    const allBets = await tx
      .select()
      .from(betsTable)
      .where(eq(betsTable.marketId, input.marketId));

    const inputs: BetInput[] = allBets.map((b) => ({
      id: b.id,
      side: b.side,
      amount: b.amount,
      placedAt: b.placedAt,
    }));
    const { payouts } = computePayouts(inputs, input.outcome);

    for (const p of payouts) {
      const bet = allBets.find((b) => b.id === p.betId);
      if (!bet) continue;
      await tx.insert(ledgerEntries).values({
        teamId: market.team_id,
        userId: bet.userId,
        amount: p.payout,
        kind: 'payout',
        marketId: input.marketId,
        betId: bet.id,
      });
    }

    const [updated] = await tx
      .update(markets)
      .set({ status: 'resolved', outcome: input.outcome, resolvedAt: now() })
      .where(eq(markets.id, input.marketId))
      .returning();

    return updated;
  });
}
```

Then, after the function body, emit the event AFTER the transaction commits:

Replace the `return updated;` line with `return { _emitAfter: true, market: updated };`? No — the cleaner pattern is to capture the result outside the transaction. Restructure to:

```ts
export async function resolveMarket(
  db: Db,
  input: ResolveMarketInput,
): Promise<Market> {
  const updated = await db.transaction(async (tx) => {
    // ... existing body, returning `updated` from the transaction
  });

  await eventBus.emit({
    type: 'MarketResolved',
    marketId: updated.id,
    teamId: updated.teamId,
    outcome: updated.outcome as 'yes' | 'no',
  });

  return updated;
}
```

Make sure the function body inside `db.transaction` returns the `updated` row. The full revised function body should be:

```ts
export async function resolveMarket(
  db: Db,
  input: ResolveMarketInput,
): Promise<Market> {
  const updated = await db.transaction(async (tx) => {
    const lockedRows = await tx.execute(
      sqlOp`SELECT * FROM market WHERE id = ${input.marketId} FOR UPDATE`,
    );
    const rows = lockedRows as unknown as Array<{
      id: string;
      team_id: string;
      creator_id: string;
      resolves_at: Date;
      status: string;
    }>;
    if (rows.length === 0) {
      throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
    }
    const market = rows[0];

    if (market.creator_id !== input.userId) {
      throw new DomainError(
        'NOT_MARKET_CREATOR',
        'Only the market creator can resolve this market.',
      );
    }

    if (market.status !== 'open' && market.status !== 'locked') {
      throw new DomainError(
        'MARKET_NOT_RESOLVABLE',
        'This market has already been resolved or voided.',
      );
    }

    if (now().getTime() < new Date(market.resolves_at).getTime()) {
      throw new DomainError(
        'RESOLVE_TOO_EARLY',
        'You cannot resolve this market until its resolution time.',
      );
    }

    const allBets = await tx
      .select()
      .from(betsTable)
      .where(eq(betsTable.marketId, input.marketId));

    const inputs: BetInput[] = allBets.map((b) => ({
      id: b.id,
      side: b.side,
      amount: b.amount,
      placedAt: b.placedAt,
    }));
    const { payouts } = computePayouts(inputs, input.outcome);

    for (const p of payouts) {
      const winningBet = allBets.find((b) => b.id === p.betId);
      if (!winningBet) continue;
      await tx.insert(ledgerEntries).values({
        teamId: market.team_id,
        userId: winningBet.userId,
        amount: p.payout,
        kind: 'payout',
        marketId: input.marketId,
        betId: winningBet.id,
      });
    }

    const [row] = await tx
      .update(markets)
      .set({ status: 'resolved', outcome: input.outcome, resolvedAt: now() })
      .where(eq(markets.id, input.marketId))
      .returning();
    return row;
  });

  await eventBus.emit({
    type: 'MarketResolved',
    marketId: updated.id,
    teamId: updated.teamId,
    outcome: updated.outcome as 'yes' | 'no',
  });

  return updated;
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/resolve.integration.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run all tests to make sure nothing regressed**

```bash
npm test
```

Expected: every prior test still passes.

- [ ] **Step 6: Commit**

```bash
git add src/server/markets.ts tests/integration/resolve.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add markets.resolveMarket with payout writes

Creator-only, time-gated resolution. Locks the market row,
runs parimutuel math, writes one payout ledger entry per
winning bet, flips status to resolved. Emits MarketResolved
after commit for Plan 4 notification fanout.

Verdict at the time —
winners count their share at last,
losers learn the cost.
EOF
)"
```

---

### Task 7: Markets service — `lockExpiredMarkets` (TDD)

**Files:**
- Modify: `src/server/markets.ts`
- Create: `tests/integration/lockup-sweep.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/lockup-sweep.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { lockExpiredMarkets } from '@/server/markets';
import { users, teams, memberships, markets } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';

describe('markets.lockExpiredMarkets', () => {
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
    await handle.db.insert(users).values({ id: 'u1', email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values({ userId: 'u1', teamId: 't1' });
  });

  it('flips expired open markets to locked', async () => {
    __setNowForTests(new Date('2026-05-12T13:00:00Z'));
    await handle.db.insert(markets).values([
      {
        id: 'expired',
        teamId: 't1',
        creatorId: 'u1',
        title: 'Past lockup',
        description: null,
        lockupAt: new Date('2026-05-12T12:00:00Z'),
        resolvesAt: new Date('2026-05-12T13:00:00Z'),
        status: 'open',
      },
      {
        id: 'future',
        teamId: 't1',
        creatorId: 'u1',
        title: 'Future lockup',
        description: null,
        lockupAt: new Date('2026-05-13T00:00:00Z'),
        resolvesAt: new Date('2026-05-13T01:00:00Z'),
        status: 'open',
      },
    ]);
    const result = await lockExpiredMarkets(handle.db);
    expect(result.lockedIds).toEqual(['expired']);

    const rows = await handle.db.select().from(markets);
    expect(rows.find((r) => r.id === 'expired')?.status).toBe('locked');
    expect(rows.find((r) => r.id === 'future')?.status).toBe('open');
  });

  it('is idempotent — running twice on the same expired market locks once', async () => {
    __setNowForTests(new Date('2026-05-12T13:00:00Z'));
    await handle.db.insert(markets).values({
      id: 'expired',
      teamId: 't1',
      creatorId: 'u1',
      title: 'Past lockup',
      description: null,
      lockupAt: new Date('2026-05-12T12:00:00Z'),
      resolvesAt: new Date('2026-05-12T13:00:00Z'),
      status: 'open',
    });
    const first = await lockExpiredMarkets(handle.db);
    const second = await lockExpiredMarkets(handle.db);
    expect(first.lockedIds).toEqual(['expired']);
    expect(second.lockedIds).toEqual([]);
  });

  it('ignores resolved and voided markets', async () => {
    __setNowForTests(new Date('2026-05-12T13:00:00Z'));
    await handle.db.insert(markets).values([
      {
        id: 'resolved',
        teamId: 't1',
        creatorId: 'u1',
        title: 'Done',
        description: null,
        lockupAt: new Date('2026-05-12T10:00:00Z'),
        resolvesAt: new Date('2026-05-12T11:00:00Z'),
        status: 'resolved',
        outcome: 'yes',
      },
    ]);
    const result = await lockExpiredMarkets(handle.db);
    expect(result.lockedIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/lockup-sweep.integration.test.ts
```

Expected: FAIL — `lockExpiredMarkets` doesn't exist yet.

- [ ] **Step 3: Add `lockExpiredMarkets` to `src/server/markets.ts`**

Append to `src/server/markets.ts`:

```ts
import { lte } from 'drizzle-orm';

export interface LockSweepResult {
  lockedIds: string[];
}

export async function lockExpiredMarkets(db: Db): Promise<LockSweepResult> {
  const result = await db
    .update(markets)
    .set({ status: 'locked' })
    .where(and(eq(markets.status, 'open'), lte(markets.lockupAt, now())))
    .returning({ id: markets.id, teamId: markets.teamId });

  for (const row of result) {
    await eventBus.emit({
      type: 'MarketLocked',
      marketId: row.id,
      teamId: row.teamId,
    });
  }
  return { lockedIds: result.map((r) => r.id) };
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/lockup-sweep.integration.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/markets.ts tests/integration/lockup-sweep.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add markets.lockExpiredMarkets sweep

Flips every open market whose lockup_at has passed to locked
in a single UPDATE...RETURNING. Idempotent: a second run on an
already-locked market matches no rows. Emits MarketLocked per
flipped market for Plan 4 notification fanout.

The minute hand falls —
open doors swing shut as one,
locks click out of view.
EOF
)"
```

---

### Task 8: Lockup-sweep cron API route + `CRON_SECRET` env

**Files:**
- Create: `src/app/api/cron/lockup-sweep/route.ts`, `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Add CRON_SECRET to `.env.example`**

Open `.env.example`. Append:

```env

# Vercel Cron auth (Bearer token)
CRON_SECRET=replace-with-openssl-rand-hex-32
```

Then add `CRON_SECRET` to your local `.env.local`. Generate a value:

```bash
openssl rand -hex 32
```

Manually paste the result into `.env.local` (which is gitignored and untouched by automation) under `CRON_SECRET=`. If you're a subagent and cannot interact with `.env.local`, **stop and report NEEDS_CONTEXT** — the controller will write the file.

- [ ] **Step 2: Create the cron route handler**

Create `src/app/api/cron/lockup-sweep/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { lockExpiredMarkets } from '@/server/markets';

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

  const result = await lockExpiredMarkets(db);
  return NextResponse.json({ lockedIds: result.lockedIds });
}
```

- [ ] **Step 3: Create `vercel.json` to schedule the cron**

Create `vercel.json` at the repo root:

```json
{
  "crons": [
    {
      "path": "/api/cron/lockup-sweep",
      "schedule": "* * * * *"
    }
  ]
}
```

Note: `vercel.json` only takes effect after deploying to Vercel. Locally, the route is reachable via manual POST with the bearer token (see verification below). **Vercel deployment caveat:** As of Vercel's current hobby-plan limits, `"* * * * *"` (every minute) requires the Pro plan. If you stay on hobby, change `schedule` to `"0 * * * *"` (every hour) and accept up-to-an-hour lockup delay, or run the sweep yourself via an external scheduler. Plan 3 may revisit this when the weekly-reset cron lands.

- [ ] **Step 4: Verify the route locally (manual)**

Start dev DB if not running:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Boot the dev server in the background:

```bash
nvm use
npm run dev > /tmp/dev.log 2>&1 &
sleep 4
```

Test missing auth:

```bash
curl -X POST http://localhost:3000/api/cron/lockup-sweep -i 2>&1 | head -5
```

Expected: `HTTP/1.1 401`.

Test with the secret from `.env.local`:

```bash
SECRET=$(grep -E '^CRON_SECRET=' .env.local | cut -d= -f2)
curl -X POST -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/lockup-sweep
echo ""
```

Expected: `{"lockedIds":[]}` (assuming no open expired markets in dev DB).

Kill the dev server:

```bash
kill %1 2>/dev/null || pkill -f "next dev" || true
```

- [ ] **Step 5: Build verification**

```bash
npm run build
```

Expected: build succeeds; the new API route shows up in the route table.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/lockup-sweep vercel.json .env.example
git commit -m "$(cat <<'EOF'
feat: add /api/cron/lockup-sweep route gated by CRON_SECRET

POST endpoint that flips expired open markets to locked. Bearer
auth via the CRON_SECRET env var matches the Vercel Cron header.
vercel.json schedules it every minute.

Every sixty ticks —
Vercel knocks with secret key,
late markets stand still.
EOF
)"
```

---

### Task 9: UI — Create Market page (`/t/[teamId]/markets/new`)

**Files:**
- Create: `src/app/(app)/t/[teamId]/markets/new/page.tsx`

- [ ] **Step 1: Build the page**

Create `src/app/(app)/t/[teamId]/markets/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { createMarket } from '@/server/markets';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface NewMarketPageProps {
  params: Promise<{ teamId: string }>;
}

const FormSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  lockupAt: z.string().min(1),
  resolvesAt: z.string().min(1),
});

export default async function NewMarketPage({ params }: NewMarketPageProps) {
  const { teamId } = await params;

  async function action(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');

    const parsed = FormSchema.safeParse({
      title: formData.get('title'),
      description: formData.get('description') ?? undefined,
      lockupAt: formData.get('lockupAt'),
      resolvesAt: formData.get('resolvesAt'),
    });
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'Please fill all required fields.');
    }

    const lockupAt = new Date(parsed.data.lockupAt);
    const resolvesAt = new Date(parsed.data.resolvesAt);
    if (Number.isNaN(lockupAt.getTime()) || Number.isNaN(resolvesAt.getTime())) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid date format.');
    }

    const market = await createMarket(db, {
      teamId,
      creatorId: session.user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      lockupAt,
      resolvesAt,
    });
    redirect(`/t/${teamId}/markets/${market.id}`);
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>New market</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={200}
              placeholder="Will the deploy ship by EOD Friday?"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              name="description"
              maxLength={2000}
              placeholder="Pacific time, our deploy script, no rollbacks."
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lockupAt">Lockup time (bets close)</Label>
            <Input id="lockupAt" name="lockupAt" type="datetime-local" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="resolvesAt">Resolution time (when you call it)</Label>
            <Input id="resolvesAt" name="resolvesAt" type="datetime-local" required />
          </div>
          <Button type="submit">Create market</Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Expected: success; `/t/[teamId]/markets/new` appears in the route table.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/t"
git commit -m "$(cat <<'EOF'
feat: add /t/[teamId]/markets/new create-market page

Server-action form with zod validation, datetime-local
inputs for lockup and resolution. On success redirects to
the new market's detail page.

Form opens its arms wide —
title, when, and when again,
button writes the row.
EOF
)"
```

---

### Task 10: UI — Market detail page with pool totals, bet form, resolve button, live poll

**Files:**
- Create: `src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx`
- Create: `src/app/(app)/t/[teamId]/markets/[marketId]/live-poll.tsx`

- [ ] **Step 1: Build the live-poll client component**

Create `src/app/(app)/t/[teamId]/markets/[marketId]/live-poll.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface LivePollProps {
  enabled: boolean;
  intervalMs?: number;
}

export function LivePoll({ enabled, intervalMs = 5000 }: LivePollProps) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);
  return null;
}
```

- [ ] **Step 2: Build the detail page**

Create `src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx`:

```tsx
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { getMarketDetail, resolveMarket } from '@/server/markets';
import { placeBet } from '@/server/bets';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LivePoll } from './live-poll';

interface MarketDetailPageProps {
  params: Promise<{ teamId: string; marketId: string }>;
}

function fmtTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { teamId, marketId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/signin');

  const detail = await getMarketDetail(db, marketId);
  if (!detail || detail.market.teamId !== teamId) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Market not found</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          That market doesn't exist on this team.
        </CardContent>
      </Card>
    );
  }

  const market = detail.market;
  const myId = session.user.id;
  const isCreator = myId === market.creatorId;
  const now = new Date();
  const beforeLockup = now < market.lockupAt;
  const canResolve =
    isCreator &&
    (market.status === 'open' || market.status === 'locked') &&
    now >= market.resolvesAt;
  const canBet = !isCreator && market.status === 'open' && beforeLockup;
  const isResolved = market.status === 'resolved';

  const [balance, allowance] = await Promise.all([
    getBalance(db, { userId: myId, teamId }),
    getSpendableAllowance(db, { userId: myId, teamId }),
  ]);

  let bettorEmails = new Map<string, string>();
  if (isResolved && detail.bets.length > 0) {
    const ids = Array.from(new Set(detail.bets.map((b) => b.userId)));
    const rows = await db.select().from(users);
    for (const u of rows) if (ids.includes(u.id)) bettorEmails.set(u.id, u.email);
  }

  async function betAction(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    const parsed = z
      .object({
        side: z.enum(['yes', 'no']),
        amount: z.coerce.number().int().min(1).max(1000),
      })
      .safeParse({
        side: formData.get('side'),
        amount: formData.get('amount'),
      });
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'Pick a side and an amount.');
    }
    await placeBet(db, {
      marketId,
      userId: session.user.id,
      side: parsed.data.side,
      amount: parsed.data.amount,
    });
    revalidatePath(`/t/${teamId}/markets/${marketId}`);
  }

  async function resolveAction(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    const parsed = z
      .object({ outcome: z.enum(['yes', 'no']) })
      .safeParse({ outcome: formData.get('outcome') });
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'Pick yes or no.');
    }
    await resolveMarket(db, {
      marketId,
      userId: session.user.id,
      outcome: parsed.data.outcome,
    });
    revalidatePath(`/t/${teamId}/markets/${marketId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <LivePoll enabled={market.status === 'open' || market.status === 'locked'} />

      <div>
        <div className="text-sm text-muted-foreground">{market.status}</div>
        <h1 className="text-2xl font-semibold">{market.title}</h1>
        {market.description && (
          <p className="mt-1 text-muted-foreground">{market.description}</p>
        )}
        <div className="mt-2 text-sm text-muted-foreground">
          Bets close: {fmtTime(market.lockupAt)} · Resolves: {fmtTime(market.resolvesAt)}
          {isResolved && market.outcome && (
            <> · Outcome: <strong>{market.outcome.toUpperCase()}</strong></>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Yes pool</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">🍩 {detail.pools.yes}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>No pool</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">🍩 {detail.pools.no}</CardContent>
        </Card>
      </div>

      {canBet && (
        <Card>
          <CardHeader>
            <CardTitle>Place a bet</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={betAction} className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Button type="submit" name="side" value="yes" variant="outline">
                  Bet Yes
                </Button>
                <Button type="submit" name="side" value="no" variant="outline">
                  Bet No
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Amount (🍩)</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min={1}
                  max={Math.max(1, balance)}
                  required
                  defaultValue={1}
                />
                <div className="text-sm text-muted-foreground">
                  Your balance: 🍩 {balance} (spendable this week: 🍩 {allowance})
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {canResolve && (
        <Card>
          <CardHeader>
            <CardTitle>Resolve this market</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={resolveAction} className="flex gap-2">
              <Button type="submit" name="outcome" value="yes">
                Resolve YES
              </Button>
              <Button type="submit" name="outcome" value="no" variant="outline">
                Resolve NO
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bets ({detail.bets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.bets.length === 0 ? (
            <p className="text-muted-foreground">No bets yet.</p>
          ) : isResolved ? (
            <ul className="flex flex-col gap-2">
              {detail.bets.map((b) => (
                <li key={b.id} className="flex items-center justify-between text-sm">
                  <span>
                    {nameFromEmail(bettorEmails.get(b.userId) ?? '???')} —{' '}
                    <strong>{b.side.toUpperCase()}</strong> · 🍩 {b.amount}
                  </span>
                  <span className="text-muted-foreground">{fmtTime(b.placedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              Identities are revealed after the market is resolved.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Build verification**

```bash
npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/t/[teamId]/markets/[marketId]"
git commit -m "$(cat <<'EOF'
feat: add market detail page with pool totals, bets, resolve

Server-rendered page with two server actions (bet, resolve)
gated on creator/lockup/resolution rules. Tiny client poll
component refreshes every 5s while the market is live. Bettor
identities stay hidden until resolution.

Pool counts climb on tick —
button hides until the hour,
names rise at the end.
EOF
)"
```

---

### Task 11: UI — Team dashboard lists markets

**Files:**
- Modify: `src/app/(app)/t/[teamId]/page.tsx`

- [ ] **Step 1: Replace the "Markets are coming..." placeholder**

Replace the current contents of `src/app/(app)/t/[teamId]/page.tsx` with:

```tsx
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { rotateInviteCode } from '@/server/teams';
import { listMarketsForTeam } from '@/server/markets';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
}

function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function TeamDashboardPage({ params }: TeamPageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const [balance, allowance, marketRows] = await Promise.all([
    getBalance(db, { userId: session.user.id, teamId }),
    getSpendableAllowance(db, { userId: session.user.id, teamId }),
    listMarketsForTeam(db, teamId),
  ]);

  async function rotateAction() {
    'use server';
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    await rotateInviteCode(db, { teamId, userId: session.user.id });
    revalidatePath(`/t/${teamId}`);
  }

  const origin = process.env.AUTH_URL ?? 'http://localhost:3000';
  const inviteUrl = `${origin}/join/${team.inviteCode}`;

  const openMarkets = marketRows.filter((m) => m.status === 'open' || m.status === 'locked');
  const closedMarkets = marketRows.filter((m) => m.status === 'resolved' || m.status === 'voided');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">{team.name}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">🍩 {balance}</div>
            <div className="text-sm text-muted-foreground">
              Spendable this week: 🍩 {allowance}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite link</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <code className="block break-all rounded-md bg-muted px-3 py-2 text-sm">
              {inviteUrl}
            </code>
            <form action={rotateAction}>
              <Button type="submit" variant="outline">
                Rotate code
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Open markets</CardTitle>
          <Button asChild>
            <Link href={`/t/${teamId}/markets/new`}>New market</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {openMarkets.length === 0 ? (
            <p className="text-muted-foreground">No open markets. Create the first one.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {openMarkets.map((m) => (
                <li key={m.id} className="flex items-center justify-between">
                  <Link
                    href={`/t/${teamId}/markets/${m.id}`}
                    className="hover:underline"
                  >
                    {m.title}
                  </Link>
                  <span className="text-sm text-muted-foreground">{statusLabel(m.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {closedMarkets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Closed markets</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {closedMarkets.map((m) => (
                <li key={m.id} className="flex items-center justify-between">
                  <Link
                    href={`/t/${teamId}/markets/${m.id}`}
                    className="hover:underline"
                  >
                    {m.title}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {statusLabel(m.status)}
                    {m.outcome && ` · ${m.outcome.toUpperCase()}`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/t/[teamId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: team dashboard lists open and closed markets

Replaces the Plan 1 placeholder. Open markets section gets a
"New market" CTA. Closed section appears only when there's
something to show.

Open at the top —
closed below if any have closed,
button stays in view.
EOF
)"
```

---

### Task 12: Playwright E2E — full game loop

**Files:**
- Create: `tests/e2e/full-game-loop.spec.ts`
- Modify: `tests/e2e/signup-and-join.spec.ts` (extend truncate list)

- [ ] **Step 1: Update the existing e2e truncate list**

Open `tests/e2e/signup-and-join.spec.ts`. Replace the existing `TRUNCATE` statement in `test.beforeEach` with the extended list (adds `market`, `bet`):

```ts
  await sql`TRUNCATE ledger_entry, bet, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
```

- [ ] **Step 2: Build the new e2e spec**

Create `tests/e2e/full-game-loop.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';
import postgres from 'postgres';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';
const CRON_SECRET = process.env.CRON_SECRET ?? 'test-secret-cron-12345';

test.beforeEach(async () => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE ledger_entry, bet, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('founder creates market, bettor bets, founder resolves, balance updates', async ({
  browser,
}) => {
  // Founder signs in and creates a team.
  const founderCtx = await browser.newContext();
  const founder = await founderCtx.newPage();
  await signInAs(founder, 'founder@example.com');
  await founder.waitForURL('**/teams');
  await founder.getByRole('link', { name: 'Create team' }).click();
  await founder.getByLabel('Team name').fill('Game Loop Crew');
  await founder.getByRole('button', { name: 'Create team' }).click();
  await founder.waitForURL(/\/t\/[^/]+$/);
  const teamUrl = founder.url();

  // Grab the invite URL for the joiner.
  const inviteUrl = await founder
    .locator('code')
    .filter({ hasText: /\/join\// })
    .first()
    .innerText();

  // Joiner signs in and joins.
  const joinerCtx = await browser.newContext();
  const joiner = await joinerCtx.newPage();
  await signInAs(joiner, 'joiner@example.com');
  await joiner.waitForURL('**/teams');
  await joiner.goto(inviteUrl);
  await joiner.getByRole('button', { name: 'Join team' }).click();
  await joiner.waitForURL(/\/t\/[^/]+$/);

  // Founder creates a short-lived market: lockup 5s out, resolves 8s out.
  await founder.goto(teamUrl);
  await founder.getByRole('link', { name: 'New market' }).click();
  await founder.getByLabel('Title').fill('Will this test pass?');

  const toLocal = (offsetSec: number): string => {
    const d = new Date(Date.now() + offsetSec * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  await founder.getByLabel('Lockup time (bets close)').fill(toLocal(120));
  await founder.getByLabel('Resolution time (when you call it)').fill(toLocal(180));
  await founder.getByRole('button', { name: 'Create market' }).click();
  await founder.waitForURL(/\/markets\/[^/]+$/);
  const marketUrl = founder.url();

  // Joiner places a 3-doughnut bet on YES.
  await joiner.goto(marketUrl);
  await joiner.getByLabel('Amount (🍩)').fill('3');
  await joiner.getByRole('button', { name: 'Bet Yes' }).click();
  await joiner.waitForURL(marketUrl);

  // Joiner's balance card on the team dashboard now shows 🍩 9.
  await joiner.goto(teamUrl);
  await expect(joiner.getByText('🍩 9').first()).toBeVisible();

  // Move time forward in the DB so the market is past resolution.
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`UPDATE market SET lockup_at = NOW() - interval '1 minute', resolves_at = NOW() - interval '30 seconds'`;
  await sql.end();

  // Trigger the lockup-sweep cron manually.
  const sweep = await founder.request.post(`http://localhost:3001/api/cron/lockup-sweep`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(sweep.status()).toBe(200);

  // Founder resolves YES on the market detail page.
  await founder.goto(marketUrl);
  await founder.getByRole('button', { name: 'Resolve YES' }).click();
  await founder.waitForURL(marketUrl);

  // Joiner: balance back to 12 (one-sided pool, stake refunded).
  await joiner.goto(teamUrl);
  await expect(joiner.getByText('🍩 12').first()).toBeVisible();

  // Market detail now reveals bettor identity (Joiner's email local-part).
  await joiner.goto(marketUrl);
  await expect(joiner.getByText(/Joiner/)).toBeVisible();
  await expect(joiner.getByText(/Outcome:/)).toBeVisible();

  await founderCtx.close();
  await joinerCtx.close();
});
```

- [ ] **Step 3: Confirm Playwright config webServer includes `CRON_SECRET`**

Open `playwright.config.ts`. The current `webServer.command` is one long string with env vars. Append `CRON_SECRET=test-secret-cron-12345` to that command so the dev server has the secret the test will use:

The current command begins:
```
'DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e ' +
```

Insert a new line after it:
```
'CRON_SECRET=test-secret-cron-12345 ' +
```

The full updated command should look like:

```ts
command:
  'DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e ' +
  'CRON_SECRET=test-secret-cron-12345 ' +
  'AUTH_URL=http://localhost:3001 ' +
  'PORT=3001 ' +
  'E2E_MODE=1 ' +
  'npm run dev',
```

- [ ] **Step 4: Run the e2e suite**

Kill anything on port 3001 first:

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
```

Then run both specs:

```bash
nvm use
npm run test:e2e
```

Expected: 2 passing tests (signup-and-join + full-game-loop). Set bash timeout to 600000 ms.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e playwright.config.ts
git commit -m "$(cat <<'EOF'
test: add full-game-loop Playwright e2e

Two-user spec covers create market -> bet -> resolve. Time
is moved forward in the DB and the lockup-sweep cron is poked
manually with a known CRON_SECRET so the test runs in seconds
instead of minutes. Identities reveal post-resolution.

Two windows, one play —
clock skips ahead, button calls,
doughnut comes home.
EOF
)"
```

---

### Task 13: Final pass — typecheck, all tests, README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Typecheck**

```bash
nvm use
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Full unit + integration suite**

```bash
npm test
```

Expected: all tests green (the new payouts, markets, bets, resolve, lockup-sweep suites all included).

- [ ] **Step 3: Full E2E suite**

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
npm run test:e2e
```

Expected: 2 passing.

- [ ] **Step 4: Update README to reflect Plan 2**

Open `README.md`. Replace the Status section with:

```markdown
## Status

- **Plan 1 (Foundation + Identity):** Complete. Magic-link signup, teams, invite codes, balance.
- **Plan 2 (First Market End-to-End):** Complete. Create markets, place bets, lockup, resolve with parimutuel payouts.
- Plans 3 (Economy completeness — weekly reset, void, leaderboard) and 4 (Social — comments, notifications, profile, feed) are next.
```

Append, under the Docs section, a line for the Plan 2 file:

```markdown
- Plan 2: `docs/superpowers/plans/2026-05-12-shadow-kpi-plan-2-first-market.md`
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: update README for Plan 2 completion

Adds the betting loop status and links to the plan doc.

Two slabs on the floor —
auth in place and markets live,
next plans wait their turn.
EOF
)"
```

- [ ] **Step 6: Final check**

```bash
git status
git log --oneline | head -20
```

Expected: clean working tree.

---

## Definition of Done for Plan 2

- Two users join a team.
- User A creates a market with title, description, lockup, resolves times.
- User B places a bet from their balance; their balance drops by the stake.
- The lockup cron flips the market to `locked` after the lockup time.
- User A clicks Resolve at or after the resolution time; winning bets receive payouts; status flips to `resolved`.
- User B sees their new balance (stake back + share of losers' pool).
- The market detail page shows pool totals during the market and bettor identities after resolution.
- The team dashboard lists open and closed markets.
- All unit, integration, and e2e tests pass.
- `npm run build` and `npm run typecheck` both succeed.
