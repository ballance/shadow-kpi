# Daily Price Contest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-team, auto-created daily "guess the closing stock price" contest that mints fixed coin prizes to the closest guesses, resolved from Polygon.io with a manual fallback.

**Architecture:** New team-scoped tables (`price_contest`, `contest_guess`, `team_contest_config`) alongside the existing markets. A `PriceProvider` interface (Polygon impl + in-memory fake) is the single external seam. Two `CRON_SECRET`-authed cron routes open contests each morning (round-robin over a watchlist) and resolve them each evening (fetch close → pure `rankGuesses` → mint `contest_prize` ledger entries). UI lives under `/t/[teamId]`.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Drizzle ORM (pg), Zod, Vitest (unit) + testcontainers (integration), Tailwind v4. Money stored as integer cents/coins. Server logic uses the freezable `now()` from `src/server/time.ts`.

---

## Reference: existing patterns to mirror (read before starting)

- **Schema:** `src/server/db/schema.ts` — text UUID PKs via `.$defaultFn(() => crypto.randomUUID())`, `pgTable`, inline `text('col', { enum: [...] })` (no `pgEnum`), indexes. Integer money.
- **Ledger:** `src/server/ledger.ts` — `getBalance(db, {userId, teamId})`, `kind` enum, `getSpendableAllowance` (must stay unaffected).
- **Market resolution (transaction + FOR UPDATE):** `src/server/markets.ts` `resolveMarket`.
- **Pure payout fn (mirror for scoring):** `src/server/payouts.ts` `computePayouts`.
- **Cron template:** `src/app/api/cron/lockup-sweep/route.ts` (POST, `force-dynamic`, `Bearer CRON_SECRET`).
- **Clock:** `src/server/time.ts` `now()` + `__setNowForTests`.
- **Events/notifications:** `src/server/events.ts`, `src/server/notifications.ts`, `src/server/slack/blocks.ts`.
- **In-memory fake pattern:** `src/server/slack/api-inmemory.ts`.
- **Team page/layout gate:** `src/app/(app)/t/[teamId]/layout.tsx`, `page.tsx`; settings page pattern `src/app/(app)/t/[teamId]/settings/slack/page.tsx`.
- **Components:** `src/components/ui/{card,button,input,label}.tsx`, `badge.tsx`, `dashboard/lock-countdown.tsx`, `dashboard/live-poll.tsx`, `empty-state.tsx`, `dashboard/dashboard-section.tsx`.
- **Migrations:** edit `schema.ts` → `npm run db:generate` (drizzle-kit) → review SQL in `src/server/db/migrations/` → `npm run db:migrate`.
- **Run:** `npm run typecheck`, `npm test` (vitest unit), `npm run test:e2e` (playwright). Integration tests use testcontainers (see `tests/integration/**`).

## File Structure

**Create:**
- `src/server/db/schema.ts` (modify) — 3 tables + ledger enum/column
- `src/server/time.ts` (modify) — `etTimestamp(dateStr, hh, mm)`, `etDateString(date)`
- `src/server/prices/provider.ts` — `PriceProvider` interface + `getPriceProvider()`
- `src/server/prices/polygon.ts` — Polygon implementation
- `src/server/prices/fake.ts` — in-memory fake
- `src/server/contests/scoring.ts` — pure `rankGuesses`
- `src/server/contests/config.ts` — watchlist/config read+update, ticker/tier/cents parsing
- `src/server/contests/contests.ts` — create/get/list/submit/resolve
- `src/app/api/cron/contest-open/route.ts`
- `src/app/api/cron/contest-resolve/route.ts`
- `src/components/dashboard/current-contest-card.tsx`
- `src/app/(app)/t/[teamId]/contests/page.tsx`
- `src/app/(app)/t/[teamId]/settings/contest/page.tsx`
- Tests: `tests/unit/contests/scoring.test.ts`, `tests/unit/contests/config.test.ts`, `tests/unit/time-et.test.ts`, `tests/integration/contests/lifecycle.integration.test.ts`
**Modify:**
- `src/server/events.ts`, `src/server/notifications.ts`, `src/server/slack/blocks.ts` — contest events
- `vercel.json` — 2 crons
- `.env.example` — `POLYGON_API_KEY`
- `src/app/(app)/t/[teamId]/page.tsx` — mount Current Contest card
- `src/app/(app)/t/[teamId]/layout.tsx` (or nav) — "Contests" link

---

## Milestone 1 — Schema & migrations

### Task 1: Add contest tables + ledger changes to schema

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Add enums, tables, and ledger column**

Append to `src/server/db/schema.ts`. **Convention:** this schema uses inline `text('col', { enum: [...] })` (there is NO `pgEnum` in the file) and text UUID PKs. Reuse the existing `user`/`team` table refs.

```ts
export const teamContestConfig = pgTable('team_contest_config', {
  teamId: text('team_id').primaryKey().references(() => team.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  symbols: text('symbols').notNull().default('[]'),        // JSON string[] (uppercase)
  prizeTiers: text('prize_tiers').notNull().default('[25,15,10]'), // JSON number[]
  rotationCursor: integer('rotation_cursor').notNull().default(0),
});

export const priceContest = pgTable('price_contest', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(),
  contestDate: date('contest_date').notNull(),
  submissionsCloseAt: timestamp('submissions_close_at', { withTimezone: true }).notNull(),
  resolvesAfter: timestamp('resolves_after', { withTimezone: true }).notNull(),
  status: text('status', { enum: ['open', 'resolved', 'voided'] }).notNull().default('open'),
  actualCloseCents: integer('actual_close_cents'),
  prizeTiers: text('prize_tiers').notNull(),               // JSON number[] snapshot
  resolutionSource: text('resolution_source', { enum: ['api', 'manual'] }),
  resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => ({
  uniqTeamDateSymbol: uniqueIndex('price_contest_team_date_symbol_idx').on(t.teamId, t.contestDate, t.symbol),
  teamStatusDateIdx: index('price_contest_team_status_date_idx').on(t.teamId, t.status, t.contestDate),
}));

export const contestGuess = pgTable('contest_guess', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  contestId: text('contest_id').notNull().references(() => priceContest.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  guessCents: integer('guess_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqContestUser: uniqueIndex('contest_guess_contest_user_idx').on(t.contestId, t.userId),
}));
```

Add `'contest_prize'` to the `ledgerEntry` `kind` text-enum values array (the inline `text('kind', { enum: [...] })` at ~line 188), and add a nullable column to the `ledgerEntry` table:

```ts
  contestId: text('contest_id').references(() => priceContest.id, { onDelete: 'set null' }),
```

Ensure `boolean`, `date`, `index`, `uniqueIndex` are imported from `drizzle-orm/pg-core` at the top of the file (add any missing). Note: the `kind` enum is TS-only (drizzle text-enum, no DB constraint), so adding a value produces **no** DB migration for the enum itself — only the new tables and the `contest_id` column will appear in the generated SQL.

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`
Expected: a new file under `src/server/db/migrations/`. Open it and confirm it contains `CREATE TABLE "price_contest"`, `CREATE TABLE "contest_guess"`, `CREATE TABLE "team_contest_config"`, and `ALTER TABLE "ledger_entry" ADD COLUMN "contest_id"`. (No `ALTER TYPE` — the `kind` enum is TS-only.)

- [ ] **Step 3: Apply migration locally**

Run: `docker compose -f docker-compose.dev.yml up -d postgres && npm run db:migrate`
Expected: migration applies without error.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/db/migrations
git commit -m "feat(contest): add price contest, guess, and team config tables"
```

---

## Milestone 2 — Price provider + time helpers

### Task 2: ET timestamp helpers

**Files:**
- Modify: `src/server/time.ts`
- Test: `tests/unit/time-et.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { etTimestamp, etDateString } from '@/server/time';

describe('etTimestamp', () => {
  it('maps noon EDT (summer) to 16:00 UTC', () => {
    // 2026-07-01 is EDT (UTC-4)
    expect(etTimestamp('2026-07-01', 12, 0).toISOString()).toBe('2026-07-01T16:00:00.000Z');
  });
  it('maps noon EST (winter) to 17:00 UTC', () => {
    // 2026-01-05 is EST (UTC-5)
    expect(etTimestamp('2026-01-05', 12, 0).toISOString()).toBe('2026-01-05T17:00:00.000Z');
  });
  it('maps 16:15 EDT to 20:15 UTC', () => {
    expect(etTimestamp('2026-07-01', 16, 15).toISOString()).toBe('2026-07-01T20:15:00.000Z');
  });
});

describe('etDateString', () => {
  it('returns the ET calendar date for a UTC instant near midnight', () => {
    // 2026-07-02T02:00:00Z is 22:00 ET on 2026-07-01
    expect(etDateString(new Date('2026-07-02T02:00:00Z'))).toBe('2026-07-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/time-et.test.ts`
Expected: FAIL ("etTimestamp is not a function").

- [ ] **Step 3: Implement helpers**

Add to `src/server/time.ts`:

```ts
// Offset (minutes) that America/New_York is behind UTC for a given instant.
function etOffsetMinutes(utc: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(utc).reduce<Record<string, string>>((a, p) => (a[p.type] = p.value, a), {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUTC - utc.getTime()) / 60000; // negative => behind UTC
}

/** UTC instant for an ET wall-clock time (hh:mm) on the given ET date (YYYY-MM-DD). */
export function etTimestamp(dateStr: string, hh: number, mm: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  // First approximation using an arbitrary UTC time on that day to read the offset.
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const off = etOffsetMinutes(guess); // minutes ET is ahead of UTC (negative)
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0) - off * 60000);
}

/** ET calendar date (YYYY-MM-DD) for a UTC instant. */
export function etDateString(utc: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(utc);
  return p; // en-CA formats as YYYY-MM-DD
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/time-et.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/time.ts tests/unit/time-et.test.ts
git commit -m "feat(contest): add ET wall-clock time helpers"
```

### Task 3: PriceProvider interface + in-memory fake

**Files:**
- Create: `src/server/prices/provider.ts`, `src/server/prices/fake.ts`

- [ ] **Step 1: Define the interface**

`src/server/prices/provider.ts`:

```ts
export type DailyClose = { closeCents: number } | { notFound: true };

export interface PriceProvider {
  getDailyClose(symbol: string, date: string): Promise<DailyClose>;
  isTradingDay(date: string): Promise<boolean>;
}

let override: PriceProvider | null = null;
/** Test seam: inject a fake provider. */
export function __setPriceProviderForTests(p: PriceProvider | null) { override = p; }

export function getPriceProvider(): PriceProvider {
  if (override) return override;
  // Lazy import to avoid loading the HTTP client in tests that inject a fake.
  const { PolygonProvider } = require('./polygon') as typeof import('./polygon');
  return new PolygonProvider();
}
```

- [ ] **Step 2: Implement the fake**

`src/server/prices/fake.ts`:

```ts
import type { PriceProvider, DailyClose } from './provider';

export class FakePriceProvider implements PriceProvider {
  private closes = new Map<string, number>(); // `${symbol}:${date}` -> cents
  private tradingDays = new Set<string>();

  setClose(symbol: string, date: string, closeCents: number) {
    this.closes.set(`${symbol.toUpperCase()}:${date}`, closeCents);
    this.tradingDays.add(date);
  }
  setTradingDay(date: string, isTrading = true) {
    if (isTrading) this.tradingDays.add(date); else this.tradingDays.delete(date);
  }
  async getDailyClose(symbol: string, date: string): Promise<DailyClose> {
    const c = this.closes.get(`${symbol.toUpperCase()}:${date}`);
    return c === undefined ? { notFound: true } : { closeCents: c };
  }
  async isTradingDay(date: string): Promise<boolean> {
    return this.tradingDays.has(date);
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (polygon.ts required lazily; created next task).

- [ ] **Step 4: Commit**

```bash
git add src/server/prices/provider.ts src/server/prices/fake.ts
git commit -m "feat(contest): add PriceProvider interface and in-memory fake"
```

### Task 4: Polygon provider

**Files:**
- Create: `src/server/prices/polygon.ts`
- Modify: `.env.example`

- [ ] **Step 1: Implement**

`src/server/prices/polygon.ts`:

```ts
import type { PriceProvider, DailyClose } from './provider';

const BASE = 'https://api.polygon.io';

export class PolygonProvider implements PriceProvider {
  constructor(private apiKey = process.env.POLYGON_API_KEY ?? '') {
    if (!this.apiKey) throw new Error('POLYGON_API_KEY is not set');
  }

  async getDailyClose(symbol: string, date: string): Promise<DailyClose> {
    const url = `${BASE}/v1/open-close/${encodeURIComponent(symbol.toUpperCase())}/${date}?adjusted=true&apiKey=${this.apiKey}`;
    const res = await fetch(url);
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`polygon open-close ${res.status}`);
    const body = (await res.json()) as { status?: string; close?: number };
    if (body.status === 'NOT_FOUND' || typeof body.close !== 'number') return { notFound: true };
    return { closeCents: Math.round(body.close * 100) };
  }

  async isTradingDay(date: string): Promise<boolean> {
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) return false; // weekend
    const res = await fetch(`${BASE}/v1/marketstatus/upcoming?apiKey=${this.apiKey}`);
    if (!res.ok) return true; // fail open: treat as trading day, resolve will catch no-data
    const holidays = (await res.json()) as Array<{ date: string; exchange: string; status: string }>;
    const closed = holidays.some((h) => h.date === date && /closed/i.test(h.status));
    return !closed;
  }
}
```

- [ ] **Step 2: Add env placeholder**

Add to `.env.example` under a new "Price data (Polygon.io)" comment:

```
# Price data (Polygon.io) — daily contest close prices
POLYGON_API_KEY=
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/prices/polygon.ts .env.example
git commit -m "feat(contest): add Polygon price provider"
```

---

## Milestone 3 — Scoring + config parsing (pure logic)

### Task 5: `rankGuesses` scoring

**Files:**
- Create: `src/server/contests/scoring.ts`
- Test: `tests/unit/contests/scoring.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { rankGuesses } from '@/server/contests/scoring';

const d = (s: string) => new Date(s);

describe('rankGuesses', () => {
  const tiers = [25, 15, 10];

  it('ranks by absolute distance to the close', () => {
    const w = rankGuesses([
      { userId: 'a', guessCents: 31722, createdAt: d('2026-08-19T10:00:00Z') },
      { userId: 'b', guessCents: 31736, createdAt: d('2026-08-19T10:01:00Z') },
      { userId: 'c', guessCents: 31620, createdAt: d('2026-08-19T10:02:00Z') },
    ], 31683, tiers);
    expect(w.map((x) => x.userId)).toEqual(['a', 'b', 'c']);
    expect(w.map((x) => x.prizeCoins)).toEqual([25, 15, 10]);
    expect(w[0].place).toBe(1);
  });

  it('breaks ties by earliest submission', () => {
    const w = rankGuesses([
      { userId: 'late', guessCents: 10011, createdAt: d('2026-08-18T12:00:00Z') },
      { userId: 'early', guessCents: 10009, createdAt: d('2026-08-18T09:00:00Z') },
    ], 10010, tiers); // both 1 cent away
    expect(w[0].userId).toBe('early');
  });

  it('awards only as many places as there are players', () => {
    const w = rankGuesses([{ userId: 'a', guessCents: 100, createdAt: d('2026-08-18T09:00:00Z') }], 105, tiers);
    expect(w).toHaveLength(1);
    expect(w[0].prizeCoins).toBe(25);
  });

  it('returns empty when there are no guesses', () => {
    expect(rankGuesses([], 105, tiers)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- tests/unit/contests/scoring.test.ts`
Expected: FAIL ("rankGuesses is not a function").

- [ ] **Step 3: Implement**

`src/server/contests/scoring.ts`:

```ts
export type GuessInput = { userId: string; guessCents: number; createdAt: Date };
export type Winner = {
  userId: string; place: number; prizeCoins: number; guessCents: number; diffCents: number;
};

/** Closest guess wins; ties broken by earliest submission. Pure. */
export function rankGuesses(guesses: GuessInput[], actualCloseCents: number, prizeTiers: number[]): Winner[] {
  const ranked = [...guesses].sort((a, b) => {
    const da = Math.abs(a.guessCents - actualCloseCents);
    const db = Math.abs(b.guessCents - actualCloseCents);
    if (da !== db) return da - db;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const n = Math.min(prizeTiers.length, ranked.length);
  return ranked.slice(0, n).map((g, i) => ({
    userId: g.userId,
    place: i + 1,
    prizeCoins: prizeTiers[i],
    guessCents: g.guessCents,
    diffCents: Math.abs(g.guessCents - actualCloseCents),
  }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/unit/contests/scoring.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/contests/scoring.ts tests/unit/contests/scoring.test.ts
git commit -m "feat(contest): pure closest-guess scoring with tie-break"
```

### Task 6: Config + input parsing

**Files:**
- Create: `src/server/contests/config.ts`
- Test: `tests/unit/contests/config.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
  it('uppercases, trims, dedupes', () => {
    expect(parseSymbols('aapl, TTWO ,aapl')).toEqual(['AAPL', 'TTWO']);
  });
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
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- tests/unit/contests/config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/server/contests/config.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/unit/contests/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/contests/config.ts tests/unit/contests/config.test.ts
git commit -m "feat(contest): input parsing for prices, symbols, tiers"
```

---

## Milestone 4 — Contest service (DB operations)

> Uses the Drizzle `db` client (`src/server/db/client.ts`) and `now()`. Mirror `src/server/markets.ts` for transaction + `FOR UPDATE` style (`sql\`... for update\``). All functions take `db` as the first arg for testability.

### Task 7: Config accessors + `createDailyContests`

**Files:**
- Create: `src/server/contests/contests.ts`

- [ ] **Step 1: Implement config accessors + creation**

`src/server/contests/contests.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { priceContest, contestGuess, teamContestConfig } from '@/server/db/schema';
import { now, etDateString, etTimestamp } from '@/server/time';
import { getPriceProvider } from '@/server/prices/provider';
import { pickSymbol } from '@/server/contests/config';

export async function getTeamContestConfig(db: Db, teamId: string) {
  const [row] = await db.select().from(teamContestConfig).where(eq(teamContestConfig.teamId, teamId));
  return row ?? null;
}

export async function upsertTeamContestConfig(
  db: Db, teamId: string, patch: { enabled?: boolean; symbols?: string[]; prizeTiers?: number[] },
) {
  const existing = await getTeamContestConfig(db, teamId);
  const values = {
    teamId,
    enabled: patch.enabled ?? existing?.enabled ?? false,
    symbols: JSON.stringify(patch.symbols ?? (existing ? JSON.parse(existing.symbols) : [])),
    prizeTiers: JSON.stringify(patch.prizeTiers ?? (existing ? JSON.parse(existing.prizeTiers) : [25, 15, 10])),
    rotationCursor: existing?.rotationCursor ?? 0,
  };
  await db.insert(teamContestConfig).values(values)
    .onConflictDoUpdate({ target: teamContestConfig.teamId, set: {
      enabled: values.enabled, symbols: values.symbols, prizeTiers: values.prizeTiers } });
}

/** Idempotently open today's contest for every enabled team. Returns created contest ids. */
export async function createDailyContests(db: Db, provider = getPriceProvider()): Promise<string[]> {
  const today = etDateString(now());
  if (!(await provider.isTradingDay(today))) return [];
  const configs = await db.select().from(teamContestConfig).where(eq(teamContestConfig.enabled, true));
  const created: string[] = [];
  for (const cfg of configs) {
    const symbols: string[] = JSON.parse(cfg.symbols);
    if (symbols.length === 0) continue;
    const symbol = pickSymbol(symbols, cfg.rotationCursor);
    const existing = await db.select({ id: priceContest.id }).from(priceContest)
      .where(and(eq(priceContest.teamId, cfg.teamId), eq(priceContest.contestDate, today)));
    if (existing.length > 0) continue; // idempotent per team/day
    const [row] = await db.insert(priceContest).values({
      teamId: cfg.teamId, symbol, contestDate: today,
      submissionsCloseAt: etTimestamp(today, 12, 0),
      resolvesAfter: etTimestamp(today, 16, 15),
      prizeTiers: cfg.prizeTiers,
    }).returning({ id: priceContest.id });
    await db.update(teamContestConfig).set({ rotationCursor: cfg.rotationCursor + 1 })
      .where(eq(teamContestConfig.teamId, cfg.teamId));
    created.push(row.id);
  }
  return created;
}
```

Confirm `Db` is the exported client type in `src/server/db/client.ts`; if it exports a different name, import that instead.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/contests/contests.ts
git commit -m "feat(contest): team config accessors and daily contest creation"
```

### Task 8: `getCurrentContest`, `listPreviousContests`, `submitGuess`

**Files:**
- Modify: `src/server/contests/contests.ts`

- [ ] **Step 1: Implement reads + guess submission**

Append:

```ts
export async function getCurrentContest(db: Db, teamId: string, userId: string) {
  const [c] = await db.select().from(priceContest)
    .where(and(eq(priceContest.teamId, teamId), eq(priceContest.status, 'open')))
    .orderBy(desc(priceContest.contestDate)).limit(1);
  if (!c) return null;
  const [g] = await db.select().from(contestGuess)
    .where(and(eq(contestGuess.contestId, c.id), eq(contestGuess.userId, userId)));
  return { contest: c, myGuessCents: g?.guessCents ?? null, submissionsClosed: now() >= c.submissionsCloseAt };
}

export async function listPreviousContests(db: Db, teamId: string, userId: string, limit = 20) {
  const contests = await db.select().from(priceContest)
    .where(and(eq(priceContest.teamId, teamId)))
    .orderBy(desc(priceContest.contestDate)).limit(limit);
  // Winners + my placement are computed from guesses at read time for resolved contests.
  const out = [];
  for (const c of contests) {
    if (c.status === 'open') { out.push({ contest: c, winners: [], myResult: null }); continue; }
    const guesses = await db.select().from(contestGuess).where(eq(contestGuess.contestId, c.id));
    const { rankGuesses } = await import('@/server/contests/scoring');
    const tiers: number[] = JSON.parse(c.prizeTiers);
    const winners = c.actualCloseCents == null ? []
      : rankGuesses(guesses.map((g) => ({ userId: g.userId, guessCents: g.guessCents, createdAt: g.createdAt })),
          c.actualCloseCents, tiers);
    const mine = winners.find((w) => w.userId === userId) ?? null;
    const myGuess = guesses.find((g) => g.userId === userId) ?? null;
    out.push({ contest: c, winners, myResult: myGuess ? { guessCents: myGuess.guessCents, place: mine?.place ?? null } : null });
  }
  return out;
}

export class ContestError extends Error {}

export async function submitGuess(db: Db, params: { contestId: string; userId: string; guessCents: number }) {
  const [c] = await db.select().from(priceContest).where(eq(priceContest.id, params.contestId));
  if (!c) throw new ContestError('CONTEST_NOT_FOUND');
  if (c.status !== 'open' || now() >= c.submissionsCloseAt) throw new ContestError('SUBMISSIONS_CLOSED');
  await db.insert(contestGuess)
    .values({ contestId: params.contestId, userId: params.userId, guessCents: params.guessCents, updatedAt: now() })
    .onConflictDoUpdate({
      target: [contestGuess.contestId, contestGuess.userId],
      set: { guessCents: params.guessCents, updatedAt: now() },
    });
}
```

Note: winners need the winner's display name in the UI — the page layer joins `user.name`/`display_name`; `listPreviousContests` returns `userId` and the page resolves names (see Task 13).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/contests/contests.ts
git commit -m "feat(contest): current/previous reads and guess upsert"
```

### Task 9: `resolveContest` (shared by cron + manual) — with integration test

**Files:**
- Modify: `src/server/contests/contests.ts`
- Test: `tests/integration/contests/lifecycle.integration.test.ts`

- [ ] **Step 1: Write failing integration test**

Mirror the setup in existing `tests/integration/**` (testcontainers pg + migrated schema + a helper to make a team/user). Then:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { __setNowForTests, now } from '@/server/time';
import { __setPriceProviderForTests } from '@/server/prices/provider';
import { FakePriceProvider } from '@/server/prices/fake';
import { upsertTeamContestConfig, createDailyContests, submitGuess, resolveDueContests, getCurrentContest } from '@/server/contests/contests';
import { getBalance } from '@/server/ledger';
// import { makeTestDb, seedTeamWithUsers } from '<existing integration harness>';

describe('contest lifecycle', () => {
  // ...beforeAll: start container, migrate, build db; seed team T with users u1,u2,u3...

  it('opens, accepts guesses, resolves, and mints prizes', async () => {
    const fake = new FakePriceProvider();
    __setPriceProviderForTests(fake);
    __setNowForTests(new Date('2026-08-19T13:00:00Z')); // ~9 ET, trading morning
    fake.setTradingDay('2026-08-19');
    fake.setClose('AAPL', '2026-08-19', 31683);

    await upsertTeamContestConfig(db, teamId, { enabled: true, symbols: ['AAPL'], prizeTiers: [25, 15, 10] });
    const [contestId] = await createDailyContests(db, fake);
    expect(contestId).toBeTruthy();

    await submitGuess(db, { contestId, userId: u1, guessCents: 31722 });
    await submitGuess(db, { contestId, userId: u2, guessCents: 31736 });
    await submitGuess(db, { contestId, userId: u3, guessCents: 31620 });

    __setNowForTests(new Date('2026-08-19T21:00:00Z')); // after 16:15 ET
    await resolveDueContests(db, fake);

    expect(await getBalance(db, { userId: u1, teamId })).toBe(25);
    expect(await getBalance(db, { userId: u2, teamId })).toBe(15);
    expect(await getBalance(db, { userId: u3, teamId })).toBe(10);
    const cur = await getCurrentContest(db, teamId, u1);
    expect(cur).toBeNull(); // resolved, no open contest
  });

  it('is idempotent: creating twice yields one contest; resolving twice mints once', async () => {
    // second createDailyContests same day -> no new contest; second resolve -> balances unchanged
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test:e2e -- --grep contest` is NOT this; run integration via: `npx vitest run tests/integration/contests/lifecycle.integration.test.ts`
Expected: FAIL ("resolveDueContests is not a function").

- [ ] **Step 3: Implement `resolveContest` + `resolveDueContests`**

Append to `src/server/contests/contests.ts`:

```ts
import { sql } from 'drizzle-orm';
import { ledgerEntry } from '@/server/db/schema';
import { rankGuesses } from '@/server/contests/scoring';
import { eventBus } from '@/server/events';

async function mintPrizesAndResolve(db: Db, contestId: string, actualCloseCents: number,
  source: 'api' | 'manual', resolvedBy: string | null) {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(priceContest)
      .where(eq(priceContest.id, contestId)).for('update');
    if (!c || c.status !== 'open') return; // idempotent
    const guesses = await tx.select().from(contestGuess).where(eq(contestGuess.contestId, contestId));
    const tiers: number[] = JSON.parse(c.prizeTiers);
    const winners = rankGuesses(
      guesses.map((g) => ({ userId: g.userId, guessCents: g.guessCents, createdAt: g.createdAt })),
      actualCloseCents, tiers);
    for (const w of winners) {
      await tx.insert(ledgerEntry).values({
        teamId: c.teamId, userId: w.userId, amount: w.prizeCoins, kind: 'contest_prize', contestId: c.id,
      });
    }
    await tx.update(priceContest).set({
      status: 'resolved', actualCloseCents, resolutionSource: source, resolvedBy,
      resolvedAt: now(),
    }).where(eq(priceContest.id, contestId));
    await eventBus.emit({ type: 'ContestResolved', contestId: c.id, teamId: c.teamId, symbol: c.symbol,
      contestDate: c.contestDate, actualCloseCents, winners });
  });
}

const GRACE_DAYS = 3;

/** Resolve every open contest past its resolve time via the provider; void after the grace window. */
export async function resolveDueContests(db: Db, provider = getPriceProvider()): Promise<void> {
  const due = await db.select().from(priceContest)
    .where(and(eq(priceContest.status, 'open')));
  for (const c of due) {
    if (now() < c.resolvesAfter) continue;
    const res = await provider.getDailyClose(c.symbol, c.contestDate);
    if ('closeCents' in res) { await mintPrizesAndResolve(db, c.id, res.closeCents, 'api', null); continue; }
    const ageDays = (now().getTime() - new Date(`${c.contestDate}T00:00:00Z`).getTime()) / 86400000;
    if (ageDays > GRACE_DAYS) {
      await db.update(priceContest).set({ status: 'voided', resolvedAt: now() }).where(eq(priceContest.id, c.id));
    }
  }
}

/** Manual fallback (any team member) — used when the API cannot resolve. */
export async function manualResolve(db: Db, params: { contestId: string; userId: string; actualCloseCents: number }) {
  const [c] = await db.select().from(priceContest).where(eq(priceContest.id, params.contestId));
  if (!c) throw new ContestError('CONTEST_NOT_FOUND');
  if (c.status !== 'open' || now() < c.resolvesAfter) throw new ContestError('NOT_RESOLVABLE_YET');
  await mintPrizesAndResolve(db, params.contestId, params.actualCloseCents, 'manual', params.userId);
}
```

Add the `ContestResolved` event to `src/server/events.ts` `DomainEvent` union now so `emit` typechecks:

```ts
| { type: 'ContestResolved'; contestId: string; teamId: string; symbol: string; contestDate: string;
    actualCloseCents: number; winners: { userId: string; place: number; prizeCoins: number }[] }
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/integration/contests/lifecycle.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/contests/contests.ts src/server/events.ts tests/integration/contests/lifecycle.integration.test.ts
git commit -m "feat(contest): resolution, prize minting, manual fallback (+integration test)"
```

---

## Milestone 5 — Cron routes

### Task 10: `contest-open` and `contest-resolve` cron routes

**Files:**
- Create: `src/app/api/cron/contest-open/route.ts`, `src/app/api/cron/contest-resolve/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Implement routes (copy the lockup-sweep auth template exactly)**

`src/app/api/cron/contest-open/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { createDailyContests } from '@/server/contests/contests';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'CRON_SECRET not configured.' } },
      { status: 500 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: 'NOT_AUTHENTICATED', message: 'Bad cron auth.' } },
      { status: 401 },
    );
  }
  const created = await createDailyContests(db);
  return NextResponse.json({ created: created.length });
}
```

`src/app/api/cron/contest-resolve/route.ts` — identical shape, calling `await resolveDueContests(db)` and returning `{ ok: true }`. Copy the exact `db` import + auth-error JSON from `src/app/api/cron/lockup-sweep/route.ts`.

- [ ] **Step 2: Add crons to `vercel.json`**

Add to the `crons` array:

```json
{ "path": "/api/cron/contest-open", "schedule": "0 13 * * 1-5" },
{ "path": "/api/cron/contest-resolve", "schedule": "0 22 * * 1-5" }
```

- [ ] **Step 3: Manual smoke test**

Run (local dev up): `curl -X POST localhost:3333/api/cron/contest-open -H "authorization: Bearer $CRON_SECRET"`
Expected: `{"created":N}` (0 if no enabled teams). Unauthed call returns 401.

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck` (PASS), then:

```bash
git add src/app/api/cron/contest-open src/app/api/cron/contest-resolve vercel.json
git commit -m "feat(contest): open/resolve cron routes"
```

---

## Milestone 6 — UI + notifications

### Task 11: Current Contest card + guess action on the dashboard

**Files:**
- Create: `src/components/dashboard/current-contest-card.tsx`
- Modify: `src/app/(app)/t/[teamId]/page.tsx`

- [ ] **Step 1: Build the card (client form posts to a server action)**

`src/components/dashboard/current-contest-card.tsx` — RSC that renders a `Card` with trophy + `SYMBOL · date`, `LockCountdown submissionsCloseAt`, prize tiers list, "Your current guess: $X", a `<form action={submitGuessAction}>` with a `name="guess"` `<Input type="number" step="0.01">` and an `Update guess` `Button`. When `submissionsClosed`, replace the form with "Submissions closed — awaiting result." Accept props `{ data, submitGuessAction }` where `data` is the `getCurrentContest` result.

- [ ] **Step 2: Wire into the team dashboard**

In `src/app/(app)/t/[teamId]/page.tsx`: import `getCurrentContest` and render `<CurrentContestCard>` above the markets sections (only if `data` non-null). Define an inline `'use server'` action:

```ts
async function submitGuessAction(formData: FormData) {
  'use server';
  const session = await auth(); if (!session?.user) redirect('/signin');
  const contestId = String(formData.get('contestId'));
  const guessCents = parseDollarsToCents(String(formData.get('guess')));
  await submitGuess(db, { contestId, userId: session.user.id, guessCents });
  revalidatePath(`/t/${teamId}`);
}
```

Include a hidden `<input name="contestId">` in the form. Import `parseDollarsToCents`, `submitGuess`, the `db` singleton from `@/server/db/client`, and `revalidatePath`.

- [ ] **Step 3: Manual verify**

Run: enable a team's contest in DB, POST the open cron, load `/t/<team>` → card shows; submit a guess → "Your current guess" updates.

- [ ] **Step 4: Typecheck + commit**

```bash
git add src/components/dashboard/current-contest-card.tsx "src/app/(app)/t/[teamId]/page.tsx"
git commit -m "feat(contest): Current Contest dashboard card + guess action"
```

### Task 12: Contest settings page (watchlist / tiers / enable)

**Files:**
- Create: `src/app/(app)/t/[teamId]/settings/contest/page.tsx`

- [ ] **Step 1: Build the settings page (mirror `settings/slack/page.tsx`)**

RSC loads `getTeamContestConfig`. A `<form action={saveAction}>` with: `enabled` checkbox, `symbols` text input (comma-separated, prefilled from `JSON.parse(symbols).join(', ')`), `prizeTiers` text input (prefilled). The `'use server'` action:

```ts
async function saveAction(formData: FormData) {
  'use server';
  const session = await auth(); if (!session?.user) redirect('/signin');
  await upsertTeamContestConfig(db, teamId, {
    enabled: formData.get('enabled') === 'on',
    symbols: parseSymbols(String(formData.get('symbols'))),
    prizeTiers: parseTiers(String(formData.get('prizeTiers'))),
  });
  revalidatePath(`/t/${teamId}/settings/contest`);
}
```

Wrap `parseSymbols`/`parseTiers` in try/catch to surface validation errors via a searchParam message (follow the slack settings page's error-display pattern).

- [ ] **Step 2: Typecheck + commit**

```bash
git add "src/app/(app)/t/[teamId]/settings/contest"
git commit -m "feat(contest): team contest settings (watchlist, tiers, enable)"
```

### Task 13: Contests history page + nav link + manual-resolve

**Files:**
- Create: `src/app/(app)/t/[teamId]/contests/page.tsx`
- Modify: `src/app/(app)/t/[teamId]/layout.tsx` (nav link)

- [ ] **Step 1: Build the page**

RSC: render the Current Contest card (reuse Task 11 component + action) at top, then a "Previous Contests" list from `listPreviousContests`. For each: `SYMBOL · date`, prize tiers line, and for resolved contests `Close: $X`, `Winners` (1st/2nd/3rd with name + guess), plus the viewer's "Did not participate"/placement. Resolve winner `userId`→name by selecting `user.name`/`display_name` for the winner ids (batch select). For an `open` contest already past `resolvesAfter` with no close yet, render a small `<form action={manualResolveAction}>` with a price input ("Enter actual close") — available to any member.

`manualResolveAction`:

```ts
async function manualResolveAction(formData: FormData) {
  'use server';
  const session = await auth(); if (!session?.user) redirect('/signin');
  await manualResolve(db, {
    contestId: String(formData.get('contestId')),
    userId: session.user.id,
    actualCloseCents: parseDollarsToCents(String(formData.get('close'))),
  });
  revalidatePath(`/t/${teamId}/contests`);
}
```

- [ ] **Step 2: Add nav link**

In `src/app/(app)/t/[teamId]/layout.tsx` (or the shared nav), add a link to `/t/[teamId]/contests` labeled "Contests" next to the existing team nav items.

- [ ] **Step 3: Manual verify**

Resolve a contest via cron/manual → history shows close + winners; a losing user sees "Did not participate"/no-placement; winners' balances reflect prizes.

- [ ] **Step 4: Typecheck + commit**

```bash
git add "src/app/(app)/t/[teamId]/contests" "src/app/(app)/t/[teamId]/layout.tsx"
git commit -m "feat(contest): contests history page, nav link, manual resolve"
```

### Task 14: Resolution notifications (in-app + Slack)

**Files:**
- Modify: `src/server/notifications.ts`, `src/server/slack/blocks.ts`

- [ ] **Step 1: Handle `ContestResolved` in the notification subscriber**

In `src/server/notifications.ts`, add a case for `ContestResolved`: for each participant (winners get placement; look up all guessers via the db), insert a `notification` row (`kind: 'contest_resolved'`, `payload` JSON with symbol, close, place, prize). Follow the existing `MarketResolved` handling for structure and db access.

- [ ] **Step 2: Slack block**

In `src/server/slack/blocks.ts`, add a `contestResolvedBlocks({ symbol, contestDate, actualCloseCents, winners })` builder mirroring the market-resolved block; wire it where the slack outbox subscriber switches on event type.

- [ ] **Step 3: Typecheck + run full suite**

Run: `npm run typecheck && npm test`
Expected: PASS (all unit tests). Then `npx vitest run tests/integration/contests/lifecycle.integration.test.ts` PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/notifications.ts src/server/slack/blocks.ts
git commit -m "feat(contest): resolution notifications (in-app + slack)"
```

---

## Final verification

- [ ] `npm run typecheck` — PASS
- [ ] `npm test` — all unit tests PASS
- [ ] `npx vitest run tests/integration/contests/lifecycle.integration.test.ts` — PASS
- [ ] Manual E2E on local dev: enable contest → open cron → guess (updatable) → resolve cron with a seeded/real price → winners paid, history renders, "Submissions closed" gating works.
- [ ] Set `POLYGON_API_KEY` present in Vercel production (already done) and confirm the two crons appear in the Vercel dashboard after deploy.

## Notes on deferred/optional

- `ContestOpened` in-app notification is optional; not included above (low value). Add later if wanted.
- Ticker validity is enforced by regex on save; true "is this a real ticker" validation is deferred to resolution (grace-window void).
- No membership role system exists; manual resolve is intentionally open to any team member (recorded via `resolved_by`).
