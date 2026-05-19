# Slack Bot — Design

**Status:** Draft 2026-05-19
**Scope:** Add a multi-workspace Slack integration that posts team-level market events into a Slack channel and DMs personally relevant events to linked users. Outbound only — no slash commands, no interactive buttons. New tables, new API routes, new cron, no changes to existing domain modules beyond registering a new event subscriber.

## Goal

Pull workplace prediction-market activity into the workplace's existing attention surface. shadow-kpi today has an in-app bell badge, an activity feed, and a "this week" dashboard surface — all of which require visiting the app. For a team-of-teammates tool, that's the wrong direction of pull. The Slack bot meets people where they already are: in their company Slack workspace.

The integration must:

1. Let any shadow-kpi instance install the bot into any Slack workspace via OAuth.
2. Post a curated set of channel announcements when markets are created, locked, or resolved.
3. DM individual bettors when *their* market locks or *their* bet resolves (won, lost, or voided).
4. Survive Slack outages, rate limits, and token revocation without losing user-visible notifications.
5. Keep the existing domain code unaware that Slack exists.

**Non-goals:** slash commands, interactive bet placement, comment notifications via DM, link-unfurling, multi-channel-per-team. All deferred to follow-ups.

## Design Decisions

| Axis | Choice |
|---|---|
| Integration depth | Outbound channel posts + per-user DMs. No slash commands, no interactive buttons. |
| Deployment model | Multi-workspace. Real OAuth install flow with per-workspace token storage. |
| Team ↔ workspace cardinality | Many shadow-kpi teams may map to one Slack workspace; each team picks its own channel. One team maps to at most one workspace. |
| Identity linking | Sign in with Slack (OIDC). Email returned by Slack must match the shadow-kpi account email. |
| Notification noise | "Balanced": channel posts on created/locked/resolved; DMs on your-market-locked, your-bet-resolved, your-bet-voided. Comments stay in the in-app bell. |
| Reliability pattern | Outbox table + cron drain. Event subscriber writes one row per intended Slack message; drain pulls and sends with per-workspace pacing and exponential backoff. |
| Bot token storage | AES-256-GCM encrypted at rest in Postgres. Key in env var `SLACK_TOKEN_ENC_KEY`. Per-row IV. |
| Slack SDK | No third-party SDK. Thin handwritten client over `fetch` covers `oauth.v2.access`, `chat.postMessage`, `conversations.open`, `conversations.list`, `openid.connect.token`. |
| Channel-without-linked-users behavior | Channel firehose fires regardless of whether any team member has linked Slack. |
| Drain cadence | Vercel cron every 1 minute. Lockup-sweep stays on its existing 5-minute schedule. Effective lock-event latency is ~5–6 minutes; acceptable for this product. |

## Architecture

```
domain event ─▶ slackOutboxSubscriber ─▶ slack_outbox row (status=pending)
                                              │
                                              ▼
              /api/cron/slack-drain (every 1m) ─▶ Slack Web API ─▶ row.status=sent
                                              │
                                              └─▶ on 429/5xx ─▶ row.attempts++, next_attempt_at=now+backoff
```

The event bus (`src/server/events.ts`) is the only seam. The new subscriber registers in the same `setImmediate` block as `inAppNotificationSubscriber` and is invisible to every other domain module.

### Server modules (all new, under `src/server/slack/`)

| Module | Responsibility |
|---|---|
| `api.ts` | Thin Slack Web API client over `fetch`. One function per Slack method we use. |
| `crypto.ts` | AES-256-GCM encrypt/decrypt for bot tokens; key from env. |
| `verify.ts` | HMAC-SHA256 signing-secret verification for inbound Slack webhooks. |
| `install.ts` | OAuth install (`oauth.v2.access`) + uninstall handling. |
| `link.ts` | Sign-in-with-Slack OIDC flow. Email match enforced. |
| `channels.ts` | Team → channel mapping CRUD. Lists workspace channels server-side via bot scopes. |
| `outbox.ts` | `enqueue(rows)` batch insert with `ON CONFLICT DO NOTHING` on `dedup_key`. `drain(limit)` pulls a paced batch and sends. |
| `blocks.ts` | Pure Block Kit formatters. One function per event variant. Input is a typed payload, output is `{ text, blocks }`. |
| `events-subscriber.ts` | Registers on `eventBus`. Per event: resolves recipients, builds payloads, batch-inserts into outbox. |

### API routes (App Router, new)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/slack/install` | GET | Session (admin of `team_id`) | Generates signed-JWT `state` cookie, redirects to Slack OAuth. |
| `/api/slack/oauth/callback` | GET | Slack `state` cookie | Exchanges code, upserts `slack_installs`, redirects to channel picker. |
| `/api/slack/link` | GET | Session | Initiates Sign in with Slack for the calling user. |
| `/api/slack/link/callback` | GET | Slack `state` cookie + session | Exchanges code, validates email + workspace, upserts `slack_user_links`. |
| `/api/slack/events` | POST | Slack signing-secret HMAC | Handles `app_uninstalled` (sets `revoked_at`). Other events ignored in v1. |
| `/api/cron/slack-drain` | GET | Bearer token (same as existing crons) | Drains up to 200 pending rows per invocation, capped at 60s wall-clock. |
| `/api/teams/[teamId]/slack-channel` | POST, DELETE | Session (team admin) | Writes/clears `slack_team_channels` row. |

## Data Model

Four new tables under `src/server/db/schema.ts`. Drizzle, snake_case, single reversible migration. All FKs ON DELETE CASCADE except where noted.

### `slack_installs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `workspace_id` | text **unique** | Slack `team.id`. Natural FK target for other tables. |
| `workspace_name` | text | Cached for display. |
| `bot_token_ciphertext` | bytea | AES-256-GCM ciphertext. |
| `bot_token_iv` | bytea | Per-row 12-byte IV. |
| `bot_user_id` | text | |
| `installer_user_id` | uuid FK → `users.id` ON DELETE SET NULL | Audit only. |
| `installed_at` | timestamptz default now() | |
| `revoked_at` | timestamptz nullable | Set on `app_uninstalled`. Row preserved for audit. |

### `slack_team_channels`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `team_id` | uuid FK → `teams.id` **unique** | One channel per team in v1. |
| `workspace_id` | text FK → `slack_installs.workspace_id` | Must reference an active install. |
| `channel_id` | text | Slack `channel.id`. |
| `channel_name` | text | Cached; refreshed on next list. |
| `configured_by_user_id` | uuid FK → `users.id` | Audit. |
| `configured_at` | timestamptz default now() | |

### `slack_user_links`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid FK → `users.id` | |
| `workspace_id` | text FK → `slack_installs.workspace_id` | |
| `slack_user_id` | text | Slack `user.id`. |
| `linked_at` | timestamptz default now() | |
| **unique** `(user_id, workspace_id)` | | One Slack identity per user per workspace. |

### `slack_outbox`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `workspace_id` | text FK → `slack_installs.workspace_id` | Drain pacer keys on this. |
| `target_kind` | text CHECK (`'channel' \| 'dm'`) | |
| `target_id` | text | Channel ID or Slack user ID. |
| `payload` | jsonb | `{ blocks, text }`. |
| `dedup_key` | text nullable | `${event}:${marketId}:channel` or `${event}:${marketId}:dm:${userId}`. |
| `status` | text CHECK (`'pending' \| 'sent' \| 'failed_permanent'`) default `'pending'` | |
| `attempts` | int default 0 | |
| `next_attempt_at` | timestamptz default now() | |
| `sent_at` | timestamptz nullable | |
| `last_error` | text nullable | |
| `created_at` | timestamptz default now() | |
| **index** `(status, next_attempt_at)` WHERE `status = 'pending'` | | Hot path for drain. |
| **unique** `(dedup_key)` WHERE `dedup_key IS NOT NULL` | | Idempotent enqueue via `ON CONFLICT DO NOTHING`. |

## User-Facing Flows

### Workspace install (team admin, once per workspace)

1. Admin: **Team settings → Slack integration → Add to Slack**.
2. `GET /api/slack/install?team_id=<id>`: server signs a JWT `state` carrying `{team_id, csrf_nonce}` with 10-minute TTL, sets it as an httpOnly cookie, redirects to Slack OAuth with scopes `chat:write,chat:write.public,im:write,team:read,users:read,channels:read`.
3. Admin grants in Slack.
4. Slack → `GET /api/slack/oauth/callback?code=…&state=<jwt>`.
5. Server verifies `state` against cookie, calls `oauth.v2.access`, upserts `slack_installs` keyed on `workspace_id` (overwrites bot token on reinstall).
6. Redirect to channel picker.

### Channel mapping (admin, immediately after install)

1. Channel picker page server-fetches workspace channels via `conversations.list` (the bot token never reaches the browser).
2. Admin picks one channel.
3. `POST /api/teams/[teamId]/slack-channel` writes `slack_team_channels`.
4. Server enqueues a one-time confirmation message into the chosen channel via `outbox.enqueue` (no `dedup_key`, so re-running the channel-set flow re-posts the confirmation). The drain delivers it within the next minute, proving end-to-end delivery and giving bystanders context.

### Per-user identity link (each member, optional)

Visible on **Profile → Linked accounts** only when the user's team has an active install.

1. User clicks **Link Slack** → `GET /api/slack/link?team_id=<id>`.
2. Server signs JWT `state` `{user_id, team_id, csrf_nonce}`, redirects to Sign in with Slack (`scope=openid email profile`).
3. User signs into Slack and consents.
4. Slack → `GET /api/slack/link/callback?code=…&state=<jwt>`.
5. Server exchanges code, receives `{sub, email, team_id, user_id}`.
6. **Workspace check:** returned `team_id` must match the team's installed workspace, else error.
7. **Email check:** returned email must match the shadow-kpi account email, else error and abort linking.
8. Upserts `slack_user_links` keyed on `(user_id, workspace_id)`.
9. Server enqueues a confirmation DM via `outbox.enqueue` (no `dedup_key`): *"You're linked. You'll get DMs when your bets resolve and when your markets lock."* Delivered by the next drain run.

**Unlink:** one-click button on the same profile page. DELETEs the link row. No Slack-side revocation.

**Uninstall:** Slack POSTs `app_uninstalled` to `/api/slack/events`; we set `slack_installs.revoked_at`. Subsequent enqueues for that workspace are skipped at the subscriber level; pending outbox rows for that workspace are marked `failed_permanent` on next drain.

## Runtime

### Event subscriber

`slackOutboxSubscriber` handles the same five domain events as the in-app subscriber. Routing per balanced default:

| Event | Channel post (team channel) | DMs (linked bettors) |
|---|---|---|
| `MarketCreated` | ✓ | — |
| `MarketLocked` | ✓ | ✓ — every linked bettor |
| `MarketResolved` | ✓ | ✓ — every linked bettor, with personal P&L |
| `MarketVoided` | — | ✓ — every linked bettor (refund) |
| `CommentPosted` | — | — (in-app bell only) |

The subscriber:

1. Resolves whether the team has an active `slack_team_channels` row.
2. Resolves which bettors have `slack_user_links` rows for the team's workspace.
3. Builds payloads via `blocks.ts`.
4. Batch-inserts all rows into `slack_outbox` in a single statement with `ON CONFLICT (dedup_key) DO NOTHING`.

If the team's workspace install is revoked, the subscriber returns early without writing.

### Drain endpoint `/api/cron/slack-drain`

Cron schedule: every 1 minute. Bearer-token authed identically to existing cron endpoints.

Per invocation:

1. ```sql
   SELECT * FROM slack_outbox
   WHERE status = 'pending' AND next_attempt_at <= now()
   ORDER BY workspace_id, created_at
   LIMIT 200
   FOR UPDATE SKIP LOCKED
   ```
   `FOR UPDATE SKIP LOCKED` protects against overlapping cron runs.
2. Group by `workspace_id`. Up to 5 groups processed in parallel.
3. Within a group, enforce ≥ 1100 ms between sends to stay under Slack's per-workspace tier-1 limit on `chat.postMessage`.
4. Decrypt the bot token from `slack_installs` (cached in memory for the invocation).
5. For DMs: call `conversations.open` (result cached per `(workspace, slack_user_id)` for the invocation), then `chat.postMessage`. For channels: `chat.postMessage` directly.
6. 60-second wall-clock budget per invocation; remaining rows wait for the next minute.

### Retry / backoff

| Slack response | Action |
|---|---|
| 2xx | `status='sent'`, `sent_at=now()` |
| **429** | Honor `Retry-After`. `next_attempt_at = now() + retry_after_seconds`. `attempts++`. Stays `pending`. |
| **5xx** | `next_attempt_at = now() + min(60s × 2^attempts, 1h)`. `attempts++`. Stays `pending`. |
| **4xx ≠ 429** (`channel_not_found`, `user_not_found`, `not_in_channel`, `token_revoked`, `account_inactive`, …) | `status='failed_permanent'`. `last_error=<slack code>`. No retry. |
| `attempts ≥ 8` on retryable errors | `status='failed_permanent'`. `last_error='exceeded_retries'`. |

If `token_revoked` or `account_inactive` returns, the install row's `revoked_at` is set in the same transaction. This prevents future enqueues and short-circuits the rest of the workspace's pending rows on the next drain.

## Block Kit Messages

All formatters live in `src/server/slack/blocks.ts` as pure functions. Each returns `{ text, blocks }` — `text` is the plain-text fallback shown in Slack desktop notifications and read by screen readers.

### Channel — MarketCreated
```
📊 New market: <title>
<team name> · locks <relative time> · created by <slack-mention>
[Place a bet]
```

### Channel — MarketLocked
```
🔒 Locked: <title>
<team name> · <N> bets · pool <pool> 🍩 (YES <yes%> / NO <no%>)
[View market]
```

### Channel — MarketResolved
```
✅ Resolved <YES|NO>: <title>
<team name> · <N> winners split <pool> 🍩 · called by <slack-mention>
[View payout breakdown]
```

### DM — MarketLocked (per linked bettor)
```
🔒 A market you bet on just locked: <title>
You staked <stake> 🍩 on <side>. Outcome resolves when <creator> calls it.
[View market]
```

### DM — MarketResolved (per linked bettor; winner branch)
```
🎉 You won <delta> 🍩
Market: <title> — resolved <outcome>
You staked <stake> → received <payout> (+<delta>) · new balance: <balance> 🍩
[View payout]
```

### DM — MarketResolved (loser branch)
```
💀 You lost <stake> 🍩
Market: <title> — resolved <outcome>
Your stake stays in the pool · new balance: <balance> 🍩
[View market]
```

### DM — MarketVoided (refund)
```
↩️ Refund: <title>
The market was voided. Your <stake> 🍩 stake has been returned.
[View market]
```

Slack mentions (`<@U0XYZ>`) are used when the relevant shadow-kpi user is linked in that workspace; otherwise the user's shadow-kpi display name is used as fallback text.

Relative-time formatting uses Slack's `<!date^…>` token where supported, with a fallback string for clients that don't render it.

## Security

- **Bot tokens** are never stored in plaintext. AES-256-GCM with a per-row 12-byte IV; key from `SLACK_TOKEN_ENC_KEY` (32 bytes, base64 in env). Decryption only happens in the drain handler and the channel-list endpoint.
- **Signing secret verification** is required on every inbound POST from Slack (`/api/slack/events`). Body is read raw, HMAC-SHA256 over `v0:<timestamp>:<raw_body>` is compared to `x-slack-signature` in constant time. Timestamps older than 5 minutes are rejected (replay protection).
- **OAuth state** is a signed JWT in an httpOnly cookie. Carries `csrf_nonce` matched against the JWT claim on callback. 10-minute TTL.
- **Sign-in-with-Slack email match** prevents account hijacking — a Slack identity can only be linked to a shadow-kpi account with the same email.
- **No bot token reaches the browser** at any point. The channel picker fetches `conversations.list` server-side.
- **Cron drain endpoint** uses the same bearer-token pattern as existing `/api/cron/*` endpoints; reuses the existing `.cron_secret` env var.

## Testing

Follows the existing posture: 110 unit/integration tests with testcontainers Postgres, real auth flow in E2E, no mocks of production deps. Slack itself is mocked via an in-process interface.

| Layer | Coverage |
|---|---|
| Unit (`tests/unit/slack/`) | Block Kit formatter outputs (snapshot per event variant); signing-secret verifier (positive, replay, tamper); outbox dedup-key generation; retry/backoff state transitions; AES-GCM round-trip; SIWS email-match logic. |
| Integration (`tests/integration/slack/`) | Subscriber writes correct outbox rows for each event × team-installed × users-linked combo; subscriber skips writes when install is revoked; enqueue is idempotent under repeated calls via `ON CONFLICT DO NOTHING`; drain query honors `next_attempt_at`; `FOR UPDATE SKIP LOCKED` prevents duplicate sends across concurrent drain runs. |
| Integration — drain pacing | 5 messages queued for one workspace → sender enforces ≥ 1100 ms gaps; 429 with `Retry-After: 3` → row deferred to ~ now + 3 s; 4xx non-429 → row `failed_permanent`; ≥ 8 attempts → row `failed_permanent`. |
| Integration — install lifecycle | `app_uninstalled` event sets `revoked_at`; pending outbox rows for that workspace go `failed_permanent` on next drain. |
| E2E (`tests/e2e/slack-install-and-link.spec.ts`) | Playwright spec: admin walks the install flow against a mocked Slack OAuth endpoint (local fixture), picks a channel, then a teammate walks the SIWS flow with matching email. No real Slack contact. |
| Existing `full-game-loop.spec.ts` | Small addition: after a market resolves with linked Slack users, assert outbox rows exist with expected `dedup_key` values. Still no real Slack contact. |

The `SlackApiClient` interface ships with two implementations: real (HTTPS via `fetch`) and `InMemorySlackApi` that captures every call into a typed array for assertions and can be primed to return scripted responses (429 with header, 5xx, specific error codes).

## Observability

- The outbox itself is the audit log. `attempts`, `last_error`, `sent_at`, `next_attempt_at` reveal the entire delivery story.
- Drain runs emit structured logs per message: `workspace_id`, `target_kind`, `attempts`, latency ms, outcome. Compatible with a future Vercel log drain.
- **`/admin/slack-health`** (feature-flagged off in v1; gated on `ADMIN_USER_IDS` env list when enabled): shows installs with `revoked_at`, count of `failed_permanent` rows in the last 7 days, oldest still-`pending` row, recent `last_error` distribution.

## Configuration

New env vars (added to `.env.example`):

| Var | Purpose |
|---|---|
| `SLACK_CLIENT_ID` | Slack app client ID. |
| `SLACK_CLIENT_SECRET` | Slack app client secret. |
| `SLACK_SIGNING_SECRET` | For HMAC verification of inbound webhooks. |
| `SLACK_TOKEN_ENC_KEY` | 32-byte AES-256-GCM key, base64. Rotate via key-version column in a future migration if needed. |
| `SLACK_APP_PUBLIC_URL` | Base URL for Slack OAuth redirect URIs. Defaults to `NEXTAUTH_URL` if unset. |

`.cron_secret` (existing) is reused for the drain endpoint's bearer-token auth.

`vercel.json` gains one new cron entry:
```json
{ "path": "/api/cron/slack-drain", "schedule": "* * * * *" }
```

## Out of Scope / Deferred Follow-ups

1. **Link unfurling.** Pasting a shadow-kpi market URL into Slack would show a preview card with current pool stats. Adds `links:read`/`links:write` scopes and a `link_shared` handler. Defer.
2. **Per-user notification preferences UI.** Wait for user feedback before building a prefs page. Schema can carry it later via a `slack_user_prefs` table without disturbing the existing tables.
3. **Slash commands and interactive buttons.** Full two-way integration (approach C from brainstorming). Separate, larger spec.
4. **Comment notifications via DM.** Deliberately omitted — comments stay in the in-app bell to control DM volume.
5. **Multi-channel per team** (one channel for created, another for resolved). One channel per team is enough until someone asks.
6. **Token rotation via Slack's rotating-tokens mode.** Non-rotating bot tokens are fine for v1. Migrating later is additive on the install row.
7. **Admin health page production-grade UX.** v1 ships behind a flag; a polished version comes after we've seen real failure modes.

## Open Questions — Resolved

| Question | Resolution |
|---|---|
| Drain cadence vs lockup-sweep latency | 1-minute drain accepted. ~5–6 minute end-to-end latency on lock events is acceptable. No piggyback on lockup-sweep. |
| Channel posts when no users are linked | Yes — channel firehose is independent of user linking. |
| Bearer-token pattern for the new cron endpoint | Reuses existing `.cron_secret`. |
