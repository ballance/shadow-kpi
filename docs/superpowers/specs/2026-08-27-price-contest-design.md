# Daily Price Contest — Design Spec

**Date:** 2026-08-27
**Status:** Approved for planning
**Feature:** A per-team, auto-created daily contest where players guess a stock's
closing price. Closest guesses win fixed, house-minted coin prizes.

---

## 1. Summary

Each trading day, the app opens one contest per opted-in team using a ticker from
the team's watchlist. Players submit a single sealed guess of that day's closing
price, updatable until submissions close at **12:00 ET**. After the market closes,
a cron fetches the official close from Polygon.io, ranks guesses by absolute
distance, and mints fixed coin prizes (default `[25, 15, 10]`) to the winners.
A manual fallback lets any team member enter the close if the API can't.

This is an **addition** alongside the existing binary parimutuel markets; it shares
the same team-scoped coin balance (the `ledger_entry` table).

## 2. Decision log

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scope | **Per-team** (each team its own contest, guesses, winners) |
| 2 | Price source | **Auto (Polygon) with manual fallback** |
| 3 | Prize economy | **House-minted fixed prizes** (free entry, inflationary like the weekly allowance) |
| 4 | Contest creation | **Auto-daily from a team watchlist** (round-robin) |
| 5 | API vendor | **Polygon.io** (env `POLYGON_API_KEY`, free EOD tier) |
| 6 | Manual fallback permission | **Any team member** (recorded) |
| 7 | Submission timing | **Lock 12:00 ET**, resolve after **16:15 ET** |

## 3. Scope & non-goals

**In scope:** per-team daily equity/ETF closing-price contest, watchlist config,
sealed single guess (updatable), auto open + auto resolve crons, closest-guess
scoring with fixed prizes, coin minting, manual fallback, dashboard card,
contests history page, resolution notifications.

**Non-goals (v1):** global/cross-team contests; options/intraday/other-than-close;
real money; per-team configurable timing (fixed 12:00/16:15 ET); a full holiday
calendar beyond what Polygon reports; a membership role system.

## 4. Data model

All money stored as **integer cents** (prices/guesses) or **integer coins**
(prizes), consistent with the existing integer-coin convention. New tables follow
the Drizzle/pg-core patterns in `src/server/db/schema.ts` (text UUID PKs via
`crypto.randomUUID()`).

### `price_contest`
| column | type | notes |
|--------|------|-------|
| `id` | text PK | uuid |
| `team_id` | text → team | |
| `symbol` | text notNull | uppercase ticker |
| `contest_date` | date notNull | the trading day being guessed |
| `submissions_close_at` | timestamp notNull | contest_date 12:00 ET (stored UTC) |
| `resolves_after` | timestamp notNull | contest_date 16:15 ET (stored UTC) |
| `status` | text enum `['open','resolved','voided']` default `open` | |
| `actual_close_cents` | integer nullable | set at resolution |
| `prize_tiers` | text notNull | JSON int array snapshot, e.g. `[25,15,10]` |
| `resolution_source` | text enum `['api','manual']` nullable | |
| `resolved_by` | text → user, nullable | audit for manual resolution |
| `created_at` | timestamp | |
| `resolved_at` | timestamp nullable | |

Unique index `(team_id, contest_date, symbol)` → idempotent scheduler.
Index `(team_id, status, contest_date)` for listings.

### `contest_guess`
| column | type | notes |
|--------|------|-------|
| `id` | text PK | uuid |
| `contest_id` | text → price_contest | |
| `user_id` | text → user | |
| `guess_cents` | integer notNull | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

Unique `(contest_id, user_id)` → one guess/user; updates are upserts.

### `team_contest_config`
| column | type | notes |
|--------|------|-------|
| `team_id` | text PK → team | |
| `enabled` | boolean default false | opt-in |
| `symbols` | text notNull default `[]` | JSON uppercase ticker array (watchlist) |
| `prize_tiers` | text notNull default `[25,15,10]` | JSON int array |
| `rotation_cursor` | integer default 0 | round-robin index |

### `ledger_entry` (migration)
- Add enum value `contest_prize` to the `kind` enum.
- Add nullable column `contest_id` text → price_contest (on delete set null).

Balances remain `SUM(ledger_entry.amount)`. `contest_prize` entries are persistent
winnings — they are **not** counted by `getSpendableAllowance` (which only sums
`allowance_grant | allowance_evaporate | stake | refund`), so no change is needed
there.

## 5. Price provider

A narrow interface (one clear external seam, mockable in tests):

```ts
interface PriceProvider {
  // official close for a symbol on a date; notFound if non-trading day / untracked
  getDailyClose(symbol: string, date: string): Promise<{ closeCents: number } | { notFound: true }>;
  // whether `date` (YYYY-MM-DD, ET) is a US equities trading day
  isTradingDay(date: string): Promise<boolean>;
}
```

- **`src/server/prices/polygon.ts`** — Polygon impl.
  - `getDailyClose` → `GET /v1/open-close/{symbol}/{date}?adjusted=true` → `close`
    field (dollars) → round to cents; treat `status: "NOT_FOUND"`/no-data as
    `{ notFound: true }`.
  - `isTradingDay` → weekend pre-filter, then Polygon market holidays
    (`GET /v1/marketstatus/upcoming`) to exclude holidays.
  - Auth via `POLYGON_API_KEY`. Free tier: EOD data, ~5 req/min — fine (few
    contests/day). Sequential fetches with a small delay in the resolve cron.
- **`src/server/prices/fake.ts`** — in-memory provider seeded with a
  `symbol→date→closeCents` map + trading-day set, for deterministic tests (mirrors
  `src/server/slack/api-inmemory.ts`).
- Provider selected in one place; default Polygon, fake injected in tests.
- New env: `POLYGON_API_KEY` (already set locally + Vercel production). Add the
  name with a placeholder to `.env.example`.

## 6. Scheduling & timing

Two new cron routes using the existing `CRON_SECRET` Bearer template
(`src/app/api/cron/*/route.ts`). Adds 2 crons → 5 total (Pro plan, already in use).

| Route | vercel.json schedule (UTC) | Purpose |
|-------|----------------------------|---------|
| `/api/cron/contest-open` | `0 13 * * 1-5` (~8–9 ET) | create today's contests |
| `/api/cron/contest-resolve` | `0 22 * * 1-5` (~5–6 ET) | fetch close, resolve, pay |

Weekday filter `1-5` is a cheap weekend skip; holidays handled by
`isTradingDay`.

**ET/DST:** a helper `etTimestamp(dateStr, hh, mm)` computes the UTC instant for an
ET wall-clock time on a given date using `Intl.DateTimeFormat` with
`timeZone: 'America/New_York'` to derive the offset (handles EST/EDT). Server logic
uses `now()` from `src/server/time.ts` (test-freezable), never argless `new Date()`.

**contest-open** (per enabled team):
1. `today = ET date of now()`. If `!isTradingDay(today)` → skip.
2. If a `price_contest` already exists for `(team, today)` → skip (idempotent).
3. `symbol = symbols[rotation_cursor % symbols.length]` (skip if watchlist empty).
4. Insert contest: `submissions_close_at = etTimestamp(today,12,00)`,
   `resolves_after = etTimestamp(today,16,15)`, `prize_tiers` snapshotted from config.
5. Increment `rotation_cursor`. Emit `ContestOpened`.

**contest-resolve** (per contest with `status='open'` and `now() >= resolves_after`):
1. `getDailyClose(symbol, contest_date)`.
2. Found → resolve (Section 7).
3. `notFound` and within grace window (≤ 3 ET evenings past `contest_date`) →
   leave `open` (retry tomorrow); UI shows "Results coming soon".
4. `notFound` past grace window → `status='voided'` (free entry ⇒ no refunds).

## 7. Contest lifecycle & resolution

States: `open → resolved` (normal) or `open → voided` (no data / non-trading).
"Submissions closed" is **derived from `submissions_close_at`** (the guess action
rejects after it) — no separate lock state/cron, mirroring how bets reject after
`lockup_at`.

**Resolution** (shared by cron + manual fallback), in a `db.transaction` with
`SELECT ... FOR UPDATE` on the contest row; **idempotent** (abort if already
`resolved`/`voided`):
1. Load guesses for the contest.
2. `winners = rankGuesses(guesses, actual_close_cents, prize_tiers)`.
3. Insert one `ledger_entry` per winner: `{ team_id, user_id, amount:+prizeCoins,
   kind:'contest_prize', contest_id }`.
4. Set `actual_close_cents`, `resolution_source`, `resolved_by` (manual only),
   `status='resolved'`, `resolved_at`.
5. Emit `ContestResolved`.

No guesses ⇒ resolve with the close recorded and zero winners (no minting).
Fewer players than tiers ⇒ only filled places are awarded.

### Scoring (pure, unit-tested)
```ts
type GuessInput = { userId: string; guessCents: number; createdAt: Date };
type Winner = { userId: string; place: number; prizeCoins: number; guessCents: number; diffCents: number };
function rankGuesses(guesses: GuessInput[], actualCloseCents: number, prizeTiers: number[]): Winner[];
```
Sort by `(abs(guessCents - actualCloseCents) asc, createdAt asc)` — **earliest
submission breaks ties**. Take the first `min(prizeTiers.length, guesses.length)`;
assign `place = i+1`, `prizeCoins = prizeTiers[i]`. Pure function, no I/O (mirrors
`computePayouts`).

## 8. Guessing

Server action on the Current Contest form:
- Input raw dollars string (e.g. `"237.83"`). Zod-validate: finite, `> 0`,
  `<= 1_000_000`, ≤ 2 decimals. Convert `guess_cents = Math.round(value * 100)`.
- Reject if `status !== 'open'` or `now() >= submissions_close_at`
  (`SUBMISSIONS_CLOSED`), or non-member.
- Upsert `contest_guess` on conflict `(contest_id, user_id)` → set `guess_cents`,
  `updated_at`. `revalidatePath`.
- Guesses are **sealed**: a user sees only their own guess until the contest
  resolves.

## 9. Manual fallback

Action available to **any team member** when `status='open'` and
`now() >= resolves_after` and no close is set yet:
- Input the actual close (dollars → cents). Runs the same Section 7 resolution with
  `resolution_source='manual'`, `resolved_by = user.id`. Recorded for audit.

## 10. UI surfaces (all under `/t/[teamId]`)

- **Dashboard "Current Contest" card** (`current-contest-card.tsx`, data via
  `getCurrentContest({teamId, userId})`): trophy + `SYMBOL · date`, countdown
  (reuse `LockCountdown` with `submissions_close_at`), prize tiers, "Your current
  guess", number input + submit/update. After close → "Submissions closed —
  awaiting result". Matches screenshot 1.
- **`/t/[teamId]/contests`** — Current contest + **Previous Contests** list
  (`listPreviousContests({teamId, userId})`): per contest show close price, top
  winners (name · guess), and the viewer's placement or "Did not participate";
  pending shows "Results coming soon". Matches screenshot 2.
- **`/t/[teamId]/settings/contest`** (mirrors `settings/slack`): toggle `enabled`,
  edit watchlist (comma-separated tickers, uppercased/validated) and prize tiers
  (comma-separated ints).
- Add a "Contests" nav link in the team layout.

## 11. Notifications / events

Extend `src/server/events.ts` `DomainEvent` union with `ContestOpened` and
`ContestResolved`; add cases in `src/server/notifications.ts` (in-app
`notification` rows) and `src/server/slack/blocks.ts`. `ContestResolved` tells each
participant the close and their placement (e.g., "AAPL closed $316.83 — you placed
2nd (+15 coins)"). `ContestOpened` in-app notice is optional/low-priority.

## 12. Edge cases

- Empty watchlist → open cron skips the team.
- Non-trading day / holiday → no contest opened; a stray one voids on resolve.
- Untracked/invalid ticker → `notFound` → grace-window retries → void; surfaced in
  settings by validating tickers on save where feasible.
- Duplicate creation prevented by unique `(team_id, contest_date, symbol)`.
- Double resolution prevented by the `FOR UPDATE` + status guard (no double mint).
- DST transitions handled by the ET helper.
- Polygon rate limit → sequential fetch with small delay; low volume.

## 13. Testing

- **Unit:** `rankGuesses` (ties → earliest wins, exact match, empty, fewer players
  than tiers, ordering); cents parsing/validation; rotation-cursor selection; ET
  timestamp/DST helper; weekend/holiday `isTradingDay`.
- **Integration (testcontainers pg, fake provider):** open→guess→resolve→ledger &
  balance; idempotent open cron (run twice ⇒ one contest); resolve mints exact
  prizes; manual fallback path; no-guesses resolve; grace-window void.
- Fake provider seeded per test; server logic uses freezable `now()`.

## 14. Phasing (milestones for the implementation plan)

1. **Schema & migrations** — new tables, `ledger_entry` enum+`contest_id`; team
   contest settings/watchlist UI (opt-in).
2. **Price provider** — interface + Polygon impl + in-memory fake + env +
   ET/trading-day helpers.
3. **contest-open cron** — round-robin, idempotent, trading-day gated.
4. **Guess flow** — `getCurrentContest` + Current Contest card + guess/upsert action.
5. **contest-resolve cron** — scoring + minting + manual fallback action.
6. **Contests page** — previous list + placement + notifications/events + Slack.

Each milestone is independently testable and leaves the app in a working state.
