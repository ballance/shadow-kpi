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

// NEW in Plan 2: markets
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

// NEW in Plan 2: bets
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

// MODIFIED in Plan 2: ledger_entry now has FK refs on market_id and bet_id
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
