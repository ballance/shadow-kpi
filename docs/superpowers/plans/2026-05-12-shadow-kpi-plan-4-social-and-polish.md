# shadow-kpi Plan 4 — Social & Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish v1. Wire the existing domain events to in-app notifications (with a bell in the nav), add comments to market pages, add an activity feed and a profile page, expose a status filter on the team dashboard, and finish with a consolidated Playwright spec plus a mobile-responsive sweep.

**Architecture:** Two new tables (`notification`, `comment`) extend the existing schema. The in-app notification subscriber is registered against the existing `eventBus` singleton in `src/server/events.ts` — when a domain event fires, the subscriber writes one notification row per recipient (recipients are computed from team membership and market participation). Read-side helpers (`listNotifications`, `markAllRead`, `getUnreadCount`) live in a new `notifications.ts`. Comments get their own service with `addComment` (transactional, emits `CommentPosted`) and `listForMarket`. The activity feed is a server function that merges recent markets and comments in memory; profile + dashboard tabs are pure UI changes against existing service functions.

**Tech Stack:** No new dependencies. Same as Plans 1–3.

**Reference:** Design spec at `docs/superpowers/specs/2026-05-12-shadow-kpi-design.md`. Plans 1–3 are shipped. Plan 4 is the last v1 slice.

---

## File Structure

```
shadow-kpi/
├── src/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── layout.tsx                            # MODIFY: add bell
│   │   │   └── t/[teamId]/
│   │   │       ├── page.tsx                          # MODIFY: status tabs + activity link
│   │   │       ├── activity/page.tsx                 # CREATE
│   │   │       ├── me/page.tsx                       # CREATE
│   │   │       └── markets/[marketId]/page.tsx       # MODIFY: comments thread
│   │   └── api/notifications/
│   │       └── mark-read/route.ts                    # CREATE (POST: mark all read)
│   ├── components/
│   │   └── notification-bell.tsx                     # CREATE (client)
│   └── server/
│       ├── activity.ts                               # CREATE
│       ├── comments.ts                               # CREATE
│       ├── db/schema.ts                              # MODIFY: notification + comment tables
│       ├── db/migrations/                            # generated
│       ├── events.ts                                 # MODIFY: register in-app subscriber
│       ├── notifications.ts                          # CREATE (read-side helpers + subscriber impl)
│       ├── profile.ts                                # CREATE
│       └── markets.ts                                # already emits MarketCreated/Locked/Resolved/Voided
├── tests/
│   ├── helpers/db.ts                                 # MODIFY: extend truncate list
│   ├── unit/
│   │   └── activity.test.ts                          # CREATE (pure-fn merge)
│   ├── integration/
│   │   ├── notifications.integration.test.ts        # CREATE
│   │   ├── comments.integration.test.ts             # CREATE
│   │   ├── profile.integration.test.ts              # CREATE
│   │   └── (existing files updated for new truncate list — no test changes)
│   └── e2e/
│       └── social-and-leaderboard.spec.ts            # CREATE (consolidated final)
└── docs/superpowers/plans/2026-05-12-shadow-kpi-plan-4-social-and-polish.md
```

**Decomposition rationale.** Notifications are split into write-side (the event subscriber, registered against `eventBus` in `events.ts`) and read-side (queries + an action route for "mark all read", in `notifications.ts` and an API route). This keeps the subscriber a pure function of `(event, db) → rows` and the read-side queries reusable from server components. Comments and profile get their own service files because they own bounded responsibilities. The activity feed gets a single pure function (mergeAndSort) in `activity.ts` plus a small page; the SQL is two separate queries unioned in memory, which is fine at team-sized scale.

---

## Conventions used throughout

- **Commits:** Conventional, with a haiku body. No Claude/AI attribution.
- **TS strict.** No `any`. Use `unknown` and narrow.
- **No comments** unless the *why* is non-obvious.
- **Run** all commands from `/Users/ballance/home/code/shadow-kpi`.
- **Use Node 22** (`source ~/.nvm/nvm.sh && nvm use`).
- **Do not touch `.env.local`** — it has real secrets and is gitignored.

---

### Task 1: Schema additions for `notification` and `comment` + migration

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `tests/helpers/db.ts`
- Create: `src/server/db/migrations/0002_*.sql` (generated)

- [ ] **Step 1: Add the two new tables**

Open `src/server/db/schema.ts`. After the existing `bets` table definition (and before `ledgerEntries`), insert:

```ts
// NEW in Plan 4: notifications
export const notifications = pgTable(
  'notification',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: text('payload'),
    marketId: text('market_id').references(() => markets.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    readAt: timestamp('read_at'),
  },
  (n) => ({
    byUserRead: index('notification_user_read_idx').on(n.userId, n.readAt),
  }),
);

// NEW in Plan 4: comments
export const comments = pgTable(
  'comment',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (c) => ({
    byMarketCreated: index('comment_market_created_idx').on(c.marketId, c.createdAt),
  }),
);
```

Then, at the bottom of the file (after the existing type exports), append:

```ts
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
```

- [ ] **Step 2: Extend the test-helper truncate list**

Open `tests/helpers/db.ts`. Replace the `tables` array with:

```ts
const tables = [
  'ledger_entry',
  'bet',
  'notification',
  'comment',
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

```bash
docker compose -f docker-compose.dev.yml up -d postgres
source ~/.nvm/nvm.sh && nvm use && npm run db:generate
```

Expected: `src/server/db/migrations/0002_<slug>.sql` is created with `CREATE TABLE "notification"` and `CREATE TABLE "comment"` statements.

- [ ] **Step 4: Apply to dev DB**

```bash
npm run db:migrate
```

Expected: `Migrations applied.`

Verify:

```bash
docker exec shadowkpi-postgres psql -U shadowkpi -d shadowkpi -c "\dt"
```

Expected: now lists `notification` and `comment` alongside the existing tables.

- [ ] **Step 5: Apply to e2e DB**

```bash
DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e npm run db:migrate
```

Expected: `Migrations applied.`

- [ ] **Step 6: Typecheck + existing tests still pass**

```bash
npm run typecheck && npm test
```

Expected: typecheck exit 0, all existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/server/db tests/helpers/db.ts
git commit -m "$(cat <<'EOF'
feat: add notification and comment tables

Notification has user, kind, payload (jsonb-ish text), optional
market link, created/read timestamps. Comment has market, user,
body, created. Both indexed for the queries that will follow.

Two boards on the wall —
pings stack up on one for you,
chat lives on the next.
EOF
)"
```

---

### Task 2: In-app notification subscriber wired to events (TDD)

**Files:**
- Create: `src/server/notifications.ts`
- Modify: `src/server/events.ts` (register the subscriber)
- Create: `tests/integration/notifications.integration.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/notifications.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { createEventBus } from '@/server/events';
import { inAppNotificationSubscriber } from '@/server/notifications';
import {
  users,
  teams,
  memberships,
  markets,
  bets,
  notifications,
} from '@/server/db/schema';

describe('inAppNotificationSubscriber', () => {
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
      { id: 'creator', email: 'c@example.com' },
      { id: 'a', email: 'a@example.com' },
      { id: 'b', email: 'b@example.com' },
      { id: 'outsider', email: 'o@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'creator', teamId: 't1' },
      { userId: 'a', teamId: 't1' },
      { userId: 'b', teamId: 't1' },
    ]);
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
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'a', side: 'yes', amount: 5 },
      { id: 'b2', marketId: 'm1', userId: 'b', side: 'no', amount: 5 },
    ]);
  });

  it('MarketCreated → notifies all team members except creator', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({
      type: 'MarketCreated',
      marketId: 'm1',
      teamId: 't1',
      creatorId: 'creator',
    });

    const notifs = await handle.db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    const userIds = notifs.map((n) => n.userId).sort();
    expect(userIds).toEqual(['a', 'b']);
    for (const n of notifs) {
      expect(n.kind).toBe('market_created');
      expect(n.marketId).toBe('m1');
    }
  });

  it('MarketLocked → notifies bettors only', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({ type: 'MarketLocked', marketId: 'm1', teamId: 't1' });

    const notifs = await handle.db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    const userIds = notifs.map((n) => n.userId).sort();
    expect(userIds).toEqual(['a', 'b']);
    for (const n of notifs) expect(n.kind).toBe('market_locked');
  });

  it('MarketResolved → notifies bettors only with outcome in payload', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({
      type: 'MarketResolved',
      marketId: 'm1',
      teamId: 't1',
      outcome: 'yes',
    });

    const notifs = await handle.db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    for (const n of notifs) {
      expect(n.kind).toBe('market_resolved');
      expect(n.payload).toBe(JSON.stringify({ outcome: 'yes' }));
    }
  });

  it('MarketVoided → notifies bettors only', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({ type: 'MarketVoided', marketId: 'm1', teamId: 't1' });

    const notifs = await handle.db.select().from(notifications);
    expect(notifs).toHaveLength(2);
    for (const n of notifs) expect(n.kind).toBe('market_voided');
  });

  it('CommentPosted → notifies bettors + creator, excluding commenter', async () => {
    const bus = createEventBus();
    bus.subscribe((e) => inAppNotificationSubscriber(handle.db, e));
    await bus.emit({
      type: 'CommentPosted',
      marketId: 'm1',
      teamId: 't1',
      commenterId: 'a',
    });

    const notifs = await handle.db.select().from(notifications);
    // creator + b (since a is the commenter)
    expect(notifs).toHaveLength(2);
    const userIds = notifs.map((n) => n.userId).sort();
    expect(userIds).toEqual(['b', 'creator']);
    for (const n of notifs) expect(n.kind).toBe('comment_posted');
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/notifications.integration.test.ts
```

Expected: FAIL — module `@/server/notifications` not found.

- [ ] **Step 3: Implement `src/server/notifications.ts`**

Create the file with this content:

```ts
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { bets, memberships, notifications, type Notification } from '@/server/db/schema';
import { markets } from '@/server/db/schema';
import type { DomainEvent } from '@/server/events';

export async function inAppNotificationSubscriber(
  db: Db,
  event: DomainEvent,
): Promise<void> {
  switch (event.type) {
    case 'MarketCreated': {
      const recipients = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(eq(memberships.teamId, event.teamId));
      const targets = recipients.filter((r) => r.userId !== event.creatorId);
      if (targets.length === 0) return;
      await db.insert(notifications).values(
        targets.map((r) => ({
          userId: r.userId,
          kind: 'market_created',
          marketId: event.marketId,
          payload: null as string | null,
        })),
      );
      return;
    }
    case 'MarketLocked':
    case 'MarketVoided': {
      const bettors = await db
        .select({ userId: bets.userId })
        .from(bets)
        .where(eq(bets.marketId, event.marketId));
      const uniq = Array.from(new Set(bettors.map((b) => b.userId)));
      if (uniq.length === 0) return;
      const kind = event.type === 'MarketLocked' ? 'market_locked' : 'market_voided';
      await db.insert(notifications).values(
        uniq.map((userId) => ({
          userId,
          kind,
          marketId: event.marketId,
          payload: null as string | null,
        })),
      );
      return;
    }
    case 'MarketResolved': {
      const bettors = await db
        .select({ userId: bets.userId })
        .from(bets)
        .where(eq(bets.marketId, event.marketId));
      const uniq = Array.from(new Set(bettors.map((b) => b.userId)));
      if (uniq.length === 0) return;
      await db.insert(notifications).values(
        uniq.map((userId) => ({
          userId,
          kind: 'market_resolved',
          marketId: event.marketId,
          payload: JSON.stringify({ outcome: event.outcome }),
        })),
      );
      return;
    }
    case 'CommentPosted': {
      const [marketRow] = await db
        .select({ creatorId: markets.creatorId })
        .from(markets)
        .where(eq(markets.id, event.marketId))
        .limit(1);
      const bettors = await db
        .select({ userId: bets.userId })
        .from(bets)
        .where(eq(bets.marketId, event.marketId));
      const recipientSet = new Set<string>();
      if (marketRow?.creatorId) recipientSet.add(marketRow.creatorId);
      for (const b of bettors) recipientSet.add(b.userId);
      recipientSet.delete(event.commenterId);
      const recipients = Array.from(recipientSet);
      if (recipients.length === 0) return;
      await db.insert(notifications).values(
        recipients.map((userId) => ({
          userId,
          kind: 'comment_posted',
          marketId: event.marketId,
          payload: JSON.stringify({ commenterId: event.commenterId }),
        })),
      );
      return;
    }
  }
}

export interface NotificationRow extends Notification {
  marketTeamId: string | null;
}

export async function listNotifications(
  db: Db,
  userId: string,
  limit = 20,
): Promise<NotificationRow[]> {
  const rows = await db
    .select({
      n: notifications,
      marketTeamId: markets.teamId,
    })
    .from(notifications)
    .leftJoin(markets, eq(markets.id, notifications.marketId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.n, marketTeamId: r.marketTeamId ?? null }));
}

export async function getUnreadCount(db: Db, userId: string): Promise<number> {
  const result = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return result[0]?.n ?? 0;
}

export async function markAllRead(db: Db, userId: string): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return result.length;
}
```

- [ ] **Step 4: Register the subscriber in `src/server/events.ts`**

Open `src/server/events.ts`. At the very bottom (after the `eventBus` singleton export), add:

```ts
import { inAppNotificationSubscriber } from '@/server/notifications';
import { db as productionDb } from '@/server/db/client';

eventBus.subscribe((event) => inAppNotificationSubscriber(productionDb, event));
```

**Note on circular imports:** `notifications.ts` imports the `DomainEvent` type from `events.ts`, and `events.ts` imports `inAppNotificationSubscriber` from `notifications.ts`. This is a value-cycle that TS allows as long as the import order is right. If you hit a "Cannot read properties of undefined" runtime error at startup, the workaround is to move the registration to a top-of-file `subscribe` call inside a setTimeout(0) or `queueMicrotask` so the cycle resolves before the subscriber is invoked. Try the simple version first.

- [ ] **Step 5: Run, watch pass**

```bash
npm test -- tests/integration/notifications.integration.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: every prior test still passes — none of the existing services emit events that produce notifications EXCEPT in test files that create their own `EventBus`. The production singleton is now wired, which means tests that use the production `eventBus` (via real service calls) may now write notification rows. Check for any test that asserts ledger row counts include "all rows in the DB" without filtering — if such a test exists, it may need to filter by `kind`. If a test breaks, fix the assertion to be specific (`filter((e) => e.kind === 'stake')` etc.).

- [ ] **Step 7: Commit**

```bash
git add src/server/notifications.ts src/server/events.ts tests/integration/notifications.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: wire in-app notification subscriber to event bus

inAppNotificationSubscriber writes notification rows per
recipient based on event fanout rules from the spec. Registered
once against the eventBus singleton in events.ts. Read-side
helpers (listNotifications, getUnreadCount, markAllRead) export
from the same module.

Events fan out at once —
bettors hear it, creator too,
commenter sits out.
EOF
)"
```

---

### Task 3: Comments service (TDD)

**Files:**
- Create: `src/server/comments.ts`
- Create: `tests/integration/comments.integration.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/comments.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { addComment, listCommentsForMarket } from '@/server/comments';
import {
  users,
  teams,
  memberships,
  markets,
  comments,
  notifications,
} from '@/server/db/schema';

describe('comments service', () => {
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
      { id: 'creator', email: 'c@example.com' },
      { id: 'a', email: 'a@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'creator', teamId: 't1' },
      { userId: 'a', teamId: 't1' },
    ]);
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

  describe('addComment', () => {
    it('inserts a comment and returns the row', async () => {
      const c = await addComment(handle.db, {
        marketId: 'm1',
        userId: 'a',
        body: 'first',
      });
      expect(c.body).toBe('first');
      const rows = await handle.db.select().from(comments);
      expect(rows).toHaveLength(1);
    });

    it('rejects empty body', async () => {
      await expect(
        addComment(handle.db, { marketId: 'm1', userId: 'a', body: '  ' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('rejects body over 2000 chars', async () => {
      const big = 'x'.repeat(2001);
      await expect(
        addComment(handle.db, { marketId: 'm1', userId: 'a', body: big }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('rejects when user is not a team member', async () => {
      await handle.db.insert(users).values({ id: 'outsider', email: 'o@example.com' });
      await expect(
        addComment(handle.db, { marketId: 'm1', userId: 'outsider', body: 'hi' }),
      ).rejects.toMatchObject({ code: 'NOT_TEAM_MEMBER' });
    });

    it('emits CommentPosted (subscriber writes notification for creator)', async () => {
      await addComment(handle.db, { marketId: 'm1', userId: 'a', body: 'hi' });
      const notifs = await handle.db.select().from(notifications);
      expect(notifs).toHaveLength(1);
      expect(notifs[0]).toMatchObject({ userId: 'creator', kind: 'comment_posted' });
    });
  });

  describe('listCommentsForMarket', () => {
    it('returns comments ordered by createdAt asc (oldest first)', async () => {
      await handle.db.insert(comments).values([
        {
          id: 'c1',
          marketId: 'm1',
          userId: 'a',
          body: 'first',
          createdAt: new Date('2026-05-12T10:00:00Z'),
        },
        {
          id: 'c2',
          marketId: 'm1',
          userId: 'creator',
          body: 'second',
          createdAt: new Date('2026-05-12T11:00:00Z'),
        },
      ]);
      const rows = await listCommentsForMarket(handle.db, 'm1');
      expect(rows.map((r) => r.id)).toEqual(['c1', 'c2']);
    });
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/comments.integration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/comments.ts`**

Create the file with this content:

```ts
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { comments, memberships, markets, type Comment } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { eventBus } from '@/server/events';

export interface AddCommentInput {
  marketId: string;
  userId: string;
  body: string;
}

export async function addComment(db: Db, input: AddCommentInput): Promise<Comment> {
  const body = input.body.trim();
  if (body.length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'Comment body cannot be empty.');
  }
  if (body.length > 2000) {
    throw new DomainError('VALIDATION_FAILED', 'Comment is too long (max 2000 chars).');
  }

  const [market] = await db
    .select({ teamId: markets.teamId })
    .from(markets)
    .where(eq(markets.id, input.marketId))
    .limit(1);
  if (!market) {
    throw new DomainError('MARKET_NOT_FOUND', 'Market not found.');
  }

  const membership = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, input.userId), eq(memberships.teamId, market.teamId)),
    )
    .limit(1);
  if (membership.length === 0) {
    throw new DomainError('NOT_TEAM_MEMBER', 'You are not a member of this team.');
  }

  const [created] = await db
    .insert(comments)
    .values({
      marketId: input.marketId,
      userId: input.userId,
      body,
    })
    .returning();

  await eventBus.emit({
    type: 'CommentPosted',
    marketId: input.marketId,
    teamId: market.teamId,
    commenterId: input.userId,
  });

  return created;
}

export async function listCommentsForMarket(
  db: Db,
  marketId: string,
): Promise<Comment[]> {
  return await db
    .select()
    .from(comments)
    .where(eq(comments.marketId, marketId))
    .orderBy(asc(comments.createdAt));
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/comments.integration.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/comments.ts tests/integration/comments.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add comments service

addComment validates body, asserts membership, inserts the
comment, and emits CommentPosted. listCommentsForMarket returns
oldest-first for stable thread reading.

Body trimmed and checked —
member writes, event fires out,
thread grows by one row.
EOF
)"
```

---

### Task 4: Notification bell in top nav

**Files:**
- Create: `src/components/notification-bell.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/app/api/notifications/mark-read/route.ts`

- [ ] **Step 1: Create the API route for marking read**

Create `src/app/api/notifications/mark-read/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { markAllRead } from '@/server/notifications';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'NOT_AUTHENTICATED', message: 'Sign in required.' } },
      { status: 401 },
    );
  }
  const updated = await markAllRead(db, session.user.id);
  return NextResponse.json({ updated });
}
```

- [ ] **Step 2: Build the bell client component**

Create `src/components/notification-bell.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

interface NotificationItem {
  id: string;
  kind: string;
  marketId: string | null;
  marketTeamId: string | null;
  createdAt: string;
  readAt: string | null;
}

interface NotificationBellProps {
  unreadCount: number;
  notifications: NotificationItem[];
}

function describe(kind: string): string {
  switch (kind) {
    case 'market_created':
      return 'New market';
    case 'market_locked':
      return 'Market locked';
    case 'market_resolved':
      return 'Market resolved';
    case 'market_voided':
      return 'Market voided';
    case 'comment_posted':
      return 'New comment';
    default:
      return kind;
  }
}

export function NotificationBell({
  unreadCount,
  notifications,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const pathTeamId = pathname.match(/^\/t\/([^/]+)/)?.[1] ?? null;

  async function handleOpen() {
    setOpen(!open);
    if (!open && unreadCount > 0) {
      startTransition(async () => {
        await fetch('/api/notifications/mark-read', { method: 'POST' });
        router.refresh();
      });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="relative inline-flex items-center px-2 py-1 text-sm hover:underline"
        aria-label={`${unreadCount} unread notifications`}
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border bg-white p-2 shadow-lg dark:bg-slate-950">
          {notifications.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {notifications.map((n) => {
                const linkTeamId = n.marketTeamId ?? pathTeamId;
                const href =
                  n.marketId && linkTeamId
                    ? `/t/${linkTeamId}/markets/${n.marketId}`
                    : linkTeamId
                      ? `/t/${linkTeamId}`
                      : '/teams';
                return (
                  <li key={n.id}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`block rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        n.readAt ? 'text-slate-500' : ''
                      }`}
                    >
                      {describe(n.kind)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Modify `src/app/(app)/layout.tsx`**

Replace the entire contents of `src/app/(app)/layout.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth, signOut } from '@/server/auth';
import { db } from '@/server/db/client';
import { listNotifications, getUnreadCount } from '@/server/notifications';
import { NotificationBell } from '@/components/notification-bell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/signin');

  const [unreadCount, recent] = await Promise.all([
    getUnreadCount(db, session.user.id),
    listNotifications(db, session.user.id, 20),
  ]);

  const items = recent.map((n) => ({
    id: n.id,
    kind: n.kind,
    marketId: n.marketId,
    marketTeamId: n.marketTeamId,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  }));

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <Link href="/teams" className="font-semibold">
            shadow-kpi
          </Link>
          <div className="flex items-center gap-4">
            <NotificationBell unreadCount={unreadCount} notifications={items} />
            <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}>
              <button type="submit" className="text-sm text-muted-foreground hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
    </div>
  );
}
```

The layout no longer needs the `headers()` workaround: each notification carries its own `marketTeamId` (joined from the markets table by `listNotifications`), and the bell uses `usePathname()` for the no-market-id fallback case.

- [ ] **Step 4: Build verification**

```bash
npm run build
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/notification-bell.tsx "src/app/(app)/layout.tsx" src/app/api/notifications
git commit -m "$(cat <<'EOF'
feat: add notification bell to authenticated nav

Server component fetches unread count + last 20 for the
session user and passes to a client bell component. Opening
the dropdown POSTs /api/notifications/mark-read to clear the
badge.

Bell sits in the bar —
one click reads the standing pings,
links open the rest.
EOF
)"
```

---

### Task 5: Comments UI on the market detail page

**Files:**
- Modify: `src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx`

- [ ] **Step 1: Update the market detail page**

Open `src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx`.

**Update imports.** Find the existing imports and add these new ones (consolidate; do not duplicate):

```ts
import { addComment, listCommentsForMarket } from '@/server/comments';
```

**Fetch comments + email map.** Inside the page component, after `const detail = await getMarketDetail(...)`, fetch the comment list and a map of user emails for comment authors:

```ts
  const commentRows = await listCommentsForMarket(db, marketId);
  const commenterIds = Array.from(new Set(commentRows.map((c) => c.userId)));
  let commenterEmails = new Map<string, string>();
  if (commenterIds.length > 0) {
    const ucache = await db.select().from(users);
    for (const u of ucache) {
      if (commenterIds.includes(u.id)) commenterEmails.set(u.id, u.email);
    }
  }
```

**Add `commentAction`.** Right after the existing `voidAction` server action (or `resolveAction` if `voidAction` isn't present yet — it should be after Task P3.5), add:

```ts
  async function commentAction(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    const body = String(formData.get('body') ?? '').trim();
    if (body.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Comment cannot be empty.');
    }
    await addComment(db, { marketId, userId: session.user.id, body });
    revalidatePath(`/t/${teamId}/markets/${marketId}`);
  }
```

**Add comments Card to the JSX.** Place it AFTER the existing `Bets (n)` card (at the end of the return block):

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Comments ({commentRows.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {commentRows.length === 0 ? (
            <p className="text-muted-foreground">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {commentRows.map((c) => (
                <li key={c.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{nameFromEmail(commenterEmails.get(c.userId) ?? '???')}</span>
                    <span>{fmtTime(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <form action={commentAction} className="flex flex-col gap-2">
            <Input
              name="body"
              placeholder="Say something"
              required
              maxLength={2000}
            />
            <Button type="submit" variant="outline" className="self-start">
              Post
            </Button>
          </form>
        </CardContent>
      </Card>
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
feat: add comments thread on market detail page

Card lists comments oldest-first with author name + timestamp,
and a small form posts new ones via server action. Triggers
CommentPosted -> fanout to creator + bettors via the existing
notification subscriber.

Voices stack in time —
oldest at the top, fresh at base,
bell rings down the hall.
EOF
)"
```

---

### Task 6: Activity feed service + page

**Files:**
- Create: `src/server/activity.ts`
- Create: `tests/unit/activity.test.ts`
- Create: `src/app/(app)/t/[teamId]/activity/page.tsx`

- [ ] **Step 1: Write the failing pure-function test**

Create `tests/unit/activity.test.ts`:

```ts
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
    // descending order so the newest 5 are kept
    expect(merged[0].marketId).toBe('m19');
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/unit/activity.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/activity.ts`**

Create the file:

```ts
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { markets, comments, users } from '@/server/db/schema';

export type ActivityItem =
  | { kind: 'market_created'; at: Date; marketId: string; title: string }
  | {
      kind: 'market_resolved';
      at: Date;
      marketId: string;
      title: string;
      outcome: 'yes' | 'no';
    }
  | {
      kind: 'comment_posted';
      at: Date;
      marketId: string;
      title: string;
      commenterEmail: string;
    };

export function mergeActivityFeed(
  marketItems: ActivityItem[],
  commentItems: ActivityItem[],
  limit: number,
): ActivityItem[] {
  const merged = [...marketItems, ...commentItems];
  merged.sort((a, b) => b.at.getTime() - a.at.getTime());
  return merged.slice(0, limit);
}

export async function getTeamActivityFeed(
  db: Db,
  teamId: string,
  limit = 50,
): Promise<ActivityItem[]> {
  const marketRows = await db
    .select({
      id: markets.id,
      title: markets.title,
      createdAt: markets.createdAt,
      resolvedAt: markets.resolvedAt,
      outcome: markets.outcome,
    })
    .from(markets)
    .where(eq(markets.teamId, teamId))
    .orderBy(desc(markets.createdAt))
    .limit(limit);

  const marketItems: ActivityItem[] = [];
  for (const m of marketRows) {
    marketItems.push({
      kind: 'market_created',
      at: m.createdAt,
      marketId: m.id,
      title: m.title,
    });
    if (m.resolvedAt && m.outcome) {
      marketItems.push({
        kind: 'market_resolved',
        at: m.resolvedAt,
        marketId: m.id,
        title: m.title,
        outcome: m.outcome,
      });
    }
  }

  const commentRows = await db
    .select({
      id: comments.id,
      marketId: comments.marketId,
      title: markets.title,
      createdAt: comments.createdAt,
      commenterEmail: users.email,
    })
    .from(comments)
    .innerJoin(markets, eq(markets.id, comments.marketId))
    .innerJoin(users, eq(users.id, comments.userId))
    .where(eq(markets.teamId, teamId))
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  const commentItems: ActivityItem[] = commentRows.map((c) => ({
    kind: 'comment_posted' as const,
    at: c.createdAt,
    marketId: c.marketId,
    title: c.title,
    commenterEmail: c.commenterEmail,
  }));

  return mergeActivityFeed(marketItems, commentItems, limit);
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/unit/activity.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Build the activity page**

Create `src/app/(app)/t/[teamId]/activity/page.tsx`:

```tsx
import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import { teams } from '@/server/db/schema';
import { getTeamActivityFeed, type ActivityItem } from '@/server/activity';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ActivityPageProps {
  params: Promise<{ teamId: string }>;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function describeItem(item: ActivityItem): string {
  switch (item.kind) {
    case 'market_created':
      return `New market: ${item.title}`;
    case 'market_resolved':
      return `Resolved ${item.outcome.toUpperCase()}: ${item.title}`;
    case 'comment_posted':
      return `${nameFromEmail(item.commenterEmail)} commented on ${item.title}`;
  }
}

export default async function ActivityPage({ params }: ActivityPageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const items = await getTeamActivityFeed(db, teamId, 50);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Activity — {team.name}</h1>
        <Button asChild variant="outline">
          <Link href={`/t/${teamId}`}>Back to team</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="py-6">
          {items.length === 0 ? (
            <p className="text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item, i) => (
                <li
                  key={`${item.kind}-${item.marketId}-${i}`}
                  className="flex items-center justify-between"
                >
                  <Link
                    href={`/t/${teamId}/markets/${item.marketId}`}
                    className="hover:underline"
                  >
                    {describeItem(item)}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {item.at.toISOString().slice(0, 16).replace('T', ' ')} UTC
                  </span>
                </li>
              ))}
            </ul>
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

Expected: success; `/t/[teamId]/activity` shows in route table.

- [ ] **Step 7: Commit**

```bash
git add src/server/activity.ts tests/unit/activity.test.ts "src/app/(app)/t/[teamId]/activity"
git commit -m "$(cat <<'EOF'
feat: add activity feed service and page

Merges market lifecycle events and comments per team into a
single time-sorted list (newest first, 50-max). Page lives at
/t/[teamId]/activity; each row links to the underlying market.

Time stacks every act —
created, resolved, comment posted,
newest item leads.
EOF
)"
```

---

### Task 7: Status filter tabs on the team dashboard

**Files:**
- Modify: `src/app/(app)/t/[teamId]/page.tsx`

- [ ] **Step 1: Update the dashboard**

Open `src/app/(app)/t/[teamId]/page.tsx`. Add a `searchParams` prop to the page:

Find:
```ts
interface TeamPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function TeamDashboardPage({ params }: TeamPageProps) {
  const { teamId } = await params;
```

Replace with:
```ts
interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function TeamDashboardPage({ params, searchParams }: TeamPageProps) {
  const { teamId } = await params;
  const { status } = await searchParams;
  const activeTab: 'open' | 'closed' | 'all' =
    status === 'closed' || status === 'all' ? status : 'open';
```

Update the markets fetch and filtering. Find:
```ts
  const [balance, allowance, marketRows] = await Promise.all([
    getBalance(db, { userId: session.user.id, teamId }),
    getSpendableAllowance(db, { userId: session.user.id, teamId }),
    listMarketsForTeam(db, teamId),
  ]);
```

Keep that unchanged (we filter in JS — simpler than translating the tab to a status param). Then below in the JSX, REPLACE the existing Open/Closed-markets section with:

```tsx
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Markets</CardTitle>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/t/${teamId}/activity`}>Activity</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/t/${teamId}/markets/new`}>New market</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav className="flex gap-2 border-b">
            {(['open', 'closed', 'all'] as const).map((t) => (
              <Link
                key={t}
                href={`/t/${teamId}?status=${t}`}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  activeTab === t
                    ? 'border-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Link>
            ))}
          </nav>
          {(() => {
            const filtered = marketRows.filter((m) => {
              if (activeTab === 'open') return m.status === 'open' || m.status === 'locked';
              if (activeTab === 'closed') return m.status === 'resolved' || m.status === 'voided';
              return true;
            });
            if (filtered.length === 0) {
              return <p className="text-muted-foreground">No markets in this tab.</p>;
            }
            return (
              <ul className="flex flex-col gap-2">
                {filtered.map((m) => (
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
            );
          })()}
        </CardContent>
      </Card>
```

You can now DELETE the separate `{closedMarkets.length > 0 && ...}` block that previously rendered a second card — its content is rolled into the single tabbed Markets card above. The `openMarkets`/`closedMarkets` const definitions can also be removed.

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/t/[teamId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: add status tabs to dashboard markets card

Replaces the open/closed two-card layout with a single Markets
card containing Open/Closed/All tabs and an Activity link. Tab
state lives in ?status= query param so deep-links work.

Three tabs at the top —
URL holds the chosen view,
one card holds them all.
EOF
)"
```

---

### Task 8: Profile page at `/t/[teamId]/me`

**Files:**
- Create: `src/server/profile.ts`
- Create: `tests/integration/profile.integration.test.ts`
- Create: `src/app/(app)/t/[teamId]/me/page.tsx`

- [ ] **Step 1: Write the failing service tests**

Create `tests/integration/profile.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { getProfile } from '@/server/profile';
import {
  users,
  teams,
  memberships,
  markets,
  bets,
} from '@/server/db/schema';

describe('profile.getProfile', () => {
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
      { id: 'me', email: 'me@example.com' },
      { id: 'creator', email: 'c@example.com' },
    ]);
    await handle.db.insert(teams).values({ id: 't1', name: 'T', inviteCode: 'inv1' });
    await handle.db.insert(memberships).values([
      { userId: 'me', teamId: 't1' },
      { userId: 'creator', teamId: 't1' },
    ]);
  });

  async function makeMarket(
    id: string,
    status: 'open' | 'locked' | 'resolved' | 'voided',
    outcome: 'yes' | 'no' | null,
  ) {
    await handle.db.insert(markets).values({
      id,
      teamId: 't1',
      creatorId: 'creator',
      title: `M-${id}`,
      description: null,
      lockupAt: new Date('2026-12-31T00:00:00Z'),
      resolvesAt: new Date('2026-12-31T01:00:00Z'),
      status,
      outcome,
    });
  }

  it('returns empty bet history and 0/0 win rate when no bets', async () => {
    const profile = await getProfile(handle.db, { userId: 'me', teamId: 't1' });
    expect(profile.bets).toEqual([]);
    expect(profile.winCount).toBe(0);
    expect(profile.resolvedCount).toBe(0);
  });

  it('counts wins on resolved markets where bet.side == market.outcome', async () => {
    await makeMarket('m1', 'resolved', 'yes');
    await makeMarket('m2', 'resolved', 'no');
    await makeMarket('m3', 'open', null);
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'me', side: 'yes', amount: 5 },
      { id: 'b2', marketId: 'm2', userId: 'me', side: 'yes', amount: 5 },
      { id: 'b3', marketId: 'm3', userId: 'me', side: 'yes', amount: 5 },
    ]);
    const profile = await getProfile(handle.db, { userId: 'me', teamId: 't1' });
    expect(profile.bets).toHaveLength(3);
    expect(profile.winCount).toBe(1);
    expect(profile.resolvedCount).toBe(2);
  });

  it('ignores bets on voided markets in the win-rate counters', async () => {
    await makeMarket('m1', 'resolved', 'yes');
    await makeMarket('m2', 'voided', null);
    await handle.db.insert(bets).values([
      { id: 'b1', marketId: 'm1', userId: 'me', side: 'yes', amount: 5 },
      { id: 'b2', marketId: 'm2', userId: 'me', side: 'yes', amount: 5 },
    ]);
    const profile = await getProfile(handle.db, { userId: 'me', teamId: 't1' });
    expect(profile.bets).toHaveLength(2);
    expect(profile.winCount).toBe(1);
    expect(profile.resolvedCount).toBe(1);
  });

  it('scopes to team — does not include bets in another team', async () => {
    await handle.db.insert(teams).values({ id: 't2', name: 'Other', inviteCode: 'inv2' });
    await handle.db.insert(memberships).values({ userId: 'me', teamId: 't2' });
    await handle.db.insert(markets).values({
      id: 'm-other',
      teamId: 't2',
      creatorId: 'creator',
      title: 'Other',
      description: null,
      lockupAt: new Date('2026-12-31T00:00:00Z'),
      resolvesAt: new Date('2026-12-31T01:00:00Z'),
      status: 'open',
    });
    await handle.db.insert(bets).values({
      id: 'b-other',
      marketId: 'm-other',
      userId: 'me',
      side: 'yes',
      amount: 1,
    });

    const profile = await getProfile(handle.db, { userId: 'me', teamId: 't1' });
    expect(profile.bets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/profile.integration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/profile.ts`**

Create the file:

```ts
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { bets, markets, type Bet, type Market } from '@/server/db/schema';

export interface BetWithMarket {
  bet: Bet;
  market: Pick<Market, 'id' | 'title' | 'status' | 'outcome'>;
}

export interface ProfileData {
  bets: BetWithMarket[];
  winCount: number;
  resolvedCount: number;
}

export async function getProfile(
  db: Db,
  { userId, teamId }: { userId: string; teamId: string },
): Promise<ProfileData> {
  const rows = await db
    .select({ bet: bets, market: markets })
    .from(bets)
    .innerJoin(markets, eq(markets.id, bets.marketId))
    .where(and(eq(bets.userId, userId), eq(markets.teamId, teamId)))
    .orderBy(desc(bets.placedAt));

  let winCount = 0;
  let resolvedCount = 0;
  for (const r of rows) {
    if (r.market.status === 'resolved' && r.market.outcome) {
      resolvedCount += 1;
      if (r.bet.side === r.market.outcome) winCount += 1;
    }
  }

  return {
    bets: rows.map((r) => ({
      bet: r.bet,
      market: {
        id: r.market.id,
        title: r.market.title,
        status: r.market.status,
        outcome: r.market.outcome,
      },
    })),
    winCount,
    resolvedCount,
  };
}
```

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/profile.integration.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Build the profile page**

Create `src/app/(app)/t/[teamId]/me/page.tsx`:

```tsx
import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { eq } from 'drizzle-orm';
import { teams } from '@/server/db/schema';
import { getProfile } from '@/server/profile';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MePageProps {
  params: Promise<{ teamId: string }>;
}

export default async function MePage({ params }: MePageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const [profile, balance, allowance] = await Promise.all([
    getProfile(db, { userId: session.user.id, teamId }),
    getBalance(db, { userId: session.user.id, teamId }),
    getSpendableAllowance(db, { userId: session.user.id, teamId }),
  ]);

  const winRate =
    profile.resolvedCount === 0
      ? null
      : Math.round((profile.winCount / profile.resolvedCount) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">You on {team.name}</h1>
        <Button asChild variant="outline">
          <Link href={`/t/${teamId}`}>Back to team</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Balance</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">🍩 {balance}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>This week</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">🍩 {allowance}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Win rate</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">
            {winRate === null ? '—' : `${winRate}%`}
            <div className="text-sm text-muted-foreground">
              {profile.winCount} of {profile.resolvedCount} resolved
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bet history ({profile.bets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.bets.length === 0 ? (
            <p className="text-muted-foreground">No bets yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {profile.bets.map(({ bet, market }) => (
                <li key={bet.id} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/t/${teamId}/markets/${market.id}`}
                    className="hover:underline"
                  >
                    {market.title}
                  </Link>
                  <span className="text-muted-foreground">
                    {bet.side.toUpperCase()} · 🍩 {bet.amount}
                    {market.status === 'resolved' && market.outcome && (
                      <>
                        {' '}
                        · {bet.side === market.outcome ? '✓ won' : '✗ lost'}
                      </>
                    )}
                    {market.status === 'voided' && <> · voided</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Link the profile from the team dashboard**

Open `src/app/(app)/t/[teamId]/page.tsx`. Find the existing `<Button asChild variant="outline"><Link href={\`/t/${teamId}/leaderboard\`}>Leaderboard</Link></Button>` line. Replace it with a small group of buttons:

```tsx
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/t/${teamId}/me`}>My profile</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/t/${teamId}/leaderboard`}>Leaderboard</Link>
          </Button>
        </div>
```

- [ ] **Step 7: Build verification**

```bash
npm run build
```

Expected: success.

- [ ] **Step 8: Commit**

```bash
git add src/server/profile.ts tests/integration/profile.integration.test.ts "src/app/(app)/t/[teamId]/me" "src/app/(app)/t/[teamId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: add per-team profile page with bet history + win rate

/t/[teamId]/me shows balance, this-week allowance, and a
win-rate stat computed over resolved markets only. Bet history
table lists every bet with win/lose/voided tagging. Linked
from the team dashboard.

Self in numbers, sorted —
wins and losses count the same,
voided bets don't tilt.
EOF
)"
```

---

### Task 9: Consolidated E2E for the v1 social path

**Files:**
- Create: `tests/e2e/social-and-leaderboard.spec.ts`

- [ ] **Step 1: Build the spec**

Create `tests/e2e/social-and-leaderboard.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';
import postgres from 'postgres';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';

test.beforeEach(async () => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE ledger_entry, bet, notification, comment, membership, market, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('two users exchange comments, see notifications, browse profile + activity', async ({
  browser,
}) => {
  const founderCtx = await browser.newContext();
  const founder = await founderCtx.newPage();
  await signInAs(founder, 'founder@example.com');
  await founder.waitForURL('**/teams');
  await founder.getByRole('link', { name: 'Create team' }).click();
  await founder.getByLabel('Team name').fill('Social Crew');
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

  await founder.goto(teamUrl);
  await founder.getByRole('link', { name: 'New market' }).click();
  await founder.getByLabel('Title').fill('Talk about this');
  const toLocal = (offsetSec: number): string => {
    const d = new Date(Date.now() + offsetSec * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  await founder.getByLabel('Lockup time (bets close)').fill(toLocal(60 * 60));
  await founder.getByLabel('Resolution time (when you call it)').fill(toLocal(2 * 60 * 60));
  await founder.getByRole('button', { name: 'Create market' }).click();
  await founder.waitForURL((url) => /\/markets\//.test(url.pathname) && !url.pathname.endsWith('/new'));
  const marketUrl = founder.url();

  // Joiner sees the "New market" notification (badge >= 1).
  await joiner.goto(teamUrl);
  await expect(joiner.getByLabel(/unread notifications/)).toBeVisible();

  // Joiner posts a comment.
  await joiner.goto(marketUrl);
  await joiner.locator('input[name="body"]').fill('Looks interesting!');
  await joiner.getByRole('button', { name: 'Post' }).click();
  await joiner.waitForLoadState('networkidle');

  // Founder sees the comment notification.
  await founder.goto(teamUrl);
  await expect(founder.getByLabel(/unread notifications/)).toBeVisible();

  // Activity feed shows the create + comment.
  await joiner.goto(teamUrl);
  await joiner.getByRole('link', { name: 'Activity' }).click();
  await joiner.waitForURL(/\/activity$/);
  await expect(joiner.getByText(/New market: Talk about this/)).toBeVisible();
  await expect(joiner.getByText(/commented on Talk about this/)).toBeVisible();

  // Profile page for joiner.
  await joiner.goto(teamUrl);
  await joiner.getByRole('link', { name: 'My profile' }).click();
  await joiner.waitForURL(/\/me$/);
  await expect(joiner.getByRole('heading', { name: /You on Social Crew/ })).toBeVisible();

  await founderCtx.close();
  await joinerCtx.close();
});
```

- [ ] **Step 2: Run the full e2e suite**

```bash
docker compose -f docker-compose.dev.yml up -d postgres-e2e
sleep 3
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
source ~/.nvm/nvm.sh && nvm use && npm run test:e2e
```

Bash timeout 900000 ms. Expected: 4 passing tests (signup-and-join + full-game-loop + void-and-leaderboard + social-and-leaderboard).

If anything fails, capture the Playwright output. Try ONE round of fixes; common candidates:
- The bell's `aria-label` may not exactly match `/unread notifications/`. Use `page.locator('button[aria-label*="unread"]')` if needed.
- `revalidatePath` on the comment server action — make sure `waitForLoadState('networkidle')` happens after the post click.
- The activity link is inside the Markets card header — use `getByRole('link', { name: 'Activity' })` (it's unique enough).

If a second run also fails, report BLOCKED with full output.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/social-and-leaderboard.spec.ts
git commit -m "$(cat <<'EOF'
test: add social Playwright e2e — comments, notifs, activity, profile

Two-user spec exercises the bell badge, comment posting, the
activity feed, and the profile page. With this spec all v1
acceptance criteria have a green Playwright trace.

Four tabs in the suite —
bell rings, thread builds, list scrolls,
"you" page caps the path.
EOF
)"
```

---

### Task 10: Mobile sweep + final pass + README update

**Files:**
- Modify: `README.md`
- Possibly modify: any page with obvious mobile issues found during the sweep

- [ ] **Step 1: Manual mobile sweep**

Start the dev server (or use the running one on 3333):

```bash
source ~/.nvm/nvm.sh && nvm use
# If dev server isn't running:
# npm run dev &
```

In a browser, open `http://localhost:3333` and open dev tools → toggle device toolbar (iPhone SE 375×667 is a good baseline). Click through:

- Landing page (`/`)
- Sign in flow
- Teams picker (`/teams`)
- Team dashboard (`/t/<id>`) — check Markets card tabs do not overflow
- Create market form
- Market detail — pool totals, bet form, comments thread
- Activity feed
- Leaderboard
- Profile

Look for: horizontal scroll (page wider than viewport), unreadable text (< 12px), buttons too close to tap, cards bleeding outside `max-w-4xl`.

If you find an issue: fix it by tightening Tailwind responsive classes (e.g., `sm:grid-cols-2` already handles most cases; add `flex-wrap` or `gap-y-2` if needed). Keep fixes minimal — this is a polish task, not a redesign.

If no issues, proceed. (Most likely: layouts already work because `mx-auto max-w-4xl px-6` collapses cleanly on small screens.)

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Full unit + integration test suite**

```bash
docker compose -f docker-compose.dev.yml up -d postgres
npm test
```

Bash timeout 900000 ms. Expected: all tests pass.

- [ ] **Step 4: Full e2e suite**

```bash
docker compose -f docker-compose.dev.yml up -d postgres-e2e
sleep 3
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
npm run test:e2e
```

Expected: 4 passing.

- [ ] **Step 5: Update `README.md`**

In `## Status`, replace the body with:

```markdown
- **Plan 1 (Foundation + Identity):** Complete. Magic-link signup, teams, invite codes, balance.
- **Plan 2 (First Market End-to-End):** Complete. Create markets, place bets, lockup, resolve with parimutuel payouts.
- **Plan 3 (Economy Completeness):** Complete. Weekly allowance reset, market void/refund, leaderboard.
- **Plan 4 (Social & Polish):** Complete. In-app notifications + bell, comments, activity feed, status tabs, profile, mobile sweep.
- **v1 shipped.** Future v2 work: webhook delivery, per-user notification mute, multi-choice markets, structured logging.
```

In `## Docs`, after the Plan 3 line, add:

```markdown
- Plan 4: `docs/superpowers/plans/2026-05-12-shadow-kpi-plan-4-social-and-polish.md`
```

- [ ] **Step 6: Commit**

If you made any mobile-sweep code edits, include them in this commit. Otherwise just README:

```bash
git add README.md
# If you also modified pages during mobile sweep:
# git add <those files>
git commit -m "$(cat <<'EOF'
docs: update README for Plan 4 completion (v1 shipped)

Adds the social/polish status and notes v1 is complete.
Mobile sweep applied during this task (see commit body for
any inline fixes).

Last slab on the floor —
all four lines come into view,
v one done in time.
EOF
)"
```

- [ ] **Step 7: Final check**

```bash
git status
git log --oneline | head -20
```

Expected: clean working tree.

---

## Definition of Done for Plan 4 (and v1)

- A user receives an in-app notification (with a red badge on the bell) when: a teammate creates a market, a market they bet on locks, a market they bet on resolves (with outcome shown), a market they bet on is voided, or someone comments on a market they bet on or created.
- Opening the bell dropdown marks all notifications as read; the badge clears.
- Any team member can post a comment on any market in their team; comments display oldest-first with author display name and timestamp.
- A team has an `/activity` page showing the last 50 events (market created + market resolved + comment posted) in reverse-chronological order.
- The team dashboard's Markets card has Open / Closed / All tabs that survive a page refresh (state in URL).
- A user has a `/me` page per team showing their balance, this-week spendable allowance, a win-rate stat, and a full bet history.
- All pages render without horizontal scroll on a 375×667 viewport.
- All unit, integration, and e2e tests pass (11 unit+integration files, 4 e2e specs).
- `npm run build` and `npm run typecheck` both succeed.
