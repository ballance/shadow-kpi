# shadow-kpi Plan 1 — Foundation + Identity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Next.js 15 app where users sign up via magic link, create teams, share invite codes, and join other teams. Each team membership grants 12 doughnuts. No markets yet.

**Architecture:** Single Next.js 15 App Router project on Vercel (later). Drizzle ORM over Postgres for persistence. Auth.js v5 magic-link via Resend. Service layer (`src/server/**`) is plain TypeScript and does not import from `next/*`. Ledger entries are the only source of truth for balances. Integration tests use real Postgres via testcontainers; no DB mocks.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Tailwind CSS · shadcn/ui · Drizzle ORM · Postgres · Auth.js v5 · Resend · Vitest · @testcontainers/postgresql · Playwright · zod · nanoid.

**Reference:** See `docs/superpowers/specs/2026-05-12-shadow-kpi-design.md` for full design context.

---

## File Structure

Files created or modified by this plan.

```
shadow-kpi/
├── .env.example                             # required env vars (Plan 1)
├── .gitignore                               # add .env.local, .next, node_modules, etc.
├── package.json                             # deps + scripts
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── drizzle.config.ts                        # Drizzle config
├── vitest.config.ts                         # Vitest config
├── playwright.config.ts                     # Playwright config
├── components.json                          # shadcn config
├── docker-compose.dev.yml                   # local Postgres for dev
├── src/
│   ├── middleware.ts                        # auth gate for /(app)/** routes
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                         # landing
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── signin/page.tsx
│   │   │   └── check-email/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx                   # auth-protected layout
│   │   │   ├── teams/
│   │   │   │   ├── page.tsx                 # team picker
│   │   │   │   └── new/page.tsx             # create team
│   │   │   └── t/[teamId]/
│   │   │       ├── layout.tsx
│   │   │       └── page.tsx                 # dashboard stub
│   │   ├── join/[code]/page.tsx             # invite landing
│   │   └── api/
│   │       └── auth/[...nextauth]/route.ts  # Auth.js handlers
│   ├── server/
│   │   ├── auth.ts                          # Auth.js config + helpers
│   │   ├── db/
│   │   │   ├── schema.ts                    # Drizzle tables
│   │   │   ├── client.ts                    # Drizzle client
│   │   │   └── migrations/                  # generated
│   │   ├── errors.ts                        # DomainError + HTTP mapper
│   │   ├── events.ts                        # event bus skeleton
│   │   ├── ledger.ts                        # balance + allowance + grants
│   │   ├── teams.ts                         # create/find/join/rotate
│   │   └── time.ts                          # now() for testability
│   ├── components/
│   │   └── ui/                              # shadcn-generated
│   └── lib/
│       └── utils.ts                         # shadcn cn helper
├── tests/
│   ├── helpers/
│   │   └── db.ts                            # testcontainers Postgres bootstrap
│   ├── unit/
│   │   ├── errors.test.ts
│   │   └── events.test.ts
│   ├── integration/
│   │   ├── ledger.integration.test.ts
│   │   └── teams.integration.test.ts
│   └── e2e/
│       └── signup-and-join.spec.ts
└── docs/superpowers/plans/2026-05-12-shadow-kpi-plan-1-foundation-identity.md
```

**Decomposition rationale.** Each service file in `src/server/` owns one bounded responsibility: `teams.ts` knows about team membership, `ledger.ts` knows about doughnut entries, `errors.ts` defines error vocabulary, `events.ts` defines the in-process event bus. Files communicate through exported function signatures, never through shared mutable state. Tests live alongside their unit; integration tests own their own DB via testcontainers (no shared global fixtures).

---

## Conventions used throughout

- **Commit format:** Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). User preference is to add a haiku or limerick to the body of each commit. Use the template in each commit step.
- **Imports:** Absolute imports use `@/` alias (e.g., `@/server/db/client`).
- **TS:** `strict: true`; no `any`; use `unknown` and narrow.
- **No comments** unless they explain a non-obvious *why*.
- **Run** all commands from the repo root (`/Users/ballance/home/code/shadow-kpi`).
- **Test isolation:** Each integration test file owns its DB instance via testcontainers. Tests within a file share the DB and reset state between tests via `truncateAll()`.

---

### Task 1: Scaffold the Next.js 15 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`

- [ ] **Step 1: Initialize Next.js project**

The repo at `/Users/ballance/home/code/shadow-kpi` already has a git remote and `.claude/` directory but no Next.js. Use `create-next-app` to scaffold *into* the existing directory.

Run from `/Users/ballance/home/code/shadow-kpi`:

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm \
  --no-eslint
```

When prompted about existing files (the `docs/` and `.claude/` directories), choose to continue. ESLint is intentionally omitted (we'll add Biome later, out of scope for this plan).

- [ ] **Step 2: Verify dev server boots**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: the default Next.js welcome page. Kill the dev server (Ctrl+C).

- [ ] **Step 3: Replace landing page with placeholder**

Overwrite `src/app/page.tsx`:

```tsx
import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <h1 className="text-4xl font-bold">shadow-kpi</h1>
      <p className="text-muted-foreground">Bet doughnuts on what happens at work.</p>
      <Link
        href="/signin"
        className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90"
      >
        Sign in
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Verify build succeeds**

```bash
npm run build
```

Expected: build completes without errors. (`/signin` will 404 in dev — that's fine for now; we add it in Task 14.)

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "$(cat <<'EOF'
chore: scaffold Next.js 15 with TypeScript and Tailwind

Bare scaffold with placeholder landing. No routes yet.

Empty box, fresh paint —
walls are up but no doors yet.
Frame before the front.
EOF
)"
```

---

### Task 2: Configure tsconfig paths, env example, and gitignore additions

**Files:**
- Modify: `tsconfig.json`, `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Verify `@/*` path alias exists**

Open `tsconfig.json`. Confirm `"paths": { "@/*": ["./src/*"] }` is present. If missing, add it under `compilerOptions`.

- [ ] **Step 2: Add `.env*.local` and test artifacts to .gitignore**

Append to `.gitignore` (the file from `create-next-app` already ignores `node_modules`, `.next`, etc.):

```
# env files
.env.local
.env.*.local

# test artifacts
/coverage
/playwright-report
/test-results
/.testcontainers
```

- [ ] **Step 3: Create `.env.example`**

Create `.env.example`:

```env
# Postgres (local dev: from docker-compose.dev.yml)
DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5432/shadowkpi

# Auth.js
AUTH_SECRET=replace-with-openssl-rand-hex-32
AUTH_URL=http://localhost:3000

# Resend (magic-link email)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
AUTH_EMAIL_FROM=shadow-kpi <noreply@example.com>
```

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore tsconfig.json
git commit -m "$(cat <<'EOF'
chore: add env example and gitignore extras

Document required environment vars and ignore local secrets
and test output directories.

Secrets in their place —
example file shows the keys,
real ones stay at home.
EOF
)"
```

---

### Task 3: Install runtime and dev dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install drizzle-orm postgres next-auth@beta @auth/drizzle-adapter resend zod nanoid
```

Notes:
- `next-auth@beta` is Auth.js v5 (stable as of 2026 — version naming is historical).
- `nanoid` for invite codes.
- `zod` for input validation in server actions.

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D \
  drizzle-kit \
  vitest @vitest/coverage-v8 \
  testcontainers @testcontainers/postgresql \
  @playwright/test \
  dotenv \
  tsx
```

- [ ] **Step 3: Install Playwright browsers**

```bash
npx playwright install chromium
```

- [ ] **Step 4: Add npm scripts**

Open `package.json` and replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/migrate.ts",
  "db:studio": "drizzle-kit studio",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 5: Verify install completed**

```bash
npm run typecheck
```

Expected: exits 0 (no type errors on the scaffold).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: install Drizzle, Auth.js, Resend, Vitest, Playwright

Lock in toolchain for DB, auth, email, and testing layers.

Tools come in one box —
ORM, auth, mail, test runner —
ready to build now.
EOF
)"
```

---

### Task 4: Initialize shadcn/ui and add base components

**Files:**
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`, `src/components/ui/card.tsx`

- [ ] **Step 1: Run shadcn init**

```bash
npx shadcn@latest init --base-color slate --yes
```

This creates `components.json` and `src/lib/utils.ts` (the `cn` helper).

- [ ] **Step 2: Add the components we need for Plan 1**

```bash
npx shadcn@latest add button input label card --yes
```

Verify the files exist:

```bash
ls src/components/ui/
```

Expected: `button.tsx`, `input.tsx`, `label.tsx`, `card.tsx` present.

- [ ] **Step 3: Verify build still passes**

```bash
npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "$(cat <<'EOF'
chore: set up shadcn/ui with button, input, label, card

Base UI primitives ready for sign-in and team flows.

Small bricks first —
button, input, label, card stack —
walls begin to rise.
EOF
)"
```

---

### Task 5: Define Drizzle schema for Plan 1 tables

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `drizzle.config.ts`

- [ ] **Step 1: Write the schema**

Create `src/server/db/schema.ts`:

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

// Auth.js v5 with DrizzleAdapter — required tables.
// See https://authjs.dev/getting-started/adapters/drizzle
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

// shadow-kpi domain
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
    marketId: text('market_id'),
    betId: text('bet_id'),
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
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
```

Note: `marketId` and `betId` are nullable text fields with no FK constraint *yet* — Plan 2 will add the `market` and `bet` tables and we'll add FKs at that point.

- [ ] **Step 2: Write the Drizzle client**

Create `src/server/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle> | undefined;
}

function makeDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const queryClient = postgres(url);
  return drizzle(queryClient, { schema });
}

export const db = global.__db ?? makeDb();
if (process.env.NODE_ENV !== 'production') global.__db = db;

export type Db = typeof db;
```

The `global.__db` guard prevents Next.js dev-mode hot-reload from opening a new pool every reload.

- [ ] **Step 3: Write Drizzle config**

Create `drizzle.config.ts`:

```ts
import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://shadowkpi:shadowkpi@localhost:5432/shadowkpi',
  },
} satisfies Config;
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/server/db drizzle.config.ts
git commit -m "$(cat <<'EOF'
feat: add Drizzle schema for users, teams, memberships, ledger

Includes Auth.js v5 adapter tables (user/account/session/verificationToken)
plus the shadow-kpi domain tables needed for Plan 1.

Tables drawn in code —
shapes for friends and ledger lines.
Migrations come next.
EOF
)"
```

---

### Task 6: Local Postgres via docker-compose + first migration

**Files:**
- Create: `docker-compose.dev.yml`, `scripts/migrate.ts`, `src/server/db/migrations/*` (generated)

- [ ] **Step 1: Add docker-compose for local Postgres**

Create `docker-compose.dev.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: shadowkpi-postgres
    environment:
      POSTGRES_USER: shadowkpi
      POSTGRES_PASSWORD: shadowkpi
      POSTGRES_DB: shadowkpi
    ports:
      - '5432:5432'
    volumes:
      - shadowkpi-pg-data:/var/lib/postgresql/data

volumes:
  shadowkpi-pg-data:
```

- [ ] **Step 2: Start Postgres**

```bash
docker compose -f docker-compose.dev.yml up -d
```

Verify it's healthy:

```bash
docker exec shadowkpi-postgres pg_isready -U shadowkpi
```

Expected: `accepting connections`.

- [ ] **Step 3: Create `.env.local` from example**

```bash
cp .env.example .env.local
```

Generate a real `AUTH_SECRET` and replace the placeholder:

```bash
openssl rand -hex 32
```

Paste the output into `.env.local` under `AUTH_SECRET=`. Leave `RESEND_API_KEY` as-is for now; we'll wire it in Task 13.

- [ ] **Step 4: Write the migration runner**

Create `scripts/migrate.ts`:

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: './src/server/db/migrations' });
  await sql.end();
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Generate the first migration**

```bash
npm run db:generate
```

Expected: a file like `src/server/db/migrations/0000_xxxx.sql` is created.

- [ ] **Step 6: Apply the migration**

```bash
npm run db:migrate
```

Expected output: `Migrations applied.`

Verify tables exist:

```bash
docker exec shadowkpi-postgres psql -U shadowkpi -d shadowkpi -c "\dt"
```

Expected: tables `user`, `account`, `session`, `verificationToken`, `team`, `membership`, `ledger_entry`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.dev.yml scripts/migrate.ts src/server/db/migrations
git commit -m "$(cat <<'EOF'
feat: add docker-compose Postgres and first migration

Local dev DB and the initial schema migration.

Container hums in port —
five-four-three-two flips a switch,
tables greet the light.
EOF
)"
```

---

### Task 7: Vitest config + testcontainers Postgres helper

**Files:**
- Create: `vitest.config.ts`, `tests/helpers/db.ts`, `tests/helpers/db.test.ts`

- [ ] **Step 1: Write Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000, // testcontainers cold start
    hookTimeout: 60_000,
    pool: 'forks', // each file gets its own process — isolates DB containers
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 2: Write the testcontainers helper**

Create `tests/helpers/db.ts`:

```ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@/server/db/schema';

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TestDbHandle {
  db: TestDb;
  truncateAll: () => Promise<void>;
  close: () => Promise<void>;
}

let container: StartedPostgreSqlContainer | null = null;

export async function startTestDb(): Promise<TestDbHandle> {
  container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('shadowkpi_test')
    .withUsername('shadowkpi')
    .withPassword('shadowkpi')
    .start();

  const url = container.getConnectionUri();
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: './src/server/db/migrations' });

  const tables = [
    'ledger_entry',
    'membership',
    'team',
    'session',
    'account',
    'verificationToken',
    '"user"',
  ];

  return {
    db,
    truncateAll: async () => {
      await db.execute(sql.raw(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE;`));
    },
    close: async () => {
      await client.end();
      await container?.stop();
      container = null;
    },
  };
}
```

- [ ] **Step 3: Write a smoke test that exercises the helper**

Create `tests/helpers/db.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from './db';
import { teams } from '@/server/db/schema';

describe('testcontainers DB helper', () => {
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

  it('connects and lets us insert + read', async () => {
    await handle.db.insert(teams).values({ name: 'Test Team', inviteCode: 'abc123' });
    const rows = await handle.db.select().from(teams);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Test Team');
  });

  it('truncateAll wipes the team table', async () => {
    const rows = await handle.db.select().from(teams);
    expect(rows).toHaveLength(0);
  });
});
```

Note: `tests/helpers/db.test.ts` lives outside `tests/unit/` and `tests/integration/`, so the vitest `include` pattern won't pick it up by default. Move it to `tests/integration/db-helper.integration.test.ts`:

```bash
mkdir -p tests/integration
mv tests/helpers/db.test.ts tests/integration/db-helper.integration.test.ts
```

- [ ] **Step 4: Run the test**

```bash
npm test
```

Expected: 2 passing tests, `db-helper.integration.test.ts > testcontainers DB helper`. First run will be slow (~30s) because Docker pulls the postgres:16 image. Subsequent runs are ~5–10s.

If the run fails with `ECONNREFUSED` or "Could not find a working container runtime", make sure Docker Desktop (or compatible) is running.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/
git commit -m "$(cat <<'EOF'
test: add Vitest config and testcontainers Postgres helper

Each integration test file gets its own throwaway Postgres
container via testcontainers. Truncate-between-tests gives
clean state without per-test container churn.

Postgres in a box —
tests spin it up, tear it down,
no fixtures to dust.
EOF
)"
```

---

### Task 8: Implement DomainError + HTTP mapper (TDD)

**Files:**
- Create: `src/server/errors.ts`, `tests/unit/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DomainError, toHttpResponse, ERROR_HTTP_STATUS } from '@/server/errors';

describe('DomainError', () => {
  it('captures code and message', () => {
    const err = new DomainError('INSUFFICIENT_BALANCE', 'You have 3, need 5.');
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
    expect(err.message).toBe('You have 3, need 5.');
    expect(err).toBeInstanceOf(Error);
  });

  it('has a unique HTTP status mapping for each domain code', () => {
    expect(ERROR_HTTP_STATUS.INSUFFICIENT_BALANCE).toBe(400);
    expect(ERROR_HTTP_STATUS.INVITE_CODE_INVALID).toBe(404);
    expect(ERROR_HTTP_STATUS.NOT_AUTHENTICATED).toBe(401);
    expect(ERROR_HTTP_STATUS.NOT_TEAM_MEMBER).toBe(403);
  });
});

describe('toHttpResponse', () => {
  it('maps a DomainError to its status + body', () => {
    const err = new DomainError('INVITE_CODE_INVALID', 'No team found for that code.');
    const res = toHttpResponse(err);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'INVITE_CODE_INVALID', message: 'No team found for that code.' },
    });
  });

  it('maps an unknown Error to 500 with a generic message', () => {
    const err = new Error('something exploded');
    const res = toHttpResponse(err);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Something went wrong.');
  });

  it('maps an unknown DomainError code to 400', () => {
    const err = new DomainError('UNKNOWN_CODE' as never, 'huh');
    const res = toHttpResponse(err);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test, watch it fail**

```bash
npm test -- tests/unit/errors.test.ts
```

Expected: FAIL (`Cannot find module '@/server/errors'`).

- [ ] **Step 3: Implement `errors.ts`**

Create `src/server/errors.ts`:

```ts
export const ERROR_HTTP_STATUS = {
  // 400 — bad input from a client
  INSUFFICIENT_BALANCE: 400,
  AMOUNT_BELOW_MINIMUM: 400,
  BET_AFTER_LOCKUP: 400,
  CREATOR_CANNOT_BET: 400,
  RESOLVE_TOO_EARLY: 400,
  MARKET_NOT_RESOLVABLE: 400,
  VALIDATION_FAILED: 400,
  ALREADY_MEMBER: 400,

  // 401 — unauthenticated
  NOT_AUTHENTICATED: 401,

  // 403 — authenticated but not allowed
  NOT_TEAM_MEMBER: 403,
  NOT_MARKET_CREATOR: 403,

  // 404 — not found
  INVITE_CODE_INVALID: 404,
  TEAM_NOT_FOUND: 404,
  MARKET_NOT_FOUND: 404,

  // 500 — fallback
  INTERNAL_ERROR: 500,
} as const;

export type DomainErrorCode = keyof typeof ERROR_HTTP_STATUS;

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export interface HttpErrorBody {
  error: { code: string; message: string };
}

export interface HttpResponse {
  status: number;
  body: HttpErrorBody;
}

export function toHttpResponse(err: unknown): HttpResponse {
  if (err instanceof DomainError) {
    const status = ERROR_HTTP_STATUS[err.code] ?? 400;
    return { status, body: { error: { code: err.code, message: err.message } } };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } },
  };
}
```

- [ ] **Step 4: Run the tests again, watch them pass**

```bash
npm test -- tests/unit/errors.test.ts
```

Expected: PASS (3 tests, plus the 2 from the smoke test if it runs; running with the specific file scopes it).

- [ ] **Step 5: Commit**

```bash
git add src/server/errors.ts tests/unit/errors.test.ts
git commit -m "$(cat <<'EOF'
feat: add DomainError class and HTTP response mapper

Typed error codes for every user-facing failure, mapped to
HTTP status. Unknown errors become a generic 500.

Errors named with care —
each code carries its own door,
unknown ones say less.
EOF
)"
```

---

### Task 9: Implement the in-process event bus (TDD)

**Files:**
- Create: `src/server/events.ts`, `tests/unit/events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/events.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type DomainEvent } from '@/server/events';

describe('event bus', () => {
  it('calls every subscriber in order with the event', async () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.subscribe(async (e) => {
      calls.push(`a:${e.type}`);
    });
    bus.subscribe(async (e) => {
      calls.push(`b:${e.type}`);
    });

    const event: DomainEvent = {
      type: 'MarketCreated',
      marketId: 'm1',
      teamId: 't1',
      creatorId: 'u1',
    };
    await bus.emit(event);
    expect(calls).toEqual(['a:MarketCreated', 'b:MarketCreated']);
  });

  it('swallows subscriber errors and keeps calling remaining subscribers', async () => {
    const bus = createEventBus();
    const calls: string[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.subscribe(async () => {
      throw new Error('boom');
    });
    bus.subscribe(async (e) => {
      calls.push(`b:${e.type}`);
    });

    await bus.emit({ type: 'MarketLocked', marketId: 'm1', teamId: 't1' });
    expect(calls).toEqual(['b:MarketLocked']);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('emit resolves even when a subscriber rejects', async () => {
    const bus = createEventBus();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.subscribe(async () => {
      throw new Error('boom');
    });
    await expect(
      bus.emit({ type: 'MarketLocked', marketId: 'm1', teamId: 't1' }),
    ).resolves.toBeUndefined();
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test, watch it fail**

```bash
npm test -- tests/unit/events.test.ts
```

Expected: FAIL (`Cannot find module '@/server/events'`).

- [ ] **Step 3: Implement `events.ts`**

Create `src/server/events.ts`:

```ts
export type DomainEvent =
  | { type: 'MarketCreated'; marketId: string; teamId: string; creatorId: string }
  | { type: 'MarketLocked'; marketId: string; teamId: string }
  | { type: 'MarketResolved'; marketId: string; teamId: string; outcome: 'yes' | 'no' }
  | { type: 'MarketVoided'; marketId: string; teamId: string }
  | { type: 'CommentPosted'; marketId: string; teamId: string; commenterId: string };

export type EventSubscriber = (event: DomainEvent) => Promise<void>;

export interface EventBus {
  subscribe: (sub: EventSubscriber) => void;
  emit: (event: DomainEvent) => Promise<void>;
}

export function createEventBus(): EventBus {
  const subscribers: EventSubscriber[] = [];
  return {
    subscribe(sub) {
      subscribers.push(sub);
    },
    async emit(event) {
      for (const sub of subscribers) {
        try {
          await sub(event);
        } catch (err) {
          console.error('event subscriber failed', { type: event.type, err });
        }
      }
    },
  };
}

export const eventBus = createEventBus();
```

The exported `eventBus` is the singleton used by production code. Tests build fresh buses via `createEventBus()`.

- [ ] **Step 4: Run the tests, watch them pass**

```bash
npm test -- tests/unit/events.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/events.ts tests/unit/events.test.ts
git commit -m "$(cat <<'EOF'
feat: add in-process event bus skeleton

createEventBus() for tests and a module-level singleton for
production. Subscribers run sequentially; failures are logged
and swallowed so a bad subscriber can't break the operation
that fired the event.

Whispers down the line —
if one ear forgets to hear
the next ear still knows.
EOF
)"
```

---

### Task 10: Implement time.ts (now() for testability)

**Files:**
- Create: `src/server/time.ts`

- [ ] **Step 1: Implement directly (trivial enough to skip TDD)**

Create `src/server/time.ts`:

```ts
let frozenNow: Date | null = null;

export function now(): Date {
  return frozenNow ?? new Date();
}

// Test-only escape hatch. Production code never imports the setters.
export function __setNowForTests(d: Date | null): void {
  frozenNow = d;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/server/time.ts
git commit -m "$(cat <<'EOF'
feat: add now() helper with test escape hatch

Production code calls now(); tests freeze it via
__setNowForTests so weekly-reset and lockup math
are deterministic.

Time runs as it does —
tests grab the hands of the clock,
hold them very still.
EOF
)"
```

---

### Task 11: Implement ledger.ts (TDD)

**Files:**
- Create: `src/server/ledger.ts`, `tests/integration/ledger.integration.test.ts`

This is an integration test because it exercises real DB rows.

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/ledger.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import {
  getBalance,
  getSpendableAllowance,
  grantInitialAllowance,
  WEEKLY_ALLOWANCE,
} from '@/server/ledger';
import { users, teams, ledgerEntries } from '@/server/db/schema';
import { __setNowForTests } from '@/server/time';

describe('ledger', () => {
  let handle: TestDbHandle;
  const userId = 'u1';
  const teamId = 't1';

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
    await handle.db.insert(users).values({ id: userId, email: 'u1@example.com' });
    await handle.db.insert(teams).values({ id: teamId, name: 'T', inviteCode: 'inv1' });
  });

  describe('getBalance', () => {
    it('returns 0 when no entries exist', async () => {
      const balance = await getBalance(handle.db, { userId, teamId });
      expect(balance).toBe(0);
    });

    it('sums all ledger entries for that user+team', async () => {
      await handle.db.insert(ledgerEntries).values([
        { userId, teamId, kind: 'allowance_grant', amount: 12 },
        { userId, teamId, kind: 'stake', amount: -5 },
        { userId, teamId, kind: 'payout', amount: 8 },
      ]);
      const balance = await getBalance(handle.db, { userId, teamId });
      expect(balance).toBe(15);
    });

    it('does not bleed across teams', async () => {
      const otherTeamId = 't2';
      await handle.db
        .insert(teams)
        .values({ id: otherTeamId, name: 'Other', inviteCode: 'inv2' });
      await handle.db.insert(ledgerEntries).values([
        { userId, teamId, kind: 'allowance_grant', amount: 12 },
        { userId, teamId: otherTeamId, kind: 'allowance_grant', amount: 12 },
      ]);
      expect(await getBalance(handle.db, { userId, teamId })).toBe(12);
      expect(await getBalance(handle.db, { userId, teamId: otherTeamId })).toBe(12);
    });
  });

  describe('getSpendableAllowance', () => {
    it('returns the grant amount when nothing has been bet this week', async () => {
      // Freeze "now" to a Wednesday so we know what "this week" means
      __setNowForTests(new Date('2026-05-13T12:00:00Z')); // Wed
      await handle.db.insert(ledgerEntries).values({
        userId,
        teamId,
        kind: 'allowance_grant',
        amount: 12,
        createdAt: new Date('2026-05-11T00:00:00Z'), // Mon 00:00 UTC
      });
      const allowance = await getSpendableAllowance(handle.db, { userId, teamId });
      expect(allowance).toBe(12);
    });

    it('subtracts this-week stakes from this-week grants', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
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
          createdAt: new Date('2026-05-12T10:00:00Z'),
        },
      ]);
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(7);
    });

    it('clamps to 0 if more was bet than granted', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
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
          amount: -20,
          createdAt: new Date('2026-05-12T10:00:00Z'),
        },
      ]);
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(0);
    });

    it('ignores stakes from previous weeks', async () => {
      __setNowForTests(new Date('2026-05-13T12:00:00Z'));
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
          amount: -8,
          createdAt: new Date('2026-05-08T12:00:00Z'), // last week (Fri)
        },
      ]);
      expect(await getSpendableAllowance(handle.db, { userId, teamId })).toBe(12);
    });
  });

  describe('grantInitialAllowance', () => {
    it('writes a single allowance_grant for WEEKLY_ALLOWANCE doughnuts', async () => {
      await grantInitialAllowance(handle.db, { userId, teamId });
      const rows = await handle.db.select().from(ledgerEntries);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId,
        teamId,
        kind: 'allowance_grant',
        amount: WEEKLY_ALLOWANCE,
      });
    });

    it('is callable multiple times — it does NOT dedupe (caller responsibility)', async () => {
      // Called from the joinByInviteCode flow; that flow only calls it once.
      // Documented here to make the contract explicit.
      await grantInitialAllowance(handle.db, { userId, teamId });
      await grantInitialAllowance(handle.db, { userId, teamId });
      const rows = await handle.db.select().from(ledgerEntries);
      expect(rows).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/ledger.integration.test.ts
```

Expected: FAIL (`Cannot find module '@/server/ledger'`).

- [ ] **Step 3: Implement ledger.ts**

Create `src/server/ledger.ts`:

```ts
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { ledgerEntries } from '@/server/db/schema';
import { now } from '@/server/time';

export const WEEKLY_ALLOWANCE = 12;

export interface UserTeamRef {
  userId: string;
  teamId: string;
}

export async function getBalance(db: Db, { userId, teamId }: UserTeamRef): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.teamId, teamId)));
  return result[0]?.total ?? 0;
}

export async function getSpendableAllowance(
  db: Db,
  { userId, teamId }: UserTeamRef,
): Promise<number> {
  const weekStart = currentWeekStart();
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, userId),
        eq(ledgerEntries.teamId, teamId),
        gte(ledgerEntries.createdAt, weekStart),
        inArray(ledgerEntries.kind, ['allowance_grant', 'allowance_evaporate', 'stake']),
      ),
    );
  const raw = result[0]?.total ?? 0;
  return raw < 0 ? 0 : raw;
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

/** Most recent Monday 00:00:00 UTC at or before `now()`. */
export function currentWeekStart(): Date {
  const n = now();
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon=0, Sun=6
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}
```

Note: `getSpendableAllowance` does NOT currently include refunds in the formula — refunds are introduced in Plan 2 alongside the void flow. For Plan 1 (no bets exist yet), the simple `grant + stake` sum is correct and refund-handling will be added when needed.

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/ledger.integration.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/ledger.ts tests/integration/ledger.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add ledger service — balance, allowance, initial grant

getBalance sums all entries; getSpendableAllowance computes
the unspent portion of this week's grant (grants minus stakes
since Monday 00 UTC), clamped to zero. Plan 2 will extend
allowance math for refunds when the void flow lands.

Sum the running tape —
twelve grants in, five stakes paid out,
seven left to spend.
EOF
)"
```

---

### Task 12: Implement teams.ts (TDD)

**Files:**
- Create: `src/server/teams.ts`, `tests/integration/teams.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/teams.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import {
  createTeam,
  findTeamByInviteCode,
  joinByInviteCode,
  listMembershipsForUser,
  rotateInviteCode,
} from '@/server/teams';
import { users, memberships, ledgerEntries } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { WEEKLY_ALLOWANCE } from '@/server/ledger';

describe('teams service', () => {
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

  async function makeUser(id: string, email: string) {
    await handle.db.insert(users).values({ id, email });
  }

  describe('createTeam', () => {
    it('creates a team, assigns a random invite code, and makes the creator a member', async () => {
      await makeUser('u1', 'u1@example.com');
      const team = await createTeam(handle.db, { name: 'Team A', creatorId: 'u1' });
      expect(team.name).toBe('Team A');
      expect(team.inviteCode).toMatch(/^[A-Za-z0-9_-]{10}$/);

      const mems = await handle.db.select().from(memberships);
      expect(mems).toHaveLength(1);
      expect(mems[0]).toMatchObject({ userId: 'u1', teamId: team.id });
    });

    it('grants the creator their initial 12 doughnuts', async () => {
      await makeUser('u1', 'u1@example.com');
      const team = await createTeam(handle.db, { name: 'Team A', creatorId: 'u1' });
      const ledger = await handle.db.select().from(ledgerEntries);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        userId: 'u1',
        teamId: team.id,
        kind: 'allowance_grant',
        amount: WEEKLY_ALLOWANCE,
      });
    });

    it('rejects empty names', async () => {
      await makeUser('u1', 'u1@example.com');
      await expect(
        createTeam(handle.db, { name: '  ', creatorId: 'u1' }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('findTeamByInviteCode', () => {
    it('returns the team when the code matches', async () => {
      await makeUser('u1', 'u1@example.com');
      const created = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });
      const found = await findTeamByInviteCode(handle.db, created.inviteCode);
      expect(found?.id).toBe(created.id);
    });

    it('returns null when the code does not match', async () => {
      const found = await findTeamByInviteCode(handle.db, 'nope');
      expect(found).toBeNull();
    });
  });

  describe('joinByInviteCode', () => {
    it('adds a membership and grants 12 doughnuts to the new member', async () => {
      await makeUser('u1', 'u1@example.com');
      await makeUser('u2', 'u2@example.com');
      const team = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });

      const joined = await joinByInviteCode(handle.db, {
        userId: 'u2',
        inviteCode: team.inviteCode,
      });
      expect(joined.id).toBe(team.id);

      const mems = await handle.db.select().from(memberships);
      expect(mems).toHaveLength(2);

      const allLedger = await handle.db.select().from(ledgerEntries);
      const u2Entries = allLedger.filter((e) => e.userId === 'u2');
      expect(u2Entries).toHaveLength(1);
      expect(u2Entries[0]).toMatchObject({
        teamId: team.id,
        kind: 'allowance_grant',
        amount: WEEKLY_ALLOWANCE,
      });
    });

    it('throws INVITE_CODE_INVALID when the code does not match a team', async () => {
      await makeUser('u1', 'u1@example.com');
      await expect(
        joinByInviteCode(handle.db, { userId: 'u1', inviteCode: 'wrong' }),
      ).rejects.toMatchObject({ code: 'INVITE_CODE_INVALID' });
    });

    it('throws ALREADY_MEMBER if the user is already in the team', async () => {
      await makeUser('u1', 'u1@example.com');
      const team = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });
      await expect(
        joinByInviteCode(handle.db, { userId: 'u1', inviteCode: team.inviteCode }),
      ).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
    });
  });

  describe('rotateInviteCode', () => {
    it('changes the invite code if the caller is a member', async () => {
      await makeUser('u1', 'u1@example.com');
      const team = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });
      const oldCode = team.inviteCode;
      const updated = await rotateInviteCode(handle.db, { teamId: team.id, userId: 'u1' });
      expect(updated.inviteCode).not.toBe(oldCode);
      expect(await findTeamByInviteCode(handle.db, oldCode)).toBeNull();
      expect((await findTeamByInviteCode(handle.db, updated.inviteCode))?.id).toBe(team.id);
    });

    it('throws NOT_TEAM_MEMBER if the caller is not in the team', async () => {
      await makeUser('u1', 'u1@example.com');
      await makeUser('u2', 'u2@example.com');
      const team = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });
      await expect(
        rotateInviteCode(handle.db, { teamId: team.id, userId: 'u2' }),
      ).rejects.toMatchObject({ code: 'NOT_TEAM_MEMBER' });
    });
  });

  describe('listMembershipsForUser', () => {
    it('returns each team the user belongs to with a balance', async () => {
      await makeUser('u1', 'u1@example.com');
      const t1 = await createTeam(handle.db, { name: 'A', creatorId: 'u1' });
      const t2 = await createTeam(handle.db, { name: 'B', creatorId: 'u1' });

      const rows = await listMembershipsForUser(handle.db, 'u1');
      expect(rows).toHaveLength(2);
      const ids = rows.map((r) => r.team.id).sort();
      expect(ids).toEqual([t1.id, t2.id].sort());
      for (const r of rows) {
        expect(r.balance).toBe(WEEKLY_ALLOWANCE);
      }
    });

    it('returns empty array when user has no teams', async () => {
      await makeUser('u1', 'u1@example.com');
      const rows = await listMembershipsForUser(handle.db, 'u1');
      expect(rows).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npm test -- tests/integration/teams.integration.test.ts
```

Expected: FAIL (`Cannot find module '@/server/teams'`).

- [ ] **Step 3: Implement teams.ts**

Create `src/server/teams.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Db } from '@/server/db/client';
import { teams, memberships, ledgerEntries, type Team } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { getBalance, grantInitialAllowance } from '@/server/ledger';

const INVITE_CODE_LENGTH = 10;

export interface CreateTeamInput {
  name: string;
  creatorId: string;
}

export async function createTeam(db: Db, input: CreateTeamInput): Promise<Team> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'Team name cannot be empty.');
  }
  return await db.transaction(async (tx) => {
    const [team] = await tx
      .insert(teams)
      .values({ name, inviteCode: nanoid(INVITE_CODE_LENGTH) })
      .returning();
    await tx
      .insert(memberships)
      .values({ userId: input.creatorId, teamId: team.id });
    await grantInitialAllowance(tx as unknown as Db, {
      userId: input.creatorId,
      teamId: team.id,
    });
    return team;
  });
}

export async function findTeamByInviteCode(db: Db, code: string): Promise<Team | null> {
  const rows = await db.select().from(teams).where(eq(teams.inviteCode, code)).limit(1);
  return rows[0] ?? null;
}

export interface JoinByInviteCodeInput {
  userId: string;
  inviteCode: string;
}

export async function joinByInviteCode(
  db: Db,
  input: JoinByInviteCodeInput,
): Promise<Team> {
  return await db.transaction(async (tx) => {
    const team = await findTeamByInviteCode(tx as unknown as Db, input.inviteCode);
    if (!team) {
      throw new DomainError('INVITE_CODE_INVALID', 'No team found for that invite code.');
    }

    const existing = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, input.userId), eq(memberships.teamId, team.id)))
      .limit(1);
    if (existing.length > 0) {
      throw new DomainError('ALREADY_MEMBER', "You're already a member of this team.");
    }

    await tx.insert(memberships).values({ userId: input.userId, teamId: team.id });
    await grantInitialAllowance(tx as unknown as Db, {
      userId: input.userId,
      teamId: team.id,
    });
    return team;
  });
}

export interface RotateInviteCodeInput {
  teamId: string;
  userId: string;
}

export async function rotateInviteCode(
  db: Db,
  input: RotateInviteCodeInput,
): Promise<Team> {
  const membership = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, input.userId), eq(memberships.teamId, input.teamId)))
    .limit(1);
  if (membership.length === 0) {
    throw new DomainError('NOT_TEAM_MEMBER', 'You are not a member of this team.');
  }
  const [updated] = await db
    .update(teams)
    .set({ inviteCode: nanoid(INVITE_CODE_LENGTH) })
    .where(eq(teams.id, input.teamId))
    .returning();
  return updated;
}

export interface MembershipRow {
  team: Team;
  balance: number;
}

export async function listMembershipsForUser(
  db: Db,
  userId: string,
): Promise<MembershipRow[]> {
  const rows = await db
    .select({ team: teams })
    .from(memberships)
    .innerJoin(teams, eq(memberships.teamId, teams.id))
    .where(eq(memberships.userId, userId));

  const result: MembershipRow[] = [];
  for (const r of rows) {
    const balance = await getBalance(db, { userId, teamId: r.team.id });
    result.push({ team: r.team, balance });
  }
  return result;
}
```

Note on `tx as unknown as Db`: Drizzle's transaction type is structurally compatible with the top-level db for the operations we use, but its TS type differs. The cast is a small ergonomic concession; the runtime behavior is correct. A future cleanup task could split `Db` into a `Querier` interface that both types implement.

- [ ] **Step 4: Run, watch pass**

```bash
npm test -- tests/integration/teams.integration.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/teams.ts tests/integration/teams.integration.test.ts
git commit -m "$(cat <<'EOF'
feat: add teams service — create, find, join, rotate, list

Every team write happens in a transaction. Joining grants the
new member their first 12 doughnuts. Invite codes are 10-char
nanoids; rotate is open to any member.

Codes spin like dice rolls —
ten letters open the door,
anyone may turn them.
EOF
)"
```

---

### Task 13: Configure Auth.js v5 with Resend magic-link

**Files:**
- Create: `src/server/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`

- [ ] **Step 1: Write the Auth.js config**

Auth.js v5 ships an official Resend provider at `next-auth/providers/resend`. We use it for production and override `sendVerificationRequest` so that the E2E suite (Task 19) can intercept the magic-link URL via `process.env.E2E_MODE`.

Create `src/server/auth.ts`:

```ts
import NextAuth, { type DefaultSession } from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/server/db/client';
import { users, accounts, sessions, verificationTokens } from '@/server/db/schema';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

const FROM = process.env.AUTH_EMAIL_FROM ?? 'shadow-kpi <onboarding@resend.dev>';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        if (process.env.E2E_MODE === '1') {
          const dir = path.resolve('.testcontainers');
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(path.join(dir, `magic-link-${identifier}.txt`), url, 'utf8');
          return;
        }
        // Production path: use the built-in Resend sender via fetch.
        const apiKey = provider.apiKey;
        if (!apiKey) throw new Error('RESEND_API_KEY is not set');
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: 'Your shadow-kpi sign-in link',
            html: signInEmailHtml(url),
            text: `Sign in to shadow-kpi: ${url}\n\nThis link expires in 24 hours.`,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Resend failed (${res.status}): ${body}`);
        }
      },
    }),
  ],
  pages: {
    signIn: '/signin',
    verifyRequest: '/check-email',
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});

function signInEmailHtml(url: string): string {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Sign in to shadow-kpi</h2>
      <p>Click the link below to sign in. It expires in 24 hours.</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Sign in</a></p>
      <p style="color:#666;font-size:14px;">If you didn't request this, you can ignore this email.</p>
    </div>
  `;
}
```

Note: the E2E shim is built into the provider here, so Task 19 will not need to edit this file again.

- [ ] **Step 2: Wire up the Auth.js route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/server/auth';
export const { GET, POST } = handlers;
```

- [ ] **Step 3: Add middleware to protect `/(app)/**` routes**

Create `src/middleware.ts`:

```ts
import { auth } from '@/server/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isAuthed = !!req.auth;
  const { pathname } = req.nextUrl;
  const isProtected =
    pathname.startsWith('/teams') ||
    pathname.startsWith('/t/');

  if (isProtected && !isAuthed) {
    const url = new URL('/signin', req.nextUrl.origin);
    url.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/teams/:path*', '/t/:path*'],
};
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 5: Sign up for Resend, get an API key, paste into `.env.local`**

This step requires the engineer to:
1. Create a Resend account at https://resend.com (if not already).
2. Verify a sending domain OR use Resend's test "onboarding@resend.dev" sender for development.
3. Copy the API key into `.env.local` under `RESEND_API_KEY=`.
4. If using a verified domain, update `AUTH_EMAIL_FROM` in `.env.local`.

For purely-local testing without a Resend account, override `sendVerificationRequest` temporarily to `console.log(url)` so you can paste the link manually. Do not commit that change.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: build succeeds. (Warnings about unused exports in `auth.ts` are fine.)

- [ ] **Step 7: Commit**

```bash
git add src/server/auth.ts src/app/api/auth src/middleware.ts
git commit -m "$(cat <<'EOF'
feat: wire Auth.js v5 with Resend magic-link provider

Database-strategy sessions, custom Resend mailer, and a
middleware gate that bounces unauthenticated visitors to
/signin with a callback URL preserved.

Mail flies, link returns —
no password locks at the door,
only the verb 'click'.
EOF
)"
```

---

### Task 14: Build the sign-in flow (page + server action + check-email)

**Files:**
- Create: `src/app/(auth)/signin/page.tsx`, `src/app/(auth)/check-email/page.tsx`

- [ ] **Step 1: Build the sign-in page**

Create `src/app/(auth)/signin/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { signIn, auth } from '@/server/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) redirect(params.callbackUrl ?? '/teams');

  async function action(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    const callbackUrl = String(formData.get('callbackUrl') ?? '/teams');
    if (!email) return;
    await signIn('resend', { email, redirectTo: callbackUrl });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in to shadow-kpi</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <input
              type="hidden"
              name="callbackUrl"
              value={params.callbackUrl ?? '/teams'}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit">Send me a magic link</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Build the check-email page**

Create `src/app/(auth)/check-email/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            We sent you a sign-in link. Click it within 24 hours to sign in.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Manually verify the flow**

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000/signin`, submit your email. Expected:
- Redirect to `/check-email`.
- An email arrives in your inbox (or, if using `console.log` shim from Task 13 Step 5, the link prints to the server console).
- Clicking the link returns you to the app at `/teams`. `/teams` doesn't exist yet, so expect a 404 — that's fine; we add it in the next task.

Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)
git commit -m "$(cat <<'EOF'
feat: add /signin and /check-email pages with magic-link form

Server action submits email to Auth.js signIn('resend', ...);
authenticated users are redirected to their callbackUrl or
/teams.

Email field waits patient —
press a button, mailbox blooms,
key arrives in glass.
EOF
)"
```

---

### Task 15: Build the team-create page

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/teams/new/page.tsx`

- [ ] **Step 1: Build the authenticated layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth, signOut } from '@/server/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/signin');

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <Link href="/teams" className="font-semibold">
            shadow-kpi
          </Link>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button type="submit" className="text-sm text-muted-foreground hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Build the create-team page**

Create `src/app/(app)/teams/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { createTeam } from '@/server/teams';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Schema = z.object({ name: z.string().min(1).max(80) });

export default async function NewTeamPage() {
  async function action(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    const parsed = Schema.safeParse({ name: formData.get('name') });
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'Team name is required.');
    }
    const team = await createTeam(db, {
      name: parsed.data.name,
      creatorId: session.user.id,
    });
    redirect(`/t/${team.id}`);
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Create a team</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Team name</Label>
            <Input id="name" name="name" required maxLength={80} />
          </div>
          <Button type="submit">Create team</Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Manually verify**

Run `npm run dev`, sign in, then visit `http://localhost:3000/teams/new`. Submit a name. Expected: redirected to `/t/<teamId>` which 404s (we build it in Task 18) — that's expected for now.

Inspect the DB to confirm the team and ledger entry were created:

```bash
docker exec shadowkpi-postgres psql -U shadowkpi -d shadowkpi -c \
  "SELECT name, invite_code FROM team; SELECT * FROM ledger_entry;"
```

Expected: one team row, one ledger_entry with amount=12.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)
git commit -m "$(cat <<'EOF'
feat: add authenticated layout and /teams/new page

Layout enforces auth and renders a sign-out button. New-team
form posts a zod-validated name to the createTeam service
inside a transaction.

Name typed, button pressed —
new team springs into the rolls,
twelve doughnuts say hi.
EOF
)"
```

---

### Task 16: Build the team picker (/teams)

**Files:**
- Create: `src/app/(app)/teams/page.tsx`

- [ ] **Step 1: Build the picker**

Create `src/app/(app)/teams/page.tsx`:

```tsx
import Link from 'next/link';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { listMembershipsForUser } from '@/server/teams';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function TeamsPage() {
  const session = await auth();
  // Layout already redirects unauth'd users; this is just to satisfy TS.
  if (!session?.user) return null;

  const memberships = await listMembershipsForUser(db, session.user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your teams</h1>
        <Button asChild>
          <Link href="/teams/new">Create team</Link>
        </Button>
      </div>

      {memberships.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You aren't on any teams yet. Create one above, or join one via an invite link.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memberships.map(({ team, balance }) => (
            <Card key={team.id}>
              <CardHeader>
                <CardTitle>{team.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-2xl">🍩 {balance}</span>
                <Button asChild variant="outline">
                  <Link href={`/t/${team.id}`}>Open</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

`npm run dev`, sign in, visit `/teams`. Expected: a card per team showing the team name and balance (12 if you only have the create-team grant).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/teams/page.tsx
git commit -m "$(cat <<'EOF'
feat: add team picker at /teams

Lists every team the signed-in user belongs to with their
balance. Empty state hints at creating or joining.

A grid of small cards —
doughnut counts pinned to each name,
choose a room to enter.
EOF
)"
```

---

### Task 17: Build the join-via-invite page

**Files:**
- Create: `src/app/join/[code]/page.tsx`

- [ ] **Step 1: Build the page**

Create `src/app/join/[code]/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { findTeamByInviteCode, joinByInviteCode } from '@/server/teams';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface JoinPageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { code } = await params;
  const session = await auth();

  if (!session?.user) {
    const callbackUrl = encodeURIComponent(`/join/${code}`);
    redirect(`/signin?callbackUrl=${callbackUrl}`);
  }

  const team = await findTeamByInviteCode(db, code);
  if (!team) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Invite not found</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            That invite link looks broken. Ask whoever shared it for a new one.
          </CardContent>
        </Card>
      </main>
    );
  }

  async function joinAction() {
    'use server';
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    try {
      await joinByInviteCode(db, { userId: session.user.id, inviteCode: code });
    } catch (err) {
      if (err instanceof DomainError && err.code === 'ALREADY_MEMBER') {
        // fine — fall through to redirect
      } else {
        throw err;
      }
    }
    if (team) redirect(`/t/${team.id}`);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Join {team.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground">
            You're about to join <strong>{team.name}</strong>. You'll get 12 fresh doughnuts to start.
          </p>
          <form action={joinAction}>
            <Button type="submit">Join team</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Manually verify**

In one browser (or incognito window), sign in as a different email. Get an invite code from the other team in your dev DB:

```bash
docker exec shadowkpi-postgres psql -U shadowkpi -d shadowkpi -c "SELECT invite_code FROM team;"
```

Visit `http://localhost:3000/join/<code>`. Expected: card showing the team name. Click Join. Expected: redirect to `/t/<teamId>` (still 404), and the DB shows a new membership + a new allowance_grant row for your second user.

- [ ] **Step 3: Commit**

```bash
git add src/app/join
git commit -m "$(cat <<'EOF'
feat: add /join/[code] invite landing page

Unauth'd visitors are bounced through /signin with the join
URL preserved as callback. Invalid codes show a friendly
fallback. Joining writes a membership and grants 12.

Stranger at the gate —
code in hand, the name appears,
doughnuts greet the new.
EOF
)"
```

---

### Task 18: Build the team dashboard stub (/t/[teamId])

**Files:**
- Create: `src/app/(app)/t/[teamId]/layout.tsx`, `src/app/(app)/t/[teamId]/page.tsx`

- [ ] **Step 1: Build the team layout (membership guard)**

Create `src/app/(app)/t/[teamId]/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { memberships } from '@/server/db/schema';

interface TeamLayoutProps {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}

export default async function TeamLayout({ children, params }: TeamLayoutProps) {
  const session = await auth();
  if (!session?.user) redirect('/signin');
  const { teamId } = await params;

  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, session.user.id), eq(memberships.teamId, teamId)))
    .limit(1);
  if (rows.length === 0) redirect('/teams');

  return <>{children}</>;
}
```

- [ ] **Step 2: Build the dashboard stub with invite UI**

Create `src/app/(app)/t/[teamId]/page.tsx`:

```tsx
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { rotateInviteCode } from '@/server/teams';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function TeamDashboardPage({ params }: TeamPageProps) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) return null; // layout already redirected

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const [balance, allowance] = await Promise.all([
    getBalance(db, { userId: session.user.id, teamId }),
    getSpendableAllowance(db, { userId: session.user.id, teamId }),
  ]);

  async function rotateAction() {
    'use server';
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    await rotateInviteCode(db, { teamId, userId: session.user.id });
    revalidatePath(`/t/${teamId}`);
  }

  const origin = process.env.AUTH_URL ?? 'http://localhost:3000';
  const inviteUrl = `${origin}/join/${team.inviteCode}`;

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
        <CardHeader>
          <CardTitle>Markets</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Markets are coming in the next release.
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Manually verify**

`npm run dev`, sign in, click into a team. Expected: balance card shows 🍩 12, invite link card shows a copyable URL, "Rotate code" replaces the code and you can still navigate. The old `/join/<old-code>` URL now shows "Invite not found".

Try clicking into a team you are NOT a member of (use a team ID from another user). Expected: redirect to `/teams`.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/t
git commit -m "$(cat <<'EOF'
feat: add team dashboard stub with balance and invite

Layout gates on membership; page shows balance, this-week
spendable allowance, the shareable invite URL, and a rotate
button. Markets placeholder calls out next plan.

Door checks the cardholder —
balance, link, and rotate hide
behind the right name.
EOF
)"
```

---

### Task 19: Playwright E2E — signup, create team, share invite, second user joins

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/signup-and-join.spec.ts`, `tests/e2e/helpers/auth.ts`

The challenge: magic-link emails. We bypass Resend in test mode by reading the verification token directly from the test DB.

- [ ] **Step 1: Add a test-only Postgres for E2E**

Append a second service to `docker-compose.dev.yml`:

```yaml
  postgres-e2e:
    image: postgres:16
    container_name: shadowkpi-postgres-e2e
    environment:
      POSTGRES_USER: shadowkpi
      POSTGRES_PASSWORD: shadowkpi
      POSTGRES_DB: shadowkpi_e2e
    ports:
      - '5433:5432'
    volumes:
      - shadowkpi-pg-e2e-data:/var/lib/postgresql/data
```

And add the volume:

```yaml
volumes:
  shadowkpi-pg-data:
  shadowkpi-pg-e2e-data:
```

Start it:

```bash
docker compose -f docker-compose.dev.yml up -d postgres-e2e
```

Apply migrations:

```bash
DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e npm run db:migrate
```

- [ ] **Step 2: Write Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  fullyParallel: false, // single shared dev server
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'DATABASE_URL=postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e ' +
      'AUTH_URL=http://localhost:3001 ' +
      'PORT=3001 ' +
      'E2E_MODE=1 ' +
      'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

- [ ] **Step 3: Verify the E2E shim is already wired**

The `E2E_MODE=1` short-circuit was added in Task 13 — `sendVerificationRequest` writes the magic-link URL to `.testcontainers/magic-link-<email>.txt` instead of calling Resend. Confirm by opening `src/server/auth.ts` and checking the first lines of `sendVerificationRequest` reference `process.env.E2E_MODE`. No code changes needed here.

- [ ] **Step 4: Build the e2e auth helper**

Create `tests/e2e/helpers/auth.ts`:

```ts
import { type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAGIC_LINK_DIR = path.resolve('.testcontainers');

export async function signInAs(page: Page, email: string): Promise<void> {
  // Clear any prior magic link for this email
  const file = path.join(MAGIC_LINK_DIR, `magic-link-${email.toLowerCase()}.txt`);
  await fs.rm(file, { force: true });

  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send me a magic link' }).click();
  await page.waitForURL('**/check-email');

  // Poll the disk for the magic-link file (Resend shim wrote it)
  const url = await pollForLink(file);
  await page.goto(url);
}

async function pollForLink(file: string, timeoutMs = 5000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const url = await fs.readFile(file, 'utf8');
      if (url.length > 0) return url.trim();
    } catch {
      // not written yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Magic link file never appeared: ${file}`);
}
```

- [ ] **Step 5: Write the E2E test**

Create `tests/e2e/signup-and-join.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';
import postgres from 'postgres';

const E2E_DATABASE_URL = 'postgres://shadowkpi:shadowkpi@localhost:5433/shadowkpi_e2e';

test.beforeEach(async () => {
  // Wipe DB between tests for determinism
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`TRUNCATE ledger_entry, membership, team, session, account, "verificationToken", "user" RESTART IDENTITY CASCADE`;
  await sql.end();
});

test('founder creates a team and a second user joins via invite', async ({
  browser,
}) => {
  const founderCtx = await browser.newContext();
  const founder = await founderCtx.newPage();

  // Founder signs in
  await signInAs(founder, 'founder@example.com');
  await founder.waitForURL('**/teams');
  await expect(founder.getByText("You aren't on any teams yet.")).toBeVisible();

  // Founder creates a team
  await founder.getByRole('link', { name: 'Create team' }).click();
  await founder.getByLabel('Team name').fill('Doughnut Detectives');
  await founder.getByRole('button', { name: 'Create team' }).click();
  await founder.waitForURL(/\/t\/[^/]+$/);

  // Founder sees balance and invite link
  await expect(founder.getByText('🍩 12').first()).toBeVisible();
  const inviteUrl = await founder
    .locator('code')
    .filter({ hasText: /\/join\// })
    .first()
    .innerText();
  expect(inviteUrl).toContain('/join/');

  // Second user signs in in a separate context
  const joinerCtx = await browser.newContext();
  const joiner = await joinerCtx.newPage();
  await signInAs(joiner, 'joiner@example.com');
  await joiner.waitForURL('**/teams');

  // Joiner visits the invite URL and clicks Join
  await joiner.goto(inviteUrl);
  await expect(joiner.getByRole('heading', { name: /Join Doughnut Detectives/ })).toBeVisible();
  await joiner.getByRole('button', { name: 'Join team' }).click();
  await joiner.waitForURL(/\/t\/[^/]+$/);
  await expect(joiner.getByText('🍩 12').first()).toBeVisible();

  // Joiner's teams picker now shows the team
  await joiner.goto('/teams');
  await expect(joiner.getByRole('heading', { name: 'Doughnut Detectives' })).toBeVisible();

  await founderCtx.close();
  await joinerCtx.close();
});
```

- [ ] **Step 6: Run the E2E test**

Make sure the dev Postgres on port 5432 is NOT running on the e2e port (5433). Then:

```bash
npm run test:e2e
```

Expected: 1 passing test. First run is slow because Playwright spins up the Next.js dev server.

If the run fails because the dev server is already on `:3001`, kill any stray Next processes:

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
```

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e docker-compose.dev.yml
git commit -m "$(cat <<'EOF'
test: add Playwright e2e for signup-create-join flow

E2E mode (wired in auth.ts since Task 13) short-circuits
Resend by writing the magic-link URL to disk; the test helper
reads it back to complete sign-in without a real mailbox.
Single golden-path spec covers two users meeting through an
invite.

Two browsers shake hands —
link in, link out, table set,
doughnut counts agree.
EOF
)"
```

---

### Task 20: Final pass — typecheck, full test suite, README placeholder, summary commit

**Files:**
- Create: `README.md` (placeholder noting the spec and plan)
- Modify: none

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all unit + integration tests pass. Note this skips e2e (those live behind `npm run test:e2e`).

- [ ] **Step 3: Run e2e**

```bash
npm run test:e2e
```

Expected: pass.

- [ ] **Step 4: Add a README placeholder**

Create `README.md`:

```markdown
# shadow-kpi

Bet doughnuts on what happens at work. (No real money.)

## Status

Plan 1 (Foundation + Identity) is complete: signup via magic link, team creation, invite codes, balance tracking. Markets and betting land in Plan 2.

## Development

```bash
# Start local Postgres
docker compose -f docker-compose.dev.yml up -d postgres

# Copy and edit env
cp .env.example .env.local

# Apply DB migrations
npm run db:migrate

# Dev server
npm run dev
```

## Tests

- `npm test` — unit + integration (testcontainers Postgres)
- `npm run test:e2e` — Playwright

## Docs

- Design spec: `docs/superpowers/specs/2026-05-12-shadow-kpi-design.md`
- Plan 1: `docs/superpowers/plans/2026-05-12-shadow-kpi-plan-1-foundation-identity.md`
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: add README with status and dev quickstart

Surfaces the design spec and plan locations and outlines the
dev loop for the next contributor (or future me).

Doormat at the front —
points the way to specs and plans,
boots the dev container.
EOF
)"
```

- [ ] **Step 6: Confirm clean working tree and the log tells a coherent story**

```bash
git status
git log --oneline
```

Expected: clean working tree; 20+ commits each with a clear conventional-commits subject.

---

## Definition of Done for Plan 1

- Two users can each sign in via magic link.
- User A creates a team named `X`, gets 🍩 12.
- User A shares the invite URL with user B.
- User B clicks the link, joins, gets their own 🍩 12.
- Both users see `X` in their `/teams` picker showing their balance.
- Rotating the invite code invalidates the old URL.
- Full unit + integration test suite passes.
- E2E spec passes.
- `npm run build` succeeds.
- `npm run typecheck` succeeds.

When all of the above are true, Plan 1 is done and Plan 2 (Markets + Bets) can begin.
