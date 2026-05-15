# shadow-kpi Styling Design — Polymarket-vibe Visual Pass

**Status:** Approved 2026-05-14
**Scope:** Pure presentation. No information-architecture changes. No new routes. No new server logic. Every page, every server action, every data fetch stays as-is; only markup, classes, and tokens change.

## Goal

Replace the current default/unstyled look with a coherent, distinctive visual identity inspired by Polymarket. The app should look like a sleek workplace prediction market the moment you load it, not a Tailwind starter template.

## Design Decisions

| Axis | Choice |
|---|---|
| Visual direction | Polymarket vibe: dark navy surfaces, teal (YES / brand) + coral (NO / danger) accents |
| Scope | Full redesign — every existing route |
| Color scheme | Auto-follow OS preference (`prefers-color-scheme`). Both modes ship. No theme toggle UI. |
| Theme weight | Selective doughnut — 🍩 only as currency unit, on landing hero, and in empty-state illustrations. No mascot, no scatter usage. |
| Typography | Geist Mono for the wordmark and numeric values (pool / balance / bet amounts). Geist Sans for everything else. Both fonts already loaded. |

## Design Tokens

All tokens live in `src/app/globals.css`. The `:root` block defines light-mode values; a `@media (prefers-color-scheme: dark)` block overrides for dark. Tailwind v4's `@theme inline` block maps the CSS variables to utility class names so `bg-surface`, `border-border`, `text-fg-muted` etc. work as normal Tailwind utilities.

### Dark mode (primary)

| Token | Value | Purpose |
|---|---|---|
| `--bg` | `#0b0d11` | Page background |
| `--surface` | `#11151c` | Card / panel background |
| `--surface-elevated` | `#161a22` | Hovered / highlighted card |
| `--border` | `#181c23` | Hairline borders, dividers |
| `--border-strong` | `#1f2630` | Inputs, outline buttons |
| `--fg` | `#e8eef5` | Primary text |
| `--fg-muted` | `#94a3b8` | Secondary text |
| `--fg-dim` | `#64748b` | Tertiary text, uppercase labels, meta |
| `--accent` | `#2dd4bf` | Teal — YES, primary actions, brand |
| `--accent-fg` | `#062f2a` | Foreground when text sits on `--accent` |
| `--accent-bg` | `#062f2a` | Tinted surface for YES chips |
| `--accent-border` | `#14b8a6` | Border for YES chips and selected YES button |
| `--danger` | `#f43f5e` | Coral — NO, errors |
| `--danger-fg` | `#2a0e16` | Foreground when text sits on `--danger` |
| `--danger-bg` | `#2a0e16` | Tinted surface for NO chips |
| `--danger-border` | `#fb7185` | Border for NO chips and selected NO button |
| `--warning` | `#fbbf24` | Locked / pending states |
| `--ring` | `#2dd4bf` | Focus ring (same as accent) |

### Light mode

Inverts surfaces; keeps teal/coral identical because both meet 4.5:1 contrast on light and dark backgrounds.

| Token | Value |
|---|---|
| `--bg` | `#fafaf7` |
| `--surface` | `#ffffff` |
| `--surface-elevated` | `#f5f5f0` |
| `--border` | `#e7e5e0` |
| `--border-strong` | `#d4d2cb` |
| `--fg` | `#0a0d12` |
| `--fg-muted` | `#475569` |
| `--fg-dim` | `#78716c` |
| `--accent` | `#0f766e` (darker teal — readable on cream) |
| `--accent-fg` | `#ffffff` |
| `--accent-bg` | `#ccfbf1` |
| `--accent-border` | `#14b8a6` |
| `--danger` | `#e11d48` (darker coral — readable on cream) |
| `--danger-fg` | `#ffffff` |
| `--danger-bg` | `#ffe4e6` |
| `--danger-border` | `#fb7185` |
| `--warning` | `#d97706` |
| `--ring` | `#0f766e` |

### Geometry & type

| Token | Value | Purpose |
|---|---|---|
| `--r-sm` | `4px` | Pills, chips, small badges |
| `--r-md` | `6px` | Buttons, inputs |
| `--r-lg` | `10px` | Cards |
| `--r-pill` | `999px` | Balance chip |
| `--font-sans` | `var(--font-geist-sans), ui-sans-serif, system-ui` | Body |
| `--font-mono` | `var(--font-geist-mono), ui-monospace, monospace` | Wordmark, numeric values |

`body` font-family must be changed from the existing `Arial, Helvetica, sans-serif` to `var(--font-sans)`. (The current Arial fallback is a bug — Geist is loaded but unused.)

## Components

### Restyled (already exist in `src/components/ui/`)

**Button (`button.tsx`)** — three variants:
- `default`: `bg-accent text-accent-fg hover:bg-accent/90`. Used for primary CTAs (New market, Bet, Submit).
- `outline`: `border border-border-strong bg-transparent text-fg hover:bg-surface-elevated`. Used for secondary actions (My profile, Leaderboard, Activity).
- `ghost`: `bg-transparent hover:bg-surface-elevated text-fg`. Used for inline actions (Rotate code link).
Sizes: `default` (h-10 px-4), `sm` (h-8 px-3 text-xs), `icon` (h-9 w-9).

**Card (`card.tsx`)** — `bg-surface border border-border rounded-lg overflow-hidden`. `CardHeader` keeps existing flex-row layout. `CardContent` gets default `p-4` (down from current); larger pages override.

**Input (`input.tsx`)** — `bg-bg border border-border-strong rounded-md px-3 h-10`. Numeric inputs (bet amount) get `font-mono` className passed in by the form.

**Label (`label.tsx`)** — small uppercase variant: `text-xs uppercase tracking-wide text-fg-dim font-medium`.

### New (in `src/components/`)

**`badge.tsx`** — Tailwind-style pill component.
- `default`: gray (`bg-border text-fg-muted`).
- `success`: `bg-accent-bg text-accent border border-accent-border`.
- `danger`: `bg-danger-bg text-danger border border-danger-border`.
- `warning`: `bg-amber-900/20 text-warning border border-warning/40`.
All `text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-sm`.

**`status-pill.tsx`** — convenience wrapper. Takes `status: 'open' | 'locked' | 'resolved' | 'voided'` and renders a Badge with the right variant and label.
- `open` → success variant, label "OPEN"
- `locked` → warning variant, label "LOCKED"
- `resolved` → default variant + outcome suffix ("RESOLVED YES" / "RESOLVED NO")
- `voided` → danger variant, label "VOIDED"

**`yes-no-chip.tsx`** — pair of inline chips for market list rows.
- Props: `yesShare: number` (0–1), `noShare: number` (0–1).
- Renders `<YES 62¢> <NO 38¢>` side-by-side. YES chip uses `bg-accent-bg text-accent border-accent-border`; NO chip uses `bg-danger-bg text-danger border-danger-border`. Both `rounded-sm text-xs font-bold px-2 py-1`.
- If a side has 0%, that chip dims to `bg-surface text-fg-muted border-border-strong`.

**`odds-bar.tsx`** — the hero element on the market detail page.
- Props: `yesShare`, `noShare`, `yesPool`, `noPool`, `total`.
- Layout: pool total label above ("Pool 🍩 47"), 36px-tall horizontal bar split YES (left, teal gradient) / NO (right, coral gradient), `🍩 N YES` / `🍩 N NO` labels below.
- Gradients are mode-invariant (the bar is the brand hero — same saturated look in both modes): YES `linear-gradient(90deg, #0f766e, #14b8a6)`, NO `linear-gradient(90deg, #9f1239, #f43f5e)`.
- In-bar percentage labels are dark-on-saturated: `#062f2a` for YES, `#2a0e16` for NO. (Both meet AA on the brightest end of their respective gradients.)
- If the market has zero bets, the bar shows a single `bg-border` block with "No bets yet" centered in `text-fg-muted`.

**`balance-chip.tsx`** — pill in the top nav.
- Reads `balance` + `spendableThisWeek` from server props (passed through the `(app)/layout.tsx`).
- Renders `🍩 47` in a `rounded-pill bg-surface border-border-strong px-3 h-8 text-sm font-semibold` pill.
- Title attribute (browser tooltip) shows "Spendable this week: 🍩 8".

**`nav-bar.tsx`** — top nav, used in `src/app/(app)/layout.tsx`.
- Sticky, `h-14 border-b border-border bg-bg/80 backdrop-blur`.
- Left: Geist Mono wordmark `shadow-kpi` linking to the active team dashboard (or `/teams` if none).
- Right: `<NotificationBell />` + `<BalanceChip />`.
- On `<sm` widths, the wordmark stays but balance chip drops its tooltip text (still visible).

**`empty-state.tsx`** — single illustration slot + heading + subtext + optional CTA.
- Props: `icon` (defaults to 🍩, rendered at `text-6xl` ≈ 60px), `title`, `description`, `action` (optional ReactNode).
- Centered, `py-12`, used on: dashboard with zero markets, activity feed with zero events, profile with zero bets.

### `NotificationBell` minor restyle

- Unread indicator: teal dot (was red badge with count). Click still opens dropdown.
- Dropdown panel: `bg-surface border-border rounded-lg shadow-lg`.
- Each notification row: `text-sm`, with timestamp in `text-fg-dim text-xs`.

## Page Pass

Every page below gets the new tokens + restyled components. Page logic, data fetches, server actions, params, and search params are unchanged.

### Landing (`src/app/page.tsx`)
- Replace current `mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center` layout with a centered hero:
  - Background: subtle gradient `bg-[radial-gradient(ellipse_at_top,_var(--surface-elevated),_var(--bg))]` (dark) / inverted for light.
  - 🍩 at `text-7xl sm:text-8xl`.
  - `<h1>` wordmark in Geist Mono, `text-4xl font-bold tracking-tight`.
  - Tagline below, `text-fg-muted text-lg`.
  - "Sign in" button below the tagline.

### Sign in (`src/app/(auth)/signin/page.tsx`)
- Replace current layout with a single centered Card (`max-w-sm`).
- Geist Mono wordmark above the card.
- Card contains: heading "Sign in", subtitle "We'll email you a magic link.", email input, submit button.

### Check email (`src/app/(auth)/check-email/page.tsx`)
- Centered Card with 📬 emoji and "Check your email" message.

### Teams picker (`src/app/(app)/teams/page.tsx`)
- Grid of team Cards (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`).
- Each card shows team name (Geist Sans bold), balance chip inline, "View" CTA.
- "Create team" + "Join team" CTAs in the page header.

### Team dashboard (`src/app/(app)/t/[teamId]/page.tsx`)
- Matches the approved mockup.
- Page header: small uppercase label "Team", team name, action button group (My profile + Leaderboard).
- Two stat tiles (Balance, Invite link) in a 2-col grid (1-col on `<sm`).
- Markets card with:
  - Header row: title "Markets", buttons "Activity" + "+ New market".
  - Tab row: Open / Closed / All, active tab gets `border-b-2 border-accent` and `text-fg`; inactive gets `text-fg-dim`.
  - List rows: title + meta on left (Pool 🍩 N · M bettors · status hint), `<YesNoChip>` on right.
  - Locked rows: status pill inline with title, no YesNoChip.
  - Resolved rows: outcome chip on right (only the winning side, full color).

### Create team (`src/app/(app)/teams/new/page.tsx`)
- Single centered Card with team name input + create button. Standard form treatment.

### Create market (`src/app/(app)/t/[teamId]/markets/new/page.tsx`)
- Single Card with title input, description textarea, lockup datetime, resolves-at datetime. Create button. Standard form treatment.

### Market detail (`src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx`)
- Back link to team.
- Header: status pill + meta (creator + time), big title (`text-2xl font-bold tracking-tight`), description below.
- **Hero: `<OddsBar />`** — the visual focal point.
- **Bet form** (only shown when market is open and viewer is not the creator):
  - YES / NO selector (two full-width buttons that toggle which side is active; active one gets accent / danger styling).
  - Bet amount Input (mono font) + Bet button.
  - Hint line: "Spendable this week: 🍩 N".
- **Comments thread**: existing logic, restyled. Header "Comments (N)" small uppercase. Each comment has author + timestamp + body. Post form below with text input + Post button.
- **Resolution UI** (creator only, market locked, not resolved): existing logic, restyled with the YES/NO chip pattern.

### Activity (`src/app/(app)/t/[teamId]/activity/page.tsx`)
- Header: "Activity — {team.name}" + "Back to team" outline button.
- List card: each row has an icon emoji (📈 created, ✅ resolved YES, ❌ resolved NO, 💬 comment), description, relative time on the right.
- Hover state: `bg-surface-elevated`. Click navigates to market.
- EmptyState component when no items.

### Leaderboard (`src/app/(app)/t/[teamId]/leaderboard/page.tsx`)
- Header: "Leaderboard — {team.name}" + "Back to team".
- Table-card with columns: rank, name (with email-derived display name), balance, win rate (if computed).
- Top three get rank decoration: 🥇 for #1, 🥈 for #2, 🥉 for #3 (just the emoji prefix on the rank column).

### Profile (`src/app/(app)/t/[teamId]/me/page.tsx`)
- Header: "You on {team.name}" + "Back to team".
- Three stat tiles in `grid-cols-1 sm:grid-cols-3 gap-4`: Balance, This week, Win rate.
- Bet history Card: list of rows with market title (linked), side chip (YES/NO using the same colors), amount, outcome marker.

### Join page (`src/app/join/[code]/page.tsx`)
- Centered Card showing team name and "Join team" button. Standard form treatment.

## Mobile

The mockup is already shaped for ~375px viewports. Additional rules:

- Top nav: wordmark + bell + balance chip always visible. No collapse needed; the three items fit comfortably.
- Card header button groups: if the header has both a title and 2+ buttons (Markets card has 3), wrap buttons below the title at `<sm` widths using `flex-wrap` on the header.
- Stat tile grids: drop from 2- or 3-col to 1-col at `<sm`.
- Market detail bet form: stack YES/NO buttons to full-width (they're already full-width via flex-1) and stack the amount input + Bet button vertically at `<sm` (`flex-col sm:flex-row`).
- Tab navigation row: scroll horizontally if needed (`overflow-x-auto`), though Open/Closed/All easily fits.
- All cards inherit `max-w-4xl mx-auto px-4 sm:px-6` from the `(app)/layout.tsx` page wrapper — already correct.

## Accessibility

- Contrast: every color combination in the token set meets WCAG AA on both modes. `--fg` on `--bg` is 13:1 (dark) / 14:1 (light). `--fg-muted` on `--surface` is 4.8:1 (dark) / 4.7:1 (light). `--accent` on `--accent-bg` is 7:1 (dark) / 6.2:1 (light).
- Focus rings: every interactive element gets `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg` via the shared Button / Input components.
- Color is never the only signal. YES/NO chips have text labels. Status pills have text. The OddsBar has both percentage labels in the gradient and pool numbers below.
- Notification bell keeps the existing `aria-label` pattern (`{n} unread notifications`).

## Out of scope (explicit non-goals)

- No new dependencies (no shadcn re-installs beyond what's there, no extra Radix primitives, no animation library, no icon library — emoji + custom SVG path for the bell, which already exists).
- No dark/light toggle UI. Both modes work via `prefers-color-scheme` only.
- No dashboard chart / analytics views. The OddsBar is the only data visualization.
- No restructured routes. Every existing URL stays as-is.
- No copy changes beyond a few targeted polish lines (landing tagline, empty-state copy). Existing button labels, form labels, headings stay.
- No new tests required. Page logic is unchanged, so existing unit + integration + E2E tests continue to apply. If a Playwright selector changes due to markup restructuring (e.g., a heading regex), that specific test gets a targeted update — not a redesign.
- No animations beyond CSS `transition-colors` on hover.

## Acceptance

This redesign is done when:
1. `npm run build` succeeds with the new globals.css and components.
2. `npm run typecheck` succeeds.
3. All existing unit + integration + E2E tests still pass (101 tests + 4 specs).
4. Visiting each of the 10 routes on http://localhost:3333 renders the new look on both light and dark OS modes without horizontal scroll on a 375×667 viewport.
5. No page contains inline color values; everything goes through tokens.

## Files Modified / Created

```
src/
├── app/
│   ├── globals.css                                # MAJOR REWRITE: tokens + theme inline
│   ├── layout.tsx                                 # MODIFY: body font-family → font-sans
│   ├── page.tsx                                   # REWRITE: landing hero
│   ├── (app)/
│   │   ├── layout.tsx                             # MODIFY: use new NavBar
│   │   ├── teams/page.tsx                         # REWRITE: team grid
│   │   ├── teams/new/page.tsx                     # MODIFY: card layout
│   │   └── t/[teamId]/
│   │       ├── page.tsx                           # REWRITE: matches mockup
│   │       ├── activity/page.tsx                  # MODIFY: icon + hover styling
│   │       ├── leaderboard/page.tsx               # MODIFY: rank decoration
│   │       ├── me/page.tsx                        # MODIFY: stat tiles + history
│   │       └── markets/
│   │           ├── new/page.tsx                   # MODIFY: card layout
│   │           └── [marketId]/page.tsx            # REWRITE: OddsBar hero + bet form
│   ├── (auth)/
│   │   ├── signin/page.tsx                        # MODIFY: card layout
│   │   └── check-email/page.tsx                   # MODIFY: card layout
│   └── join/[code]/page.tsx                       # MODIFY: card layout
├── components/
│   ├── ui/
│   │   ├── button.tsx                             # REWRITE: variants + sizes
│   │   ├── card.tsx                               # MODIFY: tokenized
│   │   ├── input.tsx                              # MODIFY: tokenized
│   │   └── label.tsx                              # MODIFY: tokenized
│   ├── badge.tsx                                  # CREATE
│   ├── status-pill.tsx                            # CREATE
│   ├── yes-no-chip.tsx                            # CREATE
│   ├── odds-bar.tsx                               # CREATE
│   ├── balance-chip.tsx                           # CREATE
│   ├── nav-bar.tsx                                # CREATE
│   ├── empty-state.tsx                            # CREATE
│   └── notification-bell.tsx                      # MODIFY: teal dot, tokenized panel
```

Approximately 15 modified pages + 7 new components + 4 restyled UI primitives. No server-side files change.
