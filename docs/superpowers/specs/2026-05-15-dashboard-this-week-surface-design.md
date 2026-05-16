# Dashboard "This Week" Surface — Design

**Status:** Draft 2026-05-15
**Scope:** Rework `/t/[teamId]` so a returning user immediately sees what is worth their attention. No new routes. No new external notification channels. No recurring/templated markets (deferred to a follow-on spec).

## Goal

Re-engage users who bet once and never came back by making the team dashboard return-visit-worthy. Today the dashboard shows a flat list of market titles with status pills (`src/app/(app)/t/[teamId]/page.tsx`). After this change, the same route surfaces three new sections — **Locking soon**, **Your open positions**, **Resolved while you were away** — each curated, scannable, and personal where it can be.

Non-goal: get people back via email or Slack. The user explicitly ruled out external notifications for this round. This spec only changes what they see when they *do* visit.

## Design Decisions

| Axis | Choice |
|---|---|
| Surface | Team dashboard only (`/t/[teamId]`). Other routes untouched. |
| Notifications | None added. Pure read-side surface change. |
| Personalization | Sections key off `userId` × `teamId` (your stake, your delta, your last-seen cursor). |
| Schema impact | One nullable column on `membership`; no data backfill required. |
| Caching | Server-rendered every request (already the pattern). No new cache layer. |

## Information Architecture

Top-to-bottom order on `/t/[teamId]`:

1. **Header + balance/allowance cards** — unchanged.
2. **Markets card header** — gains a collapsed `▾ Invite link` disclosure. The invite-link card is removed from its current top-level slot; rotate-code action moves inside the disclosure.
3. **Locking soon** *(new)* — up to 3 open markets, `lockupAt` ASC, where lock is within the next 7 days. Hidden when zero matches.
4. **Your open positions** *(new)* — markets where you have a stake and status ∈ {open, locked}, sorted by `lockupAt` ASC. Hidden when you have no open stakes.
5. **Resolved while you were away** *(new)* — markets resolved or voided after `lastSeenAt` where you had a stake or are the creator. Hidden when empty. See "lastSeenAt mechanic" below.
6. **All markets** *(existing)* — tabbed list (open/closed/all), behavior unchanged but visually de-emphasized (smaller heading, denser rows) so the curated sections lead the eye.

### Per-row content

| Section | Row content |
|---|---|
| Locking soon | title · `<LockCountdown>` · pool size · `<OddsBar yes no>` · your-stake badge if any |
| Your open positions | title · your stake + side · `<LockCountdown>` · pool size |
| Resolved while you were away | title · outcome chip (YES / NO / VOIDED) · your delta (+winnings / −stake / refund) |
| All markets | unchanged from today |

### Empty states

- **Locking soon** hidden when there are zero qualifying markets.
- **Your open positions** hidden when the user has no open stakes (avoids a "you have nothing" shame state on first visit).
- **Resolved while you were away** hidden when empty (the normal case once `lastSeenAt` is current).

The dashboard never shows three empty "nothing here yet" cards stacked — sections that would be empty are simply omitted.

## Data Layer

New module: `src/server/dashboard.ts`. Read-side composites belong here, not in `markets.ts` (which is CRUD).

```ts
export interface LockingSoonRow {
  market: Market;
  pools: { yes: number; no: number };
  yourStake: { side: 'yes' | 'no'; amount: number } | null;
}

export interface OpenPositionRow {
  market: Market;
  pools: { yes: number; no: number };
  yourStake: { side: 'yes' | 'no'; amount: number };
}

export interface ResolvedAwayRow {
  market: Market;
  yourDelta: number; // sum of ledger entries for this market+user; see Sign conventions below
}

export function listLockingSoon(
  db: Db,
  args: { teamId: string; userId: string; withinHours?: number; limit?: number },
): Promise<LockingSoonRow[]>;

export function listOpenPositions(
  db: Db,
  args: { teamId: string; userId: string },
): Promise<OpenPositionRow[]>;

export function listResolvedSince(
  db: Db,
  args: { teamId: string; userId: string; since: Date },
): Promise<ResolvedAwayRow[]>;
```

Defaults: `withinHours = 168` (7 days), `limit = 3`.

**Pool aggregation** reuses the reduce-over-bets pattern from `getMarketDetail` (`src/server/markets.ts:109`). Extract it into an exported `aggregatePools(bets: Bet[])` in `src/server/markets.ts` and call from both `getMarketDetail` and the new dashboard queries.

**Your delta** is derived from ledger entries scoped to the resolved market — payouts already write ledger entries on resolution (`src/server/payouts.ts`, `src/server/weekly-reset.ts`). The query sums `ledger_entry.amount` for `userId` filtered by the market's ID. `amount` is already signed in the existing ledger (negative for stake, positive for payout/refund — see `src/server/bets.ts:102`). Net interpretation:

- **Won:** sum > 0 (winnings minus original stake).
- **Lost:** sum < 0 (negative of original stake).
- **Voided:** sum == 0 (stake out + refund in cancel). UI keys off `market.status === 'voided'` to render the "refund" chip instead of the literal 0.

No new ledger semantics — this is read-only over existing entries.

## Schema Change

Add to `membership`:

```ts
lastSeenAt: timestamp('last_seen_at'), // nullable
```

NULL means "first visit." Drizzle migration adds the column with no default; down migration drops it. No backfill needed.

## `lastSeenAt` Mechanic

The cursor that drives "Resolved while you were away."

**Read path.** Dashboard server component reads current `lastSeenAt` from the user's membership row. If NULL, treat as `now() - 7 days` for the resolved-away query (cap on a noisy first visit; otherwise a long-dormant user would see a wall of old resolutions).

**Write path.** After computing the section, conditionally update `lastSeenAt = now()` if and only if the previous value is NULL or older than **30 minutes**. The threshold:

- Refreshing within a session (< 30 min) keeps the "while you were away" items visible — no surprise disappearance.
- Coming back the next day advances the cursor — yesterday's resolutions stop appearing.
- A 30+ minute break is treated as a session boundary; if you came back from coffee, you probably already saw the section.

Predicate is pure and unit-testable:

```ts
export function shouldAdvanceLastSeen(prev: Date | null, now: Date, staleMs = 30 * 60_000): boolean {
  return prev === null || now.getTime() - prev.getTime() > staleMs;
}
```

The update happens in the same server component as the read — one extra `UPDATE` per cold session, none on warm refresh.

## UI Components

New under `src/components/dashboard/`:

- `<DashboardSection title actions>` — consistent section heading + optional right-side actions. Children render the rows.
- `<LockCountdown lockupAt={Date} />` — initial value rendered on the server using a `formatDistance` helper added to `src/server/time.ts`; client `useEffect` re-ticks every 30 s. Transitions to a `LOCKED` status pill once `lockupAt < now`.
- `<MarketRow variant="lockingSoon" | "position" | "resolved" market ... />` — variant-driven row, slots in countdown / stake badge / delta chip, reuses existing `<OddsBar>` and `<StatusPill>`.

Co-locating these under `src/components/dashboard/` keeps the surface easy to evolve or rip out as one unit. None of these are reused outside the dashboard in this spec; if they prove useful elsewhere they can move later.

## Testing

| Layer | Coverage |
|---|---|
| Unit (`tests/unit/`) | `shouldAdvanceLastSeen` predicate edge cases (NULL, fresh, exactly-30, stale). Countdown formatting at sub-minute, minutes, hours, days, and post-lock boundaries. |
| Integration (`tests/integration/dashboard.integration.test.ts`) | testcontainers Postgres. Scenarios: empty team → all curated sections hidden; team with mixed market states → correct rows in each section; user with no bets → Your positions hidden; resolved markets before `lastSeenAt` excluded; `lastSeenAt` advances only when stale. |
| E2E | Extend `tests/e2e/full-game-loop.spec.ts` to assert new sections appear and disappear at the expected steps in the game loop. No new spec file. |
| Visuals | Re-run `npm run screenshots` to refresh `docs/img/dashboard.png` and any other affected images. |

Mocks: none. The integration test hits real Postgres via testcontainers, matching the rest of the suite. No production code is mocked in tests today and that pattern continues here.

## Migration Safety

- Adding nullable `last_seen_at` is forward-only safe — no locks on `membership` beyond the standard `ALTER TABLE ADD COLUMN`.
- Old code reading `Membership` rows after migration simply ignores the new field.
- New code reading `lastSeenAt === null` falls through to the "treat as 7 days ago" path, so existing memberships work without a backfill.
- Down migration drops the column; data loss is bounded to the cursor (recoverable on next visit).

## Performance

Dashboard render goes from 1 markets query to ~4 queries (markets list, locking soon, open positions, resolved-away) + 1 conditional `UPDATE`. All scoped by `teamId` and indexed on existing foreign keys. For a workplace team (tens of users, dozens of open markets), this is sub-10ms in Postgres. Revisit only if a team hits hundreds of concurrent open markets — at which point the markets list itself would also need pagination.

## Out of Scope

- Recurring / templated markets (deferred spec).
- Email or Slack notifications.
- Web push.
- "Mark as seen" buttons on individual rows.
- Real session boundaries via auth (the 30-minute heuristic stands in for now).
- Search or advanced filtering on the All markets list.
- Mobile-specific layouts beyond what the existing responsive grid already provides.

## Success Criteria

- Returning user lands on `/t/[teamId]` and the first thing visible below balance/allowance is curated content, not a flat title list.
- "Resolved while you were away" surfaces real results from the user's last absence and does not vanish on refresh.
- Locking soon and Your positions both reflect live data (lock countdown, pool size, stake) without a client-side data fetch.
- All existing tests pass; new integration spec passes; e2e suite green.
- README dashboard screenshot regenerated.
