# README Redesign — Design Spec

**Status:** Approved 2026-05-15
**Scope:** Replace the current bare-bones `README.md` with a polished, Bun/Astro-style playful-with-personality README. Includes captured Playwright screenshots, a structured section layout, badges, and a permissive license.

## Goals

- Communicate the workplace-doughnut-betting premise on first scroll.
- Show the polished UI, not just describe it.
- Make local setup trivial (clone → run in under 2 minutes).
- Stand up as a portfolio-grade artifact — the kind of README a senior eng would read and respect.

## Tone

Playful with personality. The premise is already a joke; the README leans into it without being clownish. Borrows Bun/Astro structural polish (badge row, clean sections, on-brand emoji) without Vercel-style corporate voice.

## Section Layout

1. **Hero** — 🍩 emoji + `shadow-kpi` Geist Mono wordmark + one-line tagline ("Bet doughnuts on what happens at work.")
2. **Badge row** — MIT license · TypeScript · Next.js 16 · v1-shipped
3. **Hero screenshot** — Market detail page in dark mode (the OddsBar is the visual hook)
4. **🍩 What is this?** — Two paragraphs. Premise + how it works.
5. **🚀 Quick start** — 5 copy-pasteable shell commands from `git clone` to `npm run dev`.
6. **✨ Features** — 6–8 line-items, each with an inline screenshot or thumbnail.
7. **🏗️ How it works** — Three short subsections: pool math (parimutuel + dust), concurrency (`SELECT FOR UPDATE`), events (in-process bus + cron). ~200 words total.
8. **🧪 Tests** — Numbers (110 unit/integration, 4 Playwright specs) + three commands to run them. Notes testcontainers-postgresql isolation.
9. **📁 Project layout** — ASCII tree of `src/`, one-line annotation per top-level dir.
10. **📚 Docs** — Links to design specs and implementation plans in `docs/superpowers/`. Notes the spec → plan → implementation workflow that produced the project.
11. **📄 License** — MIT.
12. **🙏 Built with** — Single row of credits: Next.js · TypeScript · Drizzle · Auth.js · Resend · shadcn/ui · Geist · Tailwind · Playwright · Vitest.

## Screenshots

Captured via a one-off Playwright script at `scripts/capture-screenshots.spec.ts` with a dedicated config at `playwright.screenshots.config.ts`. Reuses the same e2e webServer pattern (port 3001, `E2E_MODE=1`, isolated Postgres on 5433). Outputs PNG files to `docs/img/`.

**Screenshot set:**

| Filename | What | Mode |
|---|---|---|
| `docs/img/hero.png` | Market detail page with OddsBar at ~60/40 split | dark |
| `docs/img/dashboard.png` | Team dashboard with 3+ markets, tabs visible | dark |
| `docs/img/market-detail.png` | Market detail with bet form visible | dark |
| `docs/img/activity.png` | Activity feed with mixed events (created + comment + resolved) | dark |
| `docs/img/leaderboard.png` | Leaderboard with 🥇🥈🥉 visible | dark |
| `docs/img/profile.png` | Profile with three stat tiles + bet history | dark |
| `docs/img/landing.png` | Landing hero page | dark |
| `docs/img/light-mode.png` | One light-mode shot of the dashboard | light |

**Capture flow:** sign in as founder, create team "Doughnut Crew", create three markets (one open with bets, one locked, one resolved), have a second user post a comment, then visit each route and `page.screenshot({ path: ... })`. Same data shape as the existing `social-and-leaderboard` E2E.

**Image dimensions:** 1280×720 viewport for desktop captures (good GitHub render width without excessive file size). Trim with `fullPage: false` to capture only the viewport.

**Total size budget:** ~600 KB across all 8 images. PNG, no optimization passes — GitHub serves them fine at this size.

## License

MIT. Standard text, copyright "2026 Chris Ballance". Lives at `LICENSE` in repo root. README's License section references it.

## Implementation Plan (no separate plan doc)

The work is small and bounded:

1. Add `LICENSE` (MIT).
2. Write `playwright.screenshots.config.ts` + `scripts/capture-screenshots.spec.ts` + npm script `npm run screenshots`.
3. Run `npm run screenshots` to generate 8 PNGs in `docs/img/`.
4. Rewrite `README.md` per the section layout above. Embed screenshots inline.
5. Commit in two commits: (a) screenshot infrastructure + images, (b) README rewrite + LICENSE.

No `docs/superpowers/plans/*.md` plan file. The structure above is the plan.

## Acceptance

- README renders cleanly on GitHub (https://github.com/ballance/shadow-kpi).
- Every section above is present.
- All 8 screenshots exist in `docs/img/` and render in the README.
- `npm run screenshots` reproduces the images from a clean checkout.
- `LICENSE` is MIT and the README links to it.
- No broken links, no Lorem Ipsum, no TODO markers.
- The README is under 400 lines.
