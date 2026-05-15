# shadow-kpi

Bet doughnuts on what happens at work. (No real money.)

## Status

- **Plan 1 (Foundation + Identity):** Complete. Magic-link signup, teams, invite codes, balance.
- **Plan 2 (First Market End-to-End):** Complete. Create markets, place bets, lockup, resolve with parimutuel payouts.
- **Plan 3 (Economy Completeness):** Complete. Weekly allowance reset, market void/refund, leaderboard.
- **Plan 4 (Social & Polish):** Complete. In-app notifications + bell, comments, activity feed, status tabs, profile, mobile sweep.
- **Styling redesign:** Complete. Polymarket-vibe palette (dark navy + teal + coral), full responsive sweep, both light and dark OS modes.
- **v1 shipped.** Future v2 work: webhook delivery, per-user notification mute, multi-choice markets, structured logging.

## Development

```bash
# Start local Postgres
docker compose -f docker-compose.dev.yml up -d postgres

# Use Node 22
nvm use

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
- Plan 2: `docs/superpowers/plans/2026-05-12-shadow-kpi-plan-2-first-market.md`
- Plan 3: `docs/superpowers/plans/2026-05-12-shadow-kpi-plan-3-economy-completeness.md`
- Plan 4: `docs/superpowers/plans/2026-05-12-shadow-kpi-plan-4-social-and-polish.md`
- Styling spec: `docs/superpowers/specs/2026-05-14-shadow-kpi-styling-design.md`
- Styling plan: `docs/superpowers/plans/2026-05-14-shadow-kpi-styling-plan.md`
