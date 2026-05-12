# shadow-kpi — Design Spec

**Date:** 2026-05-12
**Status:** Draft, awaiting user sign-off
**Author:** Chris Ballance (ballance@gmail.com), with Claude

## Summary

shadow-kpi is a workplace prediction market for fun. Teammates bet doughnuts (a virtual currency, no real money) on binary "will X happen at work" questions. Each user receives a weekly allowance of 12 doughnuts; unspent allowance evaporates each Monday, but staked and won doughnuts persist across weeks. The app is web-only, team-scoped via invite code, and uses parimutuel payouts.

## Goals

- A low-friction, browser-based betting app for a small team to bet on work events.
- Make the leaderboard meaningful: doughnuts you accumulate reflect your prediction track record.
- Keep the doughnut accounting fully auditable via an immutable ledger.
- Ship a complete v1 that is small enough to maintain as a side project, and shaped so v2 features (webhooks, multi-choice markets, etc.) drop in cleanly.

## Non-goals (v1)

- Real money, payments, or anything that touches financial regulation.
- Multi-choice or over/under markets — binary only.
- Mobile-native apps — responsive web only.
- Slack / Discord / OAuth integrations — invite codes and magic links.
- Realtime push (WebSockets, SSE) — polling is enough for team-sized traffic.
- Moderation tooling, dispute resolution, or force-resolve admin powers.

## Core decisions

| Decision | Choice |
|---|---|
| Team scope | Per-team via invite code |
| Market creation | Anyone on the team |
| Resolution | Market creator decides |
| Currency | 12 doughnuts/week allowance; unspent evaporates Monday 00:00 UTC |
| Stakes & winnings | Persist across resets — only unspent allowance evaporates |
| Market type | Binary (yes/no) only |
| Market timing | Separate `lockup_at` (no more bets) and `resolves_at` (creator can resolve) |
| Identity | Email + display name, magic-link login |
| Creator bets | Creator cannot bet on their own market |
| Voids/refunds | Creator can void before lockup; full refund to all bettors |
| Minimum bet | 1 doughnut, integer amounts only |
| Visibility | Pool totals visible during market; per-bet identities revealed at resolution |
| Notifications | In-app only in v1; event-bus-shaped so webhooks slot in for v2 |
| Hosting | Next.js 15 on Vercel + Postgres on Neon + Resend for email |

## Architecture

One Next.js 15 app on Vercel, one Postgres database on Neon, Resend for transactional email. No queues, no Redis, no separate services.

```
Browser ──► Next.js (Vercel) ──► Service layer ──► Postgres (Neon)
                                       │
                                       ├──► Auth.js (magic links)
                                       └──► Resend (email)

Vercel Cron ─► /api/cron/weekly-reset    (Mon 00:00 UTC)
Vercel Cron ─► /api/cron/lockup-sweep    (every minute)
```

**Key shape decisions:**

1. **Service layer between routes and DB.** Every doughnut-moving operation goes through one function, in a single DB transaction. Route handlers, Server Actions, and cron handlers are thin callers.
2. **Event-bus-shaped notifications with a single subscriber.** Domain events fire after each transaction commits; the only v1 subscriber writes `notification` rows. A v2 webhook subscriber is a second registration.
3. **Polling, not push.** Market detail pages poll pool totals every ~5 seconds. Cheap and sufficient for team-sized traffic.
4. **Ledger is the source of truth.** Every doughnut movement is a row in `ledger_entry`. Balances are derived sums. No mutable balance column.

## Data model

Drizzle ORM against Postgres.

```
team
  id, name, invite_code (unique), created_at

user
  id, email (unique), display_name, created_at

membership
  user_id, team_id, joined_at, role ('member' | 'admin')
  PK (user_id, team_id)

market
  id, team_id, creator_id, title, description,
  lockup_at, resolves_at,
  status ('open' | 'locked' | 'resolved' | 'voided'),
  outcome ('yes' | 'no' | null),
  created_at, resolved_at

bet
  id, market_id, user_id, side ('yes' | 'no'), amount,
  placed_at
  -- amount >= 1, integer; rows are immutable after insert

ledger_entry
  id, team_id, user_id, amount (signed integer),
  kind ('allowance_grant' | 'allowance_evaporate'
       | 'stake' | 'payout' | 'refund'),
  market_id (nullable), bet_id (nullable),
  created_at

notification
  id, user_id, kind, payload (jsonb),
  market_id (nullable),
  created_at, read_at (nullable)

comment
  id, market_id, user_id, body, created_at
```

**Derived values:**

- Total balance: `SUM(ledger_entry.amount) WHERE user_id=? AND team_id=?`
- Allowance granted this week: `SUM(amount) WHERE user_id=? AND team_id=? AND kind='allowance_grant' AND created_at >= week_start`
- Stakes placed this week: `SUM(amount) WHERE user_id=? AND team_id=? AND kind='stake' AND created_at >= week_start` (negative)
- Refunds of this-week stakes: `SUM(r.amount) FROM ledger_entry r JOIN bet b ON r.bet_id=b.id WHERE r.user_id=? AND r.team_id=? AND r.kind='refund' AND b.placed_at >= week_start` (positive)
- Spendable allowance (this week): `max(0, allowance_granted + stakes + refunds_of_this_week_stakes)`

Where `week_start` = most recent Monday 00:00 UTC.

Conceptual model: doughnuts come in two flavors that share one balance number.
- **Allowance** is the 12/week budget. It is consumed by stakes (FIFO) and topped up by refunds of stakes placed in the same week. What remains evaporates Monday.
- **Holdings** are past winnings, refunds of prior-week stakes, and anything else. They survive resets.

Bets are debited from allowance first, holdings second. Payouts (`kind='payout'`) and prior-week refunds always land in holdings. This is enforced implicitly by the spendable-allowance formula — we never need a separate holdings column.

**Indexes (initial):**

- `bet (market_id)`
- `ledger_entry (team_id, user_id, created_at)`
- `market (team_id, status, lockup_at)`
- `notification (user_id, read_at)`
- `team (invite_code)`

**Role field note:** `membership.role` exists but the only admin power in v1 is rotating the team invite code. Open question for the user during review: keep `role` or rip it out and let any member rotate.

## Key flows

### 1. Sign up & join a team

```
GET /join/<invite_code>
  → form: email + display name
  → Auth.js sends magic link (callbackUrl preserves invite code)
  → click link → session set, membership row created
  → first weekly allowance_grant ledger entry written (12 🍩)
  → redirect to team dashboard
```

### 2. Create a market

```
Server Action: createMarket(title, description, lockup_at, resolves_at)
  → validate: lockup_at > now, resolves_at >= lockup_at, user in team
  → INSERT market (status='open')
  → emit MarketCreated → notification rows for all team members except creator
```

### 3. Place a bet

```
Server Action: placeBet(market_id, side, amount)
  → BEGIN TRANSACTION
  → SELECT market FOR UPDATE
      assert status='open', now < lockup_at,
             user is member of market.team_id,
             user_id != market.creator_id,
             amount >= 1 (integer)
  → SELECT SUM(amount) FROM ledger_entry
      WHERE user_id=? AND team_id=? FOR UPDATE
      assert balance >= amount
  → INSERT bet
  → INSERT ledger_entry (kind='stake', amount=-N, bet_id=...)
  → COMMIT
  → emit BetPlaced (no notification fanout; pool totals update on next poll)
```

### 4. Resolve a market

```
Server Action: resolveMarket(market_id, outcome)
  → BEGIN TRANSACTION
  → SELECT market FOR UPDATE
      assert status in ('open','locked'),
             now >= resolves_at,
             user_id == creator_id
  → compute payouts (see Parimutuel math)
  → UPDATE market SET status='resolved', outcome=?, resolved_at=now()
  → for each winning bet: INSERT ledger_entry (kind='payout', amount=+payout, bet_id=...)
  → COMMIT
  → emit MarketResolved → notification per participant
```

After resolution, the market detail page reveals each bet's user and amount.

### 5. Void a market (creator, before lockup)

```
Server Action: voidMarket(market_id)
  → assert creator, status='open', now < lockup_at
  → for each bet: INSERT ledger_entry (kind='refund', amount=+bet.amount, bet_id=...)
  → UPDATE market SET status='voided'
  → emit MarketVoided → notification per bettor
```

### 6. Lockup sweep (Vercel Cron, every minute)

```
POST /api/cron/lockup-sweep
  → UPDATE market SET status='locked'
      WHERE status='open' AND lockup_at <= now()
      RETURNING id, team_id
  → for each locked market: emit MarketLocked → notification per bettor
```

Idempotent: a second run on an already-locked market matches no rows.

### 7. Weekly allowance reset (Vercel Cron, Monday 00:00 UTC)

```
POST /api/cron/weekly-reset
  → week_start = floor(now()) to most recent Monday 00:00 UTC
  → for each (user, team) membership:
      → BEGIN TRANSACTION
      → if EXISTS allowance_grant WHERE user_id=? AND team_id=? AND created_at >= week_start:
          → COMMIT and skip (already ran for this user this week)
      → spendable = max(0,
              SUM(allowance_grant amount, created_at >= prev_week_start)
            + SUM(stake amount,          created_at >= prev_week_start)
            + SUM(refund amount where bet.placed_at >= prev_week_start))
      → if spendable > 0:
          INSERT ledger_entry (kind='allowance_evaporate', amount=-spendable)
      → INSERT ledger_entry (kind='allowance_grant', amount=+12, created_at=now())
      → COMMIT
  → no events or notifications emitted
```

`prev_week_start` is the Monday *before* this cron's `week_start` — i.e., the week we are closing out. Signup grants outside any cron run are handled by `placeMembership` (see flow 1), which writes a `kind='allowance_grant'` for the user's first week. The `EXISTS` check uses `created_at >= week_start` (this week's Monday), so a signup grant from the previous Tuesday does NOT block the current Monday's cron — it's in the previous week.

## Parimutuel math

Computed once at resolution time inside the resolution transaction. No denormalized pool totals.

```
losing_pool  = SUM(bet.amount) WHERE market_id=? AND side = losing_side
winning_pool = SUM(bet.amount) WHERE market_id=? AND side = winning_side
profit_per_doughnut = losing_pool / winning_pool   (real division)

for each winning bet (ordered by amount DESC, placed_at ASC):
    payout = bet.amount + floor(bet.amount * profit_per_doughnut)
```

Distributed payouts sum to `winning_pool + floor(...) totals` ≤ `winning_pool + losing_pool`. Any positive integer remainder (the "dust") is added to the single largest winning bet (earliest placed wins ties).

**Edge cases:**

1. **Dust** → added to largest winning bet (earliest tiebreak).
2. **No bets on winning side** → all losing-side stakes vaporize. No refunds. No payouts.
3. **No bets at all** → market resolves as normal; outcome is recorded; zero ledger writes.
4. **Only one side has bets, and that side wins** → each winning bet's payout equals its stake (profit_per_doughnut = 0/winning_pool = 0). Math handles it without special-casing.

## Notifications & events

In-process event bus, called only after transactions commit.

```ts
type DomainEvent =
  | { type: 'MarketCreated'; marketId: string; teamId: string; creatorId: string }
  | { type: 'MarketLocked'; marketId: string; teamId: string }
  | { type: 'MarketResolved'; marketId: string; teamId: string; outcome: 'yes' | 'no' }
  | { type: 'MarketVoided'; marketId: string; teamId: string }
  | { type: 'CommentPosted'; marketId: string; teamId: string; commenterId: string };

type EventSubscriber = (event: DomainEvent) => Promise<void>;

const subscribers: EventSubscriber[] = [inAppNotificationSubscriber];

export async function emit(event: DomainEvent): Promise<void> {
  for (const sub of subscribers) {
    try { await sub(event); } catch (err) { console.error('subscriber failed', err); }
  }
}
```

**v1 fanout rules:**

| Event | Recipients |
|---|---|
| `MarketCreated` | all team members except creator |
| `MarketLocked` | all bettors on that market |
| `MarketResolved` | all bettors on that market |
| `MarketVoided` | all bettors on that market |
| `CommentPosted` | bettors + creator, excluding commenter |

**UI:** A bell icon in the top nav with an unread count derived from `notification.read_at IS NULL`. Click → dropdown of latest 20, marking all read on open. Each item links to its market.

**v2 extension point:** Add a `webhookSubscriber` to the `subscribers` array that POSTs the event JSON to a per-team webhook URL. No service-layer changes.

## Error handling

Three categories:

**1. User errors.** Service functions throw typed `DomainError(code, message)`. Route handlers map to HTTP 400/403/409 and return `error.message` for the UI to display. No client-side English strings.

Examples and codes:

- `INSUFFICIENT_BALANCE`, `BET_AFTER_LOCKUP`, `CREATOR_CANNOT_BET`,
  `NOT_MARKET_CREATOR`, `RESOLVE_TOO_EARLY`, `MARKET_NOT_RESOLVABLE`,
  `INVITE_CODE_INVALID`, `AMOUNT_BELOW_MINIMUM`.

**2. Race conditions.** Service transactions use `SELECT ... FOR UPDATE` on the market row and on the user's ledger when relevant. Concurrent operations serialize correctly; the second caller re-reads state and may fail with a domain error. Cron handlers are idempotent (see flows 6 and 7).

**3. Infrastructure.**

- DB unavailable → 500, generic error page. No retry layer.
- Email send failure during magic-link login → "couldn't send email, try again". No half-signed-in state.
- Notification subscriber throws → logged and swallowed. Originating operation is unaffected.

**Explicitly not in v1:** retry queues, structured logging beyond `console.error`, alerting, rate limiting.

## Testing

**Unit tests (Vitest, real Postgres via testcontainers — no DB mocks):**

- `payouts.test.ts` — standard parimutuel, dust assignment, no-winners-vaporize, one-sided pool, single winner.
- `allowance.test.ts` — balance vs spendable allowance queries; weekly reset idempotency; only allowance kinds evaporate.
- `validation.test.ts` — every `DomainError` code fires on its trigger.

**Integration tests (Vitest + Drizzle against test DB):**

- `bet.integration.test.ts` — concurrent bets cannot overdraft; bets at lockup_at−1ms succeed, +1ms fails.
- `resolve.integration.test.ts` — create → bet × N → resolve → balances match expected payouts to the doughnut.
- `weekly-reset.integration.test.ts` — running the cron twice in a week is a no-op; staked doughnuts survive; unspent allowance evaporates; user who signed up mid-week receives their Monday grant on the next cron run; holdings from previous weeks are not touched.

**E2E (Playwright):** one golden-path spec — join via invite → create market → second user bets → first user resolves → both UIs show correct balances.

**Out of scope for v1 tests:** visual regression, real email delivery (we assert Resend was called with correct args), notification body rendering.

## Project structure

```
shadow-kpi/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/                # signup, magic-link callback
│   │   ├── (app)/                 # authenticated app
│   │   │   ├── t/[teamId]/        # team-scoped pages
│   │   │   │   ├── markets/[id]/
│   │   │   │   ├── leaderboard/
│   │   │   │   └── me/            # profile, bet history
│   │   │   └── layout.tsx
│   │   ├── join/[code]/           # invite-link landing
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       └── cron/
│   │           ├── weekly-reset/
│   │           └── lockup-sweep/
│   ├── server/                    # service layer — no Next imports here
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   ├── client.ts
│   │   │   └── migrations/
│   │   ├── markets.ts
│   │   ├── bets.ts
│   │   ├── ledger.ts
│   │   ├── payouts.ts             # pure functions
│   │   ├── teams.ts
│   │   ├── notifications.ts
│   │   ├── events.ts
│   │   └── errors.ts
│   ├── components/                # shadcn/ui + app components
│   └── lib/                       # client-side utils, formatters
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── drizzle.config.ts
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-05-12-shadow-kpi-design.md
└── package.json
```

**Boundary rule:** `src/server/**` does not import from `next/*`. Service functions are plain TypeScript callable directly by integration tests.

**Multi-team UX:** A user may belong to multiple teams. On login the user lands on `/teams`, a picker that lists every team they're a member of with their current balance. Choosing one navigates to `/t/[teamId]`. The team is always in the URL path inside the authenticated app, so deep links are unambiguous.

## v1 feature list (locked)

- Create team via invite code; join via code; rotate code (admin).
- Email + display name signup; magic-link login.
- Create binary market with `lockup_at` and `resolves_at`.
- Place bet (integer ≥ 1) before lockup; creator cannot bet on own market.
- Pool totals visible during market; per-bet identities revealed at resolution.
- Creator resolves; parimutuel payout with dust-to-largest-winner.
- Creator voids before lockup; full refund.
- Comments on markets.
- Personal doughnut balance + weekly allowance display.
- Weekly allowance reset (Monday 00:00 UTC).
- Leaderboard: total doughnuts held per team.
- Activity feed / "what's new" timeline.
- Search/filter markets (open, closed, mine, by creator).
- Profile page: bet history, win rate.
- In-app notifications with unread bell.
- Mobile-responsive design.

## Deferred to v2

- Webhook delivery for events (Slack/Discord).
- Per-user notification mute settings.
- Multiple-choice and over/under markets.
- Voting / disputed resolutions.
- Realtime updates (WebSockets, SSE, Postgres LISTEN/NOTIFY).
- Rate limiting and abuse controls.
- Structured logging and alerting.

## Open questions for user

1. Keep `membership.role` ('member' | 'admin') for invite-code rotation, or remove it and let any member rotate?
