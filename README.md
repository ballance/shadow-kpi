# shadow-kpi

Bet doughnuts on what happens at work. (No real money.)

## Status

- **Plan 1 (Foundation + Identity):** Complete. Magic-link signup, teams, invite codes, balance.
- **Plan 2 (First Market End-to-End):** Complete. Create markets, place bets, lockup, resolve with parimutuel payouts.
- Plans 3 (Economy completeness — weekly reset, void, leaderboard) and 4 (Social — comments, notifications, profile, feed) are next.

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
