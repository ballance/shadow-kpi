# shadow-kpi

Bet doughnuts on what happens at work. (No real money.)

## Status

Plan 1 (Foundation + Identity) is complete: signup via magic link, team creation, invite codes, balance tracking. Markets and betting land in Plan 2.

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
