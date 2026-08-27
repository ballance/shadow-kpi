import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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

// OptionsPlayers domain
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
    lastSeenAt: timestamp('last_seen_at'),
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
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

// ─── Slack integration ────────────────────────────────────────────────────

export const slackInstalls = pgTable(
  'slack_install',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text('workspace_id').notNull(),
    workspaceName: text('workspace_name').notNull(),
    botTokenCiphertext: text('bot_token_ciphertext').notNull(),
    botTokenIv: text('bot_token_iv').notNull(),
    botUserId: text('bot_user_id').notNull(),
    installerUserId: text('installer_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    installedAt: timestamp('installed_at').notNull().defaultNow(),
    revokedAt: timestamp('revoked_at'),
  },
  (t) => ({
    workspaceIdIdx: uniqueIndex('slack_install_workspace_id_idx').on(t.workspaceId),
  }),
);

export const slackTeamChannels = pgTable(
  'slack_team_channel',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull(),
    channelId: text('channel_id').notNull(),
    channelName: text('channel_name').notNull(),
    configuredByUserId: text('configured_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    configuredAt: timestamp('configured_at').notNull().defaultNow(),
  },
  (t) => ({
    teamIdIdx: uniqueIndex('slack_team_channel_team_id_idx').on(t.teamId),
  }),
);

export const slackUserLinks = pgTable(
  'slack_user_link',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull(),
    slackUserId: text('slack_user_id').notNull(),
    linkedAt: timestamp('linked_at').notNull().defaultNow(),
  },
  (t) => ({
    userWorkspaceIdx: uniqueIndex('slack_user_link_user_workspace_idx').on(
      t.userId,
      t.workspaceId,
    ),
  }),
);

export const slackOutbox = pgTable(
  'slack_outbox',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text('workspace_id').notNull(),
    targetKind: text('target_kind', { enum: ['channel', 'dm'] }).notNull(),
    targetId: text('target_id').notNull(),
    payload: text('payload').notNull(), // JSON string: { blocks, text }
    dedupKey: text('dedup_key'),
    status: text('status', { enum: ['pending', 'sent', 'failed_permanent'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at').notNull().defaultNow(),
    sentAt: timestamp('sent_at'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    pendingIdx: index('slack_outbox_pending_idx')
      .on(t.status, t.nextAttemptAt)
      .where(sql`status = 'pending'`),
    dedupKeyIdx: uniqueIndex('slack_outbox_dedup_key_idx')
      .on(t.dedupKey)
      .where(sql`dedup_key IS NOT NULL`),
  }),
);

export type SlackInstall = typeof slackInstalls.$inferSelect;
export type SlackTeamChannel = typeof slackTeamChannels.$inferSelect;
export type SlackUserLink = typeof slackUserLinks.$inferSelect;
export type SlackOutboxRow = typeof slackOutbox.$inferSelect;
export type SlackOutboxInsert = typeof slackOutbox.$inferInsert;
