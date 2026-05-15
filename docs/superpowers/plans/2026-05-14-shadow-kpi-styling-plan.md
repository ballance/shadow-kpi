# shadow-kpi Styling Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Polymarket-vibe redesign to every page in shadow-kpi — new tokens (light + dark), restyled primitives, seven new presentation components, and page-by-page restyling — without changing any server logic, route, or test contract.

**Architecture:** Bottom-up. Tokens land first (everything depends on them). UI primitives next. New shared components after that. Pages last, ordered by user-visibility (landing → dashboard → market detail → everything else). Each page change is a markup/className restructuring against existing data fetches and server actions; no data flow or route changes.

**Tech Stack:** Tailwind CSS v4 (CSS-first config via `@theme inline`), Geist Sans + Geist Mono (already loaded), shadcn-style components in `src/components/ui/`, Next.js 16 App Router. No new dependencies.

**Reference:** Design spec at `docs/superpowers/specs/2026-05-14-shadow-kpi-styling-design.md`.

---

## Conventions

- **Commits:** Conventional, with a haiku body. No Claude/AI attribution.
- **TS strict.** No `any`. Use `unknown` and narrow.
- **No comments** unless the *why* is non-obvious.
- **Run** all commands from `/Users/ballance/home/code/shadow-kpi`.
- **Use Node 22** — prefix commands with `source ~/.nvm/nvm.sh && nvm use &&`.
- **Do not touch `.env.local`** — gitignored, has real secrets.
- **Dev server** runs on port 3333. If you need a manual check, the dev server is likely already running; use `http://localhost:3333`. If not running: `lsof -ti:3333 | xargs -r kill -9; npm run dev &` then wait for "Ready in".
- **No new tests required** for pure-presentation changes. Existing tests (101 unit/integration + 4 E2E) must continue to pass. Two new components (OddsBar, StatusPill) get small unit tests because they have logic worth pinning.

---

## File Structure

```
src/
├── app/
│   ├── globals.css                                # Task 1: tokens + theme inline
│   ├── layout.tsx                                 # Task 1: body font-family
│   ├── page.tsx                                   # Task 7: landing
│   ├── (app)/
│   │   ├── layout.tsx                             # Task 5: use NavBar
│   │   ├── teams/page.tsx                         # Task 8: team grid
│   │   ├── teams/new/page.tsx                     # Task 8: card layout
│   │   └── t/[teamId]/
│   │       ├── page.tsx                           # Task 9: dashboard
│   │       ├── activity/page.tsx                  # Task 11
│   │       ├── leaderboard/page.tsx               # Task 11
│   │       ├── me/page.tsx                        # Task 11
│   │       └── markets/
│   │           ├── new/page.tsx                   # Task 10
│   │           └── [marketId]/page.tsx            # Task 10: OddsBar + bet form
│   ├── (auth)/
│   │   ├── signin/page.tsx                        # Task 7
│   │   └── check-email/page.tsx                   # Task 7
│   └── join/[code]/page.tsx                       # Task 8
├── components/
│   ├── ui/
│   │   ├── button.tsx                             # Task 2
│   │   ├── card.tsx                               # Task 2
│   │   ├── input.tsx                              # Task 2
│   │   └── label.tsx                              # Task 2
│   ├── badge.tsx                                  # Task 3
│   ├── status-pill.tsx                            # Task 3
│   ├── yes-no-chip.tsx                            # Task 4
│   ├── odds-bar.tsx                               # Task 4
│   ├── balance-chip.tsx                           # Task 5
│   ├── nav-bar.tsx                                # Task 5
│   ├── empty-state.tsx                            # Task 6
│   └── notification-bell.tsx                      # Task 5
└── tests/unit/
    ├── status-pill.test.tsx                       # Task 3
    └── odds-bar.test.tsx                          # Task 4
```

---

## Task 1: Design tokens + globals.css + body font

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Rewrite `src/app/globals.css`**

Replace the entire file with:

```css
@import "tailwindcss";

:root {
  --bg: #fafaf7;
  --surface: #ffffff;
  --surface-elevated: #f5f5f0;
  --border: #e7e5e0;
  --border-strong: #d4d2cb;
  --fg: #0a0d12;
  --fg-muted: #475569;
  --fg-dim: #78716c;
  --accent: #0f766e;
  --accent-fg: #ffffff;
  --accent-bg: #ccfbf1;
  --accent-border: #14b8a6;
  --danger: #e11d48;
  --danger-fg: #ffffff;
  --danger-bg: #ffe4e6;
  --danger-border: #fb7185;
  --warning: #d97706;
  --ring: #0f766e;

  --r-sm: 4px;
  --r-md: 6px;
  --r-lg: 10px;
  --r-pill: 999px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b0d11;
    --surface: #11151c;
    --surface-elevated: #161a22;
    --border: #181c23;
    --border-strong: #1f2630;
    --fg: #e8eef5;
    --fg-muted: #94a3b8;
    --fg-dim: #64748b;
    --accent: #2dd4bf;
    --accent-fg: #062f2a;
    --accent-bg: #062f2a;
    --accent-border: #14b8a6;
    --danger: #f43f5e;
    --danger-fg: #2a0e16;
    --danger-bg: #2a0e16;
    --danger-border: #fb7185;
    --warning: #fbbf24;
    --ring: #2dd4bf;
  }
}

@theme inline {
  --color-bg: var(--bg);
  --color-background: var(--bg);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-fg: var(--fg);
  --color-foreground: var(--fg);
  --color-fg-muted: var(--fg-muted);
  --color-muted-foreground: var(--fg-muted);
  --color-fg-dim: var(--fg-dim);
  --color-muted: var(--surface-elevated);
  --color-accent: var(--accent);
  --color-accent-fg: var(--accent-fg);
  --color-accent-bg: var(--accent-bg);
  --color-accent-border: var(--accent-border);
  --color-danger: var(--danger);
  --color-danger-fg: var(--danger-fg);
  --color-danger-bg: var(--danger-bg);
  --color-danger-border: var(--danger-border);
  --color-warning: var(--warning);
  --color-ring: var(--ring);

  --radius-sm: var(--r-sm);
  --radius-md: var(--r-md);
  --radius-lg: var(--r-lg);
  --radius-pill: var(--r-pill);

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans), ui-sans-serif, system-ui, -apple-system, sans-serif;
}
```

Notes:
- The `--color-foreground` / `--color-muted-foreground` / `--color-background` / `--color-muted` aliases exist so existing `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-muted` classes scattered through current pages keep working until those pages are restyled. Once Tasks 7–11 are done, those aliases stay (they're harmless).
- `--font-geist-sans` and `--font-geist-mono` are CSS variables that Next's `next/font/google` already injects from `layout.tsx`. Don't change the font imports.

- [ ] **Step 2: Fix the body font in `src/app/layout.tsx`**

Open `src/app/layout.tsx`. The current body className is `min-h-full flex flex-col`. Confirm the file currently includes `${geistSans.variable}` and `${geistMono.variable}` on the `<html>` element — it does. Leave layout.tsx alone (the font CSS variable is on `<html>`, body picks it up via the new `body { font-family: var(--font-sans) }` rule). No edit needed.

But change the page metadata title for personality:

Find:
```ts
export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};
```

Replace with:
```ts
export const metadata: Metadata = {
  title: "shadow-kpi",
  description: "Bet doughnuts on what happens at work.",
};
```

- [ ] **Step 3: Build verification**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

Expected: success. Look at the route list — every route should still build.

- [ ] **Step 4: Visual smoke check**

If the dev server isn't running on 3333, start it: `npm run dev &` and wait for "Ready in".

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/
```

Expected: 200. Open `http://localhost:3333/` in a browser to confirm the page renders (it'll look different — the landing is still in old markup, but the body color and base bg should reflect the new tokens).

- [ ] **Step 5: Existing tests still pass**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
```

Expected: 101 tests passing. (No tests touch CSS; this is just a sanity check.)

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(style): add design tokens — Polymarket-vibe palette

Defines tokens for both light and dark modes via prefers-color-scheme.
Tailwind v4 @theme inline maps CSS variables to utility classes
(bg-surface, text-fg-muted, border-border, accent-* and danger-*).
Body font now actually uses the already-loaded Geist Sans instead
of falling back to Arial.

Two modes from one root,
teal yes coral no, Geist heard —
ink and bg align.
EOF
)"
```

---

## Task 2: Restyle UI primitives (Button, Card, Input, Label)

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/label.tsx`

- [ ] **Step 1: Read the current Button**

```bash
cat src/components/ui/button.tsx
```

Confirm the structure uses `class-variance-authority` (`cva`) and exports `Button` + `buttonVariants`. (It should — this is the standard shadcn pattern.) If it doesn't, halt and report — the rest of this task assumes that shape.

- [ ] **Step 2: Rewrite `src/components/ui/button.tsx`**

Replace the entire file with:

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ring-offset-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg hover:bg-accent/90',
        outline:
          'border border-border-strong bg-transparent text-fg hover:bg-surface-elevated',
        ghost: 'bg-transparent text-fg hover:bg-surface-elevated',
        danger: 'bg-danger text-danger-fg hover:bg-danger/90',
      },
      size: {
        default: 'h-10 px-4 py-2 text-sm',
        sm: 'h-8 px-3 text-xs',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

If the current file uses `'bg-primary text-primary-foreground'` instead of `'bg-accent text-accent-fg'`, that's fine — we're replacing it. If the current file imports `cn` from a different path than `@/lib/utils`, KEEP the existing import path; the only thing this task changes is variant content.

- [ ] **Step 3: Rewrite `src/components/ui/card.tsx`**

Replace the entire file with:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-border bg-surface text-fg overflow-hidden',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1 p-4 border-b border-border', className)}
      {...props}
    />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-sm font-bold tracking-tight text-fg', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-xs text-fg-muted', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-4 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
```

- [ ] **Step 4: Rewrite `src/components/ui/input.tsx`**

Replace the entire file with:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-border-strong bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-dim',
          'ring-offset-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
```

- [ ] **Step 5: Rewrite `src/components/ui/label.tsx`**

Replace the entire file with:

```tsx
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium text-fg leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
```

If `@radix-ui/react-label` is not currently a dependency, check the existing label.tsx — if it uses a plain `<label>` instead, keep that pattern and only update the className. The point is the styling, not the underlying primitive.

- [ ] **Step 6: Build verification**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

Expected: success.

- [ ] **Step 7: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 8: Existing tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
```

Expected: 101 passing.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/input.tsx src/components/ui/label.tsx
git commit -m "$(cat <<'EOF'
feat(style): restyle UI primitives — Button, Card, Input, Label

Buttons get accent/outline/ghost/danger variants in the new
token language; Cards use surface + border tokens; Input uses
the deeper bg color for contrast inside cards; Label is the
small uppercase-friendly variant.

Four blocks now retuned —
accent, outline, ghost, danger,
text on calm surfaces.
EOF
)"
```

---

## Task 3: Badge + StatusPill (TDD on the status mapper)

**Files:**
- Create: `src/components/badge.tsx`
- Create: `src/components/status-pill.tsx`
- Create: `tests/unit/status-pill.test.tsx`

- [ ] **Step 1: Write the failing test for StatusPill**

Create `tests/unit/status-pill.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StatusPill } from '@/components/status-pill';

describe('StatusPill', () => {
  it('renders OPEN for open status', () => {
    const { getByText } = render(<StatusPill status="open" />);
    expect(getByText('OPEN')).toBeDefined();
  });

  it('renders LOCKED for locked status', () => {
    const { getByText } = render(<StatusPill status="locked" />);
    expect(getByText('LOCKED')).toBeDefined();
  });

  it('renders RESOLVED YES when resolved with outcome yes', () => {
    const { getByText } = render(<StatusPill status="resolved" outcome="yes" />);
    expect(getByText('RESOLVED YES')).toBeDefined();
  });

  it('renders RESOLVED NO when resolved with outcome no', () => {
    const { getByText } = render(<StatusPill status="resolved" outcome="no" />);
    expect(getByText('RESOLVED NO')).toBeDefined();
  });

  it('renders just RESOLVED when resolved without outcome', () => {
    const { getByText } = render(<StatusPill status="resolved" />);
    expect(getByText('RESOLVED')).toBeDefined();
  });

  it('renders VOIDED for voided status', () => {
    const { getByText } = render(<StatusPill status="voided" />);
    expect(getByText('VOIDED')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test -- tests/unit/status-pill.test.tsx
```

Expected: FAIL — module not found.

If `@testing-library/react` is not installed, check `package.json`. If absent, install it: `npm install -D @testing-library/react@latest jsdom@latest` and add `environment: 'jsdom'` to `vitest.config.ts` if not already there. (Check first — it may already be set up for any existing component tests.)

If after install/check the env isn't `jsdom`, add an `// @vitest-environment jsdom` annotation at the top of this test file.

- [ ] **Step 3: Implement `src/components/badge.tsx`**

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-border text-fg-muted',
        success: 'bg-accent-bg text-accent border border-accent-border',
        danger: 'bg-danger-bg text-danger border border-danger-border',
        warning: 'border border-warning/40 text-warning bg-warning/10',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
```

- [ ] **Step 4: Implement `src/components/status-pill.tsx`**

```tsx
import { Badge } from '@/components/badge';

export interface StatusPillProps {
  status: 'open' | 'locked' | 'resolved' | 'voided';
  outcome?: 'yes' | 'no' | null;
}

export function StatusPill({ status, outcome }: StatusPillProps) {
  if (status === 'open') return <Badge variant="success">OPEN</Badge>;
  if (status === 'locked') return <Badge variant="warning">LOCKED</Badge>;
  if (status === 'voided') return <Badge variant="danger">VOIDED</Badge>;
  const suffix = outcome ? ` ${outcome.toUpperCase()}` : '';
  return <Badge>{`RESOLVED${suffix}`}</Badge>;
}
```

- [ ] **Step 5: Run, watch pass**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test -- tests/unit/status-pill.test.tsx
```

Expected: 6 passing.

- [ ] **Step 6: Run the full suite**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
```

Expected: 107 passing.

- [ ] **Step 7: Commit**

```bash
git add src/components/badge.tsx src/components/status-pill.tsx tests/unit/status-pill.test.tsx
git commit -m "$(cat <<'EOF'
feat(style): add Badge + StatusPill components

Badge has default/success/danger/warning variants in the new
token language. StatusPill maps a market status (open/locked/
resolved/voided) and optional outcome to the right Badge.

Tiny pills hold a state —
open green, locked amber, voided
coral, resolved gray.
EOF
)"
```

---

## Task 4: YesNoChip + OddsBar

**Files:**
- Create: `src/components/yes-no-chip.tsx`
- Create: `src/components/odds-bar.tsx`
- Create: `tests/unit/odds-bar.test.tsx`

- [ ] **Step 1: Write the failing test for OddsBar's empty-state logic**

Create `tests/unit/odds-bar.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { OddsBar } from '@/components/odds-bar';

describe('OddsBar', () => {
  it('shows "No bets yet" when total is 0', () => {
    const { getByText } = render(
      <OddsBar yesShare={0} noShare={0} yesPool={0} noPool={0} total={0} />,
    );
    expect(getByText(/no bets yet/i)).toBeDefined();
  });

  it('renders YES percentage and NO percentage when there are bets', () => {
    const { getByText } = render(
      <OddsBar yesShare={0.62} noShare={0.38} yesPool={29} noPool={18} total={47} />,
    );
    expect(getByText(/YES · 62%/)).toBeDefined();
    expect(getByText(/NO · 38%/)).toBeDefined();
  });

  it('shows the pool total', () => {
    const { getByText } = render(
      <OddsBar yesShare={0.5} noShare={0.5} yesPool={10} noPool={10} total={20} />,
    );
    expect(getByText(/🍩 20/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test -- tests/unit/odds-bar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/yes-no-chip.tsx`**

```tsx
import { cn } from '@/lib/utils';

export interface YesNoChipProps {
  yesShare: number;
  noShare: number;
  className?: string;
}

function formatCents(share: number): string {
  return `${Math.round(share * 100)}¢`;
}

export function YesNoChip({ yesShare, noShare, className }: YesNoChipProps) {
  const yesActive = yesShare > 0;
  const noActive = noShare > 0;
  return (
    <div className={cn('flex gap-1', className)}>
      <span
        className={cn(
          'rounded-sm px-2 py-1 text-xs font-bold border',
          yesActive
            ? 'bg-accent-bg text-accent border-accent-border'
            : 'bg-surface text-fg-muted border-border-strong',
        )}
      >
        YES {formatCents(yesShare)}
      </span>
      <span
        className={cn(
          'rounded-sm px-2 py-1 text-xs font-bold border',
          noActive
            ? 'bg-danger-bg text-danger border-danger-border'
            : 'bg-surface text-fg-muted border-border-strong',
        )}
      >
        NO {formatCents(noShare)}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/components/odds-bar.tsx`**

```tsx
export interface OddsBarProps {
  yesShare: number;
  noShare: number;
  yesPool: number;
  noPool: number;
  total: number;
}

const YES_GRADIENT = 'linear-gradient(90deg, #0f766e, #14b8a6)';
const NO_GRADIENT = 'linear-gradient(90deg, #9f1239, #f43f5e)';

export function OddsBar({ yesShare, noShare, yesPool, noPool, total }: OddsBarProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex justify-between text-xs text-fg-muted mb-2">
        <span>Pool</span>
        <span className="text-fg font-bold">🍩 {total}</span>
      </div>
      {total === 0 ? (
        <div className="h-9 rounded-md bg-border flex items-center justify-center text-fg-muted text-xs">
          No bets yet
        </div>
      ) : (
        <>
          <div className="h-9 rounded-md overflow-hidden flex">
            <div
              className="flex items-center justify-center text-xs font-bold"
              style={{
                width: `${yesShare * 100}%`,
                background: YES_GRADIENT,
                color: '#062f2a',
              }}
            >
              YES · {Math.round(yesShare * 100)}%
            </div>
            <div
              className="flex items-center justify-center text-xs font-bold"
              style={{
                width: `${noShare * 100}%`,
                background: NO_GRADIENT,
                color: '#2a0e16',
              }}
            >
              NO · {Math.round(noShare * 100)}%
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-fg-dim mt-1.5">
            <span>🍩 {yesPool} YES</span>
            <span>🍩 {noPool} NO</span>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run, watch pass**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test -- tests/unit/odds-bar.test.tsx
```

Expected: 3 passing.

- [ ] **Step 6: Full suite**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
```

Expected: 110 passing.

- [ ] **Step 7: Commit**

```bash
git add src/components/yes-no-chip.tsx src/components/odds-bar.tsx tests/unit/odds-bar.test.tsx
git commit -m "$(cat <<'EOF'
feat(style): add YesNoChip + OddsBar components

YesNoChip is the inline chip pair for market list rows; dims
either side at 0%. OddsBar is the market-detail hero: a 36px
split bar with teal/coral gradients, pool labels above, side
breakdowns below. Handles the no-bets-yet empty case.

Two slices of a pool —
gradient teal, gradient coral,
dark text on the bars.
EOF
)"
```

---

## Task 5: BalanceChip + NavBar + NotificationBell restyle

**Files:**
- Create: `src/components/balance-chip.tsx`
- Create: `src/components/nav-bar.tsx`
- Modify: `src/components/notification-bell.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Read the existing `(app)/layout.tsx`**

```bash
cat "src/app/(app)/layout.tsx"
```

Note the current structure. The bell is rendered there; balance + spendable values are computed via `getBalance` / `getSpendableAllowance` either in that layout or in `(app)/t/[teamId]/page.tsx`. The team context (which team this is) is the most-recently-visited team — there is no global team context in the layout. Confirm whether the layout currently has access to a teamId. If it does NOT, BalanceChip will only render on team-scoped pages where the page itself passes the values — adjust accordingly.

If the layout does NOT currently have team context, leave the layout's nav minimal (wordmark + bell only) and let team pages render their own BalanceChip in their page header. The mockup shows balance in the nav, but the data flow doesn't easily support that without restructuring. **Do not restructure the data flow.** Document this trade-off in the commit message.

If the layout DOES already pass teamId (e.g., via a route segment), pass balance through too.

- [ ] **Step 2: Implement `src/components/balance-chip.tsx`**

```tsx
export interface BalanceChipProps {
  balance: number;
  spendableThisWeek: number;
}

export function BalanceChip({ balance, spendableThisWeek }: BalanceChipProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill bg-surface border border-border-strong px-3 h-8 text-sm font-semibold text-fg"
      title={`Spendable this week: 🍩 ${spendableThisWeek}`}
    >
      <span aria-hidden>🍩</span>
      <span>{balance}</span>
    </span>
  );
}
```

- [ ] **Step 3: Implement `src/components/nav-bar.tsx`**

```tsx
import Link from 'next/link';
import { NotificationBell, type NotificationBellProps } from '@/components/notification-bell';
import { BalanceChip } from '@/components/balance-chip';

export interface NavBarProps {
  homeHref: string;
  notifications: NotificationBellProps;
  balance?: { balance: number; spendableThisWeek: number };
}

export function NavBar({ homeHref, notifications, balance }: NavBarProps) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto max-w-4xl h-full px-4 sm:px-6 flex items-center justify-between">
        <Link
          href={homeHref}
          className="font-mono text-sm font-bold tracking-tight text-fg hover:text-accent transition-colors"
        >
          shadow-kpi
        </Link>
        <div className="flex items-center gap-3">
          <NotificationBell {...notifications} />
          {balance && <BalanceChip {...balance} />}
        </div>
      </div>
    </header>
  );
}
```

The exact `NotificationBellProps` shape may differ from what's exported today. **Read the existing `src/components/notification-bell.tsx` first**, see what props it takes, and update the import / destructure here to match. If notification-bell currently exports a default + no named props type, add a named export of the props type as part of this task.

- [ ] **Step 4: Restyle the notification bell**

Open `src/components/notification-bell.tsx`. The current implementation likely uses a red badge with a count number. Change two things:

1. **Unread indicator** — replace any red-bg count badge with a teal dot. Find the JSX that renders the count and replace with a small dot positioned absolute on the bell icon:

```tsx
{unreadCount > 0 && (
  <span
    aria-label={`${unreadCount} unread notifications`}
    className="absolute top-0 right-0 h-2 w-2 rounded-full bg-accent"
  />
)}
```

Keep the `aria-label` text exactly as `${unreadCount} unread notifications` — the social E2E test matches `/unread notifications/`.

2. **Dropdown panel** — if the file renders a dropdown, swap any `bg-white border-gray-200` style classes for `bg-surface border-border rounded-lg`. Notification rows: `text-sm text-fg` with timestamps in `text-fg-dim text-xs`.

If the bell currently has no dropdown (just a link to a notifications page), skip the panel restyle; only do step 1.

After editing, export a named props type so NavBar can import it:

```ts
export interface NotificationBellProps {
  /* whatever the bell currently takes */
}
```

(If the bell already takes typed props inline on the function definition, lift that signature to a named type and export it.)

- [ ] **Step 5: Wire NavBar into `(app)/layout.tsx`**

Edit `src/app/(app)/layout.tsx`. Find the current bell rendering (it's in the header somewhere). Replace whatever header markup exists with:

```tsx
<NavBar
  homeHref="/teams"
  notifications={{ /* pass the same props the bell currently receives */ }}
/>
```

If the layout has team-scoped data, also pass `balance={{ balance, spendableThisWeek }}`. If not, omit.

The layout's main body wrapper should be `<main className="mx-auto max-w-4xl px-4 sm:px-6 py-6">{children}</main>` — adjust if the current layout differs.

- [ ] **Step 6: Build verification**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

Expected: success.

- [ ] **Step 7: Existing tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
```

Expected: still passing.

- [ ] **Step 8: Manual nav check**

If the dev server is running, hit `http://localhost:3333/teams` (you'll need to be signed in — the existing session likely still works). Confirm the new nav renders: wordmark left, bell right. If you're not signed in, you'll redirect to /signin; that's fine, you can verify in Task 7.

- [ ] **Step 9: Commit**

```bash
git add src/components/balance-chip.tsx src/components/nav-bar.tsx src/components/notification-bell.tsx "src/app/(app)/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(style): add NavBar + BalanceChip, restyle notification bell

NavBar is the sticky top header for the authenticated layout:
Geist Mono wordmark on the left, bell + optional balance chip
on the right. Notification bell loses the red count badge in
favor of a small teal dot; aria-label preserved.

Sticky bar on top —
mono mark, bell, doughnut count,
calm hairline below.
EOF
)"
```

---

## Task 6: EmptyState component

**Files:**
- Create: `src/components/empty-state.tsx`

- [ ] **Step 1: Implement `src/components/empty-state.tsx`**

```tsx
import * as React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon = '🍩',
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="text-6xl select-none" aria-hidden>
        {icon}
      </div>
      <div className="text-base font-semibold text-fg">{title}</div>
      {description && <p className="text-sm text-fg-muted max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Build verification**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/empty-state.tsx
git commit -m "$(cat <<'EOF'
feat(style): add EmptyState component

Centered emoji + title + description + optional CTA. Default
icon is 🍩 so empty markets / activity / bet history all read
like "go make one".

One doughnut centered —
title, hint, a quiet button,
"go ahead and click".
EOF
)"
```

---

## Task 7: Landing + auth pages (signin, check-email)

**Files:**
- Rewrite: `src/app/page.tsx`
- Modify: `src/app/(auth)/signin/page.tsx`
- Modify: `src/app/(auth)/check-email/page.tsx`

- [ ] **Step 1: Rewrite `src/app/page.tsx`**

Replace the entire file with:

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-[radial-gradient(ellipse_at_top,_var(--surface-elevated),_var(--bg))]">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="text-7xl sm:text-8xl select-none" aria-hidden>
          🍩
        </div>
        <h1 className="font-mono text-4xl sm:text-5xl font-bold tracking-tight text-fg">
          shadow-kpi
        </h1>
        <p className="text-lg text-fg-muted">
          Bet doughnuts on what happens at work.
        </p>
        <Button asChild size="default">
          <Link href="/signin">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Read the current `signin/page.tsx`**

```bash
cat "src/app/(auth)/signin/page.tsx"
```

Note what form / server-action / inputs are already there. Do NOT change the form logic, the action, or the form field names — Playwright tests target them. Only the markup wrapping them.

- [ ] **Step 3: Restyle `src/app/(auth)/signin/page.tsx`**

Wrap the existing form in this layout. Keep the existing `<form action={...}>`, the existing `Input`, the existing labels exactly as they are. Apply this surrounding markup:

```tsx
// EXAMPLE — adapt to whatever the current page does internally
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
/* existing server-action import stays */

export default function SignInPage(/* existing props */) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-6 bg-[radial-gradient(ellipse_at_top,_var(--surface-elevated),_var(--bg))]">
      <Link href="/" className="font-mono text-2xl font-bold tracking-tight text-fg">
        shadow-kpi
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Sign in</CardTitle>
          <CardDescription>We'll email you a magic link.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* EXISTING form goes here, unchanged */}
        </CardContent>
      </Card>
    </main>
  );
}
```

If the current signin page has both an email input and any extra logic (callbackUrl prop, error display), KEEP all of that inside the `<CardContent>`. The only thing this step changes is wrapper markup, fonts, and tokens.

- [ ] **Step 4: Restyle `src/app/(auth)/check-email/page.tsx`**

Same pattern. Wrap whatever's there in:

```tsx
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

export default function CheckEmailPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-6 bg-[radial-gradient(ellipse_at_top,_var(--surface-elevated),_var(--bg))]">
      <Link href="/" className="font-mono text-2xl font-bold tracking-tight text-fg">
        shadow-kpi
      </Link>
      <Card className="w-full max-w-sm">
        <CardContent className="text-center py-8 flex flex-col gap-3">
          <div className="text-5xl" aria-hidden>📬</div>
          <div className="text-base font-semibold text-fg">Check your email</div>
          <p className="text-sm text-fg-muted">We sent you a magic link. It expires in 24 hours.</p>
        </CardContent>
      </Card>
    </main>
  );
}
```

If the current check-email page renders dynamic content (e.g., the email address), preserve that — just restyle the wrapper.

- [ ] **Step 5: Build verification**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

Expected: success.

- [ ] **Step 6: Tests + E2E**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
```

Expected: 110 passing.

```bash
docker compose -f docker-compose.dev.yml up -d postgres-e2e && sleep 3
lsof -ti:3001 | xargs -r kill -9 2>/dev/null
source ~/.nvm/nvm.sh && nvm use && npm run test:e2e 2>&1 | tail -15
```

Bash timeout: 900000ms. Expected: 4 passing. If signin selectors changed, fix the spec — but more likely the form field names are unchanged so this passes as-is.

- [ ] **Step 7: Manual check**

Visit `http://localhost:3333/` and `http://localhost:3333/signin` in both light and dark OS modes. Confirm the radial gradient lands cleanly and the wordmark renders in Geist Mono.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx "src/app/(auth)/signin/page.tsx" "src/app/(auth)/check-email/page.tsx"
git commit -m "$(cat <<'EOF'
feat(style): restyle landing + auth pages

Landing hero is a single 🍩, the wordmark in Geist Mono, the
tagline, and a sign-in CTA on a radial-gradient backdrop.
Signin and check-email pages get the centered-card pattern.

🍩 above the wordmark —
work-tool secretly fun, signed
in with one magic link.
EOF
)"
```

---

## Task 8: Teams picker + create team + join page

**Files:**
- Modify: `src/app/(app)/teams/page.tsx`
- Modify: `src/app/(app)/teams/new/page.tsx`
- Modify: `src/app/join/[code]/page.tsx`

- [ ] **Step 1: Read each file first**

```bash
cat "src/app/(app)/teams/page.tsx"
cat "src/app/(app)/teams/new/page.tsx"
cat "src/app/join/[code]/page.tsx"
```

Note what data each fetches, what forms / actions are present, and what test selectors might target (e.g., `getByRole('link', { name: 'Create team' })`, `getByLabel('Team name')`). Preserve every accessible name and label.

- [ ] **Step 2: Restyle `src/app/(app)/teams/page.tsx`**

Replace the page body with this layout, preserving the existing data fetch and the existing "Create team" link/button:

```tsx
// EXAMPLE pattern — adapt to whatever the current data shape is
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
/* existing imports for db / auth / queries */

export default async function TeamsPage(/* existing props */) {
  /* existing data fetch — typically: session, memberships+balance list */

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">Your teams</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Pick a team</h1>
        </div>
        <Button asChild>
          <Link href="/teams/new">Create team</Link>
        </Button>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          description="Create one to start a market, or paste an invite link your teammates shared."
          action={
            <Button asChild>
              <Link href="/teams/new">Create team</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <Link key={team.id} href={`/t/${team.id}`}>
              <Card className="hover:bg-surface-elevated transition-colors cursor-pointer">
                <CardContent className="flex flex-col gap-2 py-5">
                  <div className="text-base font-semibold text-fg">{team.name}</div>
                  <div className="text-xs text-fg-muted">
                    🍩 {team.balance} · {team.memberCount} members
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

If the current page doesn't fetch member counts, drop that bit — only show what's currently fetched. Do not change the data fetch.

If the page currently links to invite-by-code form, preserve that link/button — drop it into the page header alongside "Create team" with `variant="outline"`.

- [ ] **Step 3: Restyle `src/app/(app)/teams/new/page.tsx`**

Wrap the existing form in a centered Card:

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
/* existing imports */

export default async function CreateTeamPage(/* existing props */) {
  return (
    <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
      <Link href="/teams" className="self-start text-xs text-fg-muted hover:text-fg">← Back to teams</Link>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">Create a team</CardTitle>
          <CardDescription>You'll get an invite code to share.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* EXISTING form, unchanged */}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Restyle `src/app/join/[code]/page.tsx`**

Same pattern:

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
/* existing imports — team lookup by code, auth, etc. */

export default async function JoinPage(/* existing props */) {
  /* existing logic — fetch team by code, handle invalid code, etc. */

  return (
    <div className="flex flex-col items-center gap-4 max-w-md mx-auto py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">Join {team.name}</CardTitle>
          <CardDescription>Click the button below to accept the invite.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* EXISTING join form / button, unchanged */}
        </CardContent>
      </Card>
    </div>
  );
}
```

Preserve the existing error / already-joined states.

- [ ] **Step 5: Build + tests + E2E**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
docker compose -f docker-compose.dev.yml up -d postgres-e2e && sleep 3
lsof -ti:3001 | xargs -r kill -9 2>/dev/null
source ~/.nvm/nvm.sh && nvm use && npm run test:e2e 2>&1 | tail -15
```

Bash timeout: 900000ms. Expected: builds, 110 unit/integration pass, 4 E2E pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/teams/page.tsx" "src/app/(app)/teams/new/page.tsx" "src/app/join/[code]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(style): restyle teams picker, create-team, join pages

Teams picker is a grid of team cards with balance + member count;
create-team and join wrap their existing forms in centered Cards.
EmptyState used for the no-teams branch.

Three doors to the room —
pick a team, make a team, join,
calm cards either way.
EOF
)"
```

---

## Task 9: Team dashboard

**Files:**
- Rewrite: `src/app/(app)/t/[teamId]/page.tsx`

- [ ] **Step 1: Read the current page**

```bash
cat "src/app/(app)/t/[teamId]/page.tsx"
```

Note: existing data fetches (`getBalance`, `getSpendableAllowance`, `listMarketsForTeam`, `rotateInviteCode`), the `rotateAction` server action, the `searchParams` for status tabs, and the existing `statusLabel` helper. Preserve all of it.

- [ ] **Step 2: Rewrite the body**

The full restyled page (preserving all data fetches and the server action verbatim):

```tsx
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { teams } from '@/server/db/schema';
import { getBalance, getSpendableAllowance } from '@/server/ledger';
import { rotateInviteCode } from '@/server/teams';
import { listMarketsForTeam } from '@/server/markets';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { YesNoChip } from '@/components/yes-no-chip';
import { StatusPill } from '@/components/status-pill';
import { EmptyState } from '@/components/empty-state';

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ status?: string }>;
}

function shareFromPool(yesPool: number, noPool: number): { y: number; n: number } {
  const total = yesPool + noPool;
  if (total === 0) return { y: 0, n: 0 };
  return { y: yesPool / total, n: noPool / total };
}

export default async function TeamDashboardPage({ params, searchParams }: TeamPageProps) {
  const { teamId } = await params;
  const { status } = await searchParams;
  const activeTab: 'open' | 'closed' | 'all' =
    status === 'closed' || status === 'all' ? status : 'open';
  const session = await auth();
  if (!session?.user) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const [balance, allowance, marketRows] = await Promise.all([
    getBalance(db, { userId: session.user.id, teamId }),
    getSpendableAllowance(db, { userId: session.user.id, teamId }),
    listMarketsForTeam(db, teamId),
  ]);

  async function rotateAction() {
    'use server';
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    await rotateInviteCode(db, { teamId, userId: session.user.id });
    revalidatePath(`/t/${teamId}`);
  }

  const origin = process.env.AUTH_URL ?? 'http://localhost:3333';
  const inviteUrl = `${origin}/join/${team.inviteCode}`;

  const filtered = marketRows.filter((m) => {
    if (activeTab === 'open') return m.status === 'open' || m.status === 'locked';
    if (activeTab === 'closed') return m.status === 'resolved' || m.status === 'voided';
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">Team</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{team.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/me`}>My profile</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${teamId}/leaderboard`}>Leaderboard</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">Balance</div>
            <div className="text-2xl font-bold text-fg font-mono mt-0.5">🍩 {balance}</div>
            <div className="text-xs text-fg-muted mt-1">
              Spendable this week: <span className="text-accent font-semibold font-mono">🍩 {allowance}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">Invite link</div>
            <code className="block mt-2 break-all rounded-md bg-bg border border-border-strong px-2 py-1.5 text-[11px] font-mono text-fg-muted">
              {inviteUrl}
            </code>
            <form action={rotateAction} className="mt-2">
              <Button type="submit" variant="ghost" size="sm" className="text-accent hover:text-accent">
                ↻ Rotate
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between flex-wrap gap-2 p-4">
          <CardTitle>Markets</CardTitle>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/t/${teamId}/activity`}>Activity</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/t/${teamId}/markets/new`}>+ New market</Link>
            </Button>
          </div>
        </CardHeader>
        <div className="flex gap-4 px-4 border-b border-border overflow-x-auto">
          {(['open', 'closed', 'all'] as const).map((t) => (
            <Link
              key={t}
              href={`/t/${teamId}?status=${t}`}
              className={`-mb-px border-b-2 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === t
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-dim hover:text-fg'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Link>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            title="No markets in this tab"
            description="Create the first one for your team."
            action={
              <Button asChild>
                <Link href={`/t/${teamId}/markets/new`}>+ New market</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((m) => {
              const { y, n } = shareFromPool(m.yesPool ?? 0, m.noPool ?? 0);
              const isClosed = m.status === 'resolved' || m.status === 'voided';
              return (
                <li key={m.id} className="px-4 py-3 hover:bg-surface-elevated transition-colors">
                  <Link
                    href={`/t/${teamId}/markets/${m.id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-fg truncate">{m.title}</span>
                        {m.status === 'locked' && <StatusPill status="locked" />}
                        {isClosed && <StatusPill status={m.status} outcome={m.outcome ?? null} />}
                      </div>
                      <div className="text-[10px] text-fg-dim mt-0.5">
                        Pool 🍩 {(m.yesPool ?? 0) + (m.noPool ?? 0)}
                      </div>
                    </div>
                    {m.status === 'open' && <YesNoChip yesShare={y} noShare={n} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

**Important:** Check what fields `listMarketsForTeam` actually returns by reading `src/server/markets.ts`. If it does NOT return `yesPool` / `noPool` on each row (most likely the case), the YesNoChip block above won't have real data — it would render "YES 0¢ / NO 0¢" on every row.

**Per the spec, do not change the data layer.** Instead, drop the YesNoChip entirely from the list view. The OddsBar on the market detail page is the real breakdown. List rows show only title + status pill (when locked/closed).

Apply these adjustments to the rewrite above:
1. Remove the `YesNoChip` import.
2. Remove the `shareFromPool` helper.
3. Remove the `const { y, n } = ...` line inside the `filtered.map`.
4. Remove the `{m.status === 'open' && <YesNoChip yesShare={y} noShare={n} />}` line entirely. The list row's right side becomes empty for open markets — that's fine; the title and the meta line carry the row.
5. Remove the `<div className="text-[10px] text-fg-dim mt-0.5">Pool 🍩 {(m.yesPool ?? 0) + (m.noPool ?? 0)}</div>` line — it'd always render `🍩 0`. The list row's meta line stays empty for now (or, if `listMarketsForTeam` returns `createdAt`, use that as a relative time).

If during implementation you confirm `listMarketsForTeam` already includes pool aggregates (and adding them was a Plan 3/4 change you missed), you may use Option B (keep the YesNoChip block) without touching the data layer. Verify by reading `src/server/markets.ts` first.

- [ ] **Step 3: Build + tests + E2E**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
docker compose -f docker-compose.dev.yml up -d postgres-e2e && sleep 3
lsof -ti:3001 | xargs -r kill -9 2>/dev/null
source ~/.nvm/nvm.sh && nvm use && npm run test:e2e 2>&1 | tail -15
```

Bash timeout: 900000ms. Expected: 4 E2E specs pass. Watch for selector changes — the dashboard is heavily covered by E2E. Common breakage:
- The "Activity" link is still there (preserved).
- The "+ New market" link text changed from "New market" to "+ New market". If a Playwright spec uses `getByRole('link', { name: 'New market' })`, it will fail.

If a test fails with name-match, update the SPEC SELECTOR (not the link text). The plus-sign prefix is part of the design.

Fix by either:
1. Changing the spec to `getByRole('link', { name: /New market/ })` (regex match).
2. Changing the spec to `getByRole('link', { name: '+ New market' })`.

Pick (1) — regex is more resilient.

- [ ] **Step 4: Manual visual check**

Visit `http://localhost:3333/t/<some-team-id>` after signing in. Confirm:
- Header with "Team" label + name + button row
- 2-col stat tiles
- Markets card with header, tabs, hover rows
- Empty state if no markets in active tab

Toggle OS dark/light and confirm both modes look right.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/t/[teamId]/page.tsx" tests/e2e/  # if any e2e specs needed selector tweaks
git commit -m "$(cat <<'EOF'
feat(style): redesign team dashboard

Header gets a Team uppercase label + name + outline buttons.
Stat tiles row shows balance (with weekly spendable) and the
invite link in code-styled mono. Markets card with tabs uses
hover rows, StatusPill for locked/resolved/voided, and
EmptyState when a tab is empty.

Team and its doughnuts —
stat tiles, tabs, the markets list,
nothing yet? plant one.
EOF
)"
```

---

## Task 10: Market detail + create market

**Files:**
- Rewrite: `src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx`
- Modify: `src/app/(app)/t/[teamId]/markets/new/page.tsx`

- [ ] **Step 1: Read current files**

```bash
cat "src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx"
cat "src/app/(app)/t/[teamId]/markets/new/page.tsx"
```

The market detail page is the most complex page in the app. It currently contains: market info, pool breakdown, bet form, comments thread, comment server action, resolve/void UI for creator. **Preserve every server action and form field name verbatim.** This task is markup restructuring only.

- [ ] **Step 2: Restyle the market detail**

Apply this surrounding structure, slotting existing forms and actions in unchanged:

```tsx
import Link from 'next/link';
/* existing server-side imports */
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OddsBar } from '@/components/odds-bar';
import { StatusPill } from '@/components/status-pill';
import { EmptyState } from '@/components/empty-state';

/* existing types */

export default async function MarketDetailPage(/* existing props */) {
  /* existing data fetches — market, pools, comments, viewer, creator info */

  const total = yesPool + noPool;
  const yesShare = total === 0 ? 0 : yesPool / total;
  const noShare = total === 0 ? 0 : noPool / total;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/t/${teamId}`}
        className="text-xs text-fg-muted hover:text-fg w-fit"
      >
        ← Back to {team.name}
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill status={market.status} outcome={market.outcome ?? null} />
          <span className="text-[10px] text-fg-dim">
            Created by {creatorName} · {/* existing relative time helper */}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-fg leading-tight">
          {market.title}
        </h1>
        {market.description && (
          <p className="text-sm text-fg-muted">{market.description}</p>
        )}
      </div>

      <OddsBar
        yesShare={yesShare}
        noShare={noShare}
        yesPool={yesPool}
        noPool={noPool}
        total={total}
      />

      {/* BET FORM — only show when market is open and viewer is NOT the creator */}
      {market.status === 'open' && session?.user?.id !== market.creatorId && (
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
              Place a bet
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {/* EXISTING form / server action — preserved exactly */}
            {/* The form should use the same field names and action as before */}
            {/* Add a hint line below the input: */}
            <p className="text-[10px] text-fg-dim">
              Spendable this week: <span className="font-mono text-accent">🍩 {spendable}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* RESOLUTION UI — only for creator when market is locked and not yet resolved */}
      {market.status === 'locked' && session?.user?.id === market.creatorId && (
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
              Call it
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {/* EXISTING resolve form / buttons — preserved exactly */}
          </CardContent>
        </Card>
      )}

      {/* VOID UI — wherever it currently lives */}
      {/* preserve the existing condition and form */}

      {/* RESOLVED RESULT — when resolved, show the outcome prominently */}
      {market.status === 'resolved' && market.outcome && (
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">Outcome</div>
            <div
              className={`text-2xl font-bold mt-1 ${
                market.outcome === 'yes' ? 'text-accent' : 'text-danger'
              }`}
            >
              {market.outcome.toUpperCase()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* COMMENTS THREAD */}
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
            Comments ({comments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {comments.length === 0 ? (
            <p className="text-sm text-fg-muted">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((c) => (
                <li key={c.id}>
                  <div className="text-xs font-semibold text-fg">
                    {c.authorName}{' '}
                    <span className="font-normal text-fg-dim">
                      · {/* relative time helper */}
                    </span>
                  </div>
                  <div className="text-sm text-fg mt-0.5 whitespace-pre-wrap">
                    {c.body}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {/* EXISTING post-comment form — preserved exactly with name="body" input */}
          {/* It must keep `<input name="body">` and a `<button>Post</button>` so E2E selectors match */}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Important preservation rules:**
- The bet form: keep whatever field names and the server action are currently there.
- The comment form: keep `<input name="body">` and the button labeled `Post`. The social E2E spec targets these.
- The resolve form: keep whatever button labels are there (the void-and-leaderboard E2E spec may target them).
- The relative-time helper: reuse whatever the page already uses (e.g., an inline format helper or `date-fns` import).

- [ ] **Step 3: Restyle `src/app/(app)/t/[teamId]/markets/new/page.tsx`**

Wrap the existing form in a single Card:

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
/* existing imports — server action, types, etc. */

export default async function NewMarketPage(/* existing props */) {
  const { teamId } = await params;

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
      <Link href={`/t/${teamId}`} className="text-xs text-fg-muted hover:text-fg w-fit">
        ← Back
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New market</CardTitle>
          <CardDescription>Set the question, the lockup time, and when you'll call it.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* EXISTING form with EXISTING field labels — unchanged */}
        </CardContent>
      </Card>
    </div>
  );
}
```

Preserve the existing form labels exactly: `Title`, `Lockup time (bets close)`, `Resolution time (when you call it)`, `Create market`. E2E specs depend on these.

- [ ] **Step 4: Build + tests + E2E**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
docker compose -f docker-compose.dev.yml up -d postgres-e2e && sleep 3
lsof -ti:3001 | xargs -r kill -9 2>/dev/null
source ~/.nvm/nvm.sh && nvm use && npm run test:e2e 2>&1 | tail -15
```

Bash timeout: 900000ms. Expected: 4 E2E pass. The full-game-loop, void-and-leaderboard, and social-and-leaderboard specs all touch the market detail; they should still pass because every form field name and accessible button label is preserved.

If a spec fails on a selector match, fix the SPEC (regex relaxation) — do not weaken the new design back to old markup.

- [ ] **Step 5: Manual visual check**

Sign in, navigate to a market detail page. Confirm:
- StatusPill renders top-left
- OddsBar is the dominant element
- Bet form looks right (when viewer can bet)
- Comments thread renders with new author + timestamp styling

Test the OddsBar with: market with 0 bets (empty state), market with one side dominant (e.g., 100/0), market with even split.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/t/[teamId]/markets/[marketId]/page.tsx" "src/app/(app)/t/[teamId]/markets/new/page.tsx" tests/e2e/  # if any selectors changed
git commit -m "$(cat <<'EOF'
feat(style): redesign market detail and create-market

Status pill + meta + big title, OddsBar as the hero element,
bet form / resolution / void / outcome each get their own
small Card, comments thread with author + relative-time
styling. Create-market form wrapped in a single centered card.
All form field names and button labels preserved for E2E.

Hero bar split two —
teal yes, coral no, dark text,
pool sums on the side.
EOF
)"
```

---

## Task 11: Activity + Leaderboard + Profile pages

**Files:**
- Modify: `src/app/(app)/t/[teamId]/activity/page.tsx`
- Modify: `src/app/(app)/t/[teamId]/leaderboard/page.tsx`
- Modify: `src/app/(app)/t/[teamId]/me/page.tsx`

- [ ] **Step 1: Restyle the activity page**

Read the current activity page first; the data fetch (`getTeamActivityFeed` returning a discriminated `ActivityItem[]`) stays as-is. Replace the render with:

```tsx
import Link from 'next/link';
/* existing imports — auth, db, teams query, getTeamActivityFeed, ActivityItem */
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function iconFor(item: ActivityItem): string {
  switch (item.kind) {
    case 'market_created': return '📈';
    case 'market_resolved': return item.outcome === 'yes' ? '✅' : '❌';
    case 'comment_posted': return '💬';
  }
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

/* existing default export signature */
export default async function ActivityPage({ params }: ActivityPageProps) {
  const { teamId } = await params;
  /* existing session + team lookup */
  const items = await getTeamActivityFeed(db, teamId, 50);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">Activity</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{team.name}</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}`}>← Back to team</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No activity yet" description="Create a market or comment to see things show up here." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {items.map((item, i) => (
              <li key={`${item.kind}-${item.marketId}-${i}`}>
                <Link
                  href={`/t/${teamId}/markets/${item.marketId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors"
                >
                  <span className="text-lg" aria-hidden>{iconFor(item)}</span>
                  <span className="flex-1 text-sm text-fg truncate">{describeItem(item)}</span>
                  <span className="text-[10px] text-fg-dim whitespace-nowrap">
                    {item.at.toISOString().slice(0, 16).replace('T', ' ')} UTC
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
```

Preserve the `New market: ...`, `commented on ...` exact prefixes — the social E2E spec asserts on these.

- [ ] **Step 2: Restyle the leaderboard**

Read the current page; data fetch (`getLeaderboard` or similar) stays. Replace render with:

```tsx
import Link from 'next/link';
/* existing imports */
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';

function rankPrefix(i: number): string {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `${i + 1}.`;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function LeaderboardPage({ params }: LeaderboardPageProps) {
  const { teamId } = await params;
  /* existing data fetch — rows: { userId, email, balance, ... }[] */

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">Leaderboard</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{team.name}</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}`}>← Back to team</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nobody on the board yet" description="The leaderboard fills in as members resolve markets." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((row, i) => (
              <li key={row.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-mono text-fg-dim w-8 shrink-0">{rankPrefix(i)}</span>
                  <span className="text-sm text-fg truncate">{nameFromEmail(row.email)}</span>
                </div>
                <span className="text-sm font-mono font-semibold text-fg whitespace-nowrap">
                  🍩 {row.balance}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
```

If the leaderboard rows include extra columns (win rate, market count), add them in a `<span>` between name and balance.

- [ ] **Step 3: Restyle the profile**

Read current page; preserve `getProfile`, `getBalance`, `getSpendableAllowance` fetches. Replace render with:

```tsx
import Link from 'next/link';
/* existing imports */
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';

export default async function MePage({ params }: MePageProps) {
  /* existing data fetches — team, profile (bets + counts), balance, allowance */

  const winRate =
    profile.resolvedCount === 0
      ? null
      : Math.round((profile.winCount / profile.resolvedCount) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-dim font-semibold">You on</div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{team.name}</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${teamId}`}>← Back to team</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">Balance</div>
            <div className="text-2xl font-bold text-fg font-mono mt-0.5">🍩 {balance}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">This week</div>
            <div className="text-2xl font-bold text-fg font-mono mt-0.5">🍩 {allowance}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wide text-fg-dim font-semibold">Win rate</div>
            <div className="text-2xl font-bold text-fg font-mono mt-0.5">
              {winRate === null ? '—' : `${winRate}%`}
            </div>
            <div className="text-[10px] text-fg-dim mt-0.5">
              {profile.winCount} of {profile.resolvedCount} resolved
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-[11px] uppercase tracking-wide font-semibold">
            Bet history ({profile.bets.length})
          </CardTitle>
        </CardHeader>
        {profile.bets.length === 0 ? (
          <EmptyState title="No bets yet" description="Place one to start filling this in." />
        ) : (
          <ul className="divide-y divide-border">
            {profile.bets.map(({ bet, market }) => {
              const won = market.status === 'resolved' && market.outcome === bet.side;
              const lost = market.status === 'resolved' && market.outcome && market.outcome !== bet.side;
              const voided = market.status === 'voided';
              return (
                <li key={bet.id}>
                  <Link
                    href={`/t/${teamId}/markets/${market.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors"
                  >
                    <span className="text-sm text-fg truncate flex-1">{market.title}</span>
                    <span className="flex items-center gap-2 whitespace-nowrap text-xs">
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase border ${
                          bet.side === 'yes'
                            ? 'bg-accent-bg text-accent border-accent-border'
                            : 'bg-danger-bg text-danger border-danger-border'
                        }`}
                      >
                        {bet.side}
                      </span>
                      <span className="font-mono text-fg">🍩 {bet.amount}</span>
                      {won && <span className="text-accent font-semibold">✓ won</span>}
                      {lost && <span className="text-danger font-semibold">✗ lost</span>}
                      {voided && <span className="text-fg-dim">voided</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

Preserve the `You on {team.name}` heading text — the social E2E spec asserts `getByRole('heading', { name: /You on Social Crew/ })`.

- [ ] **Step 4: Build + tests + E2E**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
docker compose -f docker-compose.dev.yml up -d postgres-e2e && sleep 3
lsof -ti:3001 | xargs -r kill -9 2>/dev/null
source ~/.nvm/nvm.sh && nvm use && npm run test:e2e 2>&1 | tail -15
```

Bash timeout: 900000ms. Expected: 4 E2E pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/t/[teamId]/activity/page.tsx" "src/app/(app)/t/[teamId]/leaderboard/page.tsx" "src/app/(app)/t/[teamId]/me/page.tsx"
git commit -m "$(cat <<'EOF'
feat(style): redesign activity, leaderboard, profile pages

Activity gets an icon column (📈/✅/❌/💬) and hover rows.
Leaderboard uses 🥇🥈🥉 for top three and mono balance.
Profile gets a three-stat-tile row and a bet history list
with side chips and won/lost/voided markers.

Three small pages remade —
icons march down activity,
medals crown the board.
EOF
)"
```

---

## Task 12: Final verification + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Full unit + integration suite**

```bash
docker compose -f docker-compose.dev.yml up -d postgres
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
```

Bash timeout: 900000ms. Expected: 110 passing (101 pre-existing + 6 status-pill + 3 odds-bar).

- [ ] **Step 3: Full E2E suite**

```bash
docker compose -f docker-compose.dev.yml up -d postgres-e2e
sleep 3
lsof -ti:3001 | xargs -r kill -9 2>/dev/null
source ~/.nvm/nvm.sh && nvm use && npm run test:e2e 2>&1 | tail -15
```

Bash timeout: 900000ms. Expected: 4 passing.

- [ ] **Step 4: Manual sweep**

Start the dev server if it's not already running. In a browser at `http://localhost:3333`:

For both light AND dark OS modes, walk through:
1. `/` — landing page (🍩 hero, wordmark, tagline)
2. `/signin` — single centered card on gradient
3. `/check-email` — same pattern
4. `/teams` — team grid (or empty state)
5. `/teams/new` — centered card form
6. `/join/[code]` — centered card (if you have an invite URL)
7. `/t/[id]` — dashboard with stat tiles + markets card with tabs
8. `/t/[id]/markets/new` — centered card form
9. `/t/[id]/markets/[id]` — status pill + title + OddsBar + bet form + comments
10. `/t/[id]/activity` — icon list
11. `/t/[id]/leaderboard` — medal table
12. `/t/[id]/me` — three stat tiles + bet history

Resize the browser to 375×667 (iPhone SE). Look for:
- Horizontal scroll: NONE expected anywhere.
- Unreadable text: NONE expected (all body text ≥ 12px).
- Tap targets too close: NONE expected (buttons are h-8 minimum).
- Cards bleeding outside `max-w-4xl`: NONE expected.

If you find issues on a specific page, fix them with minimal tailwind class adjustments. Common fixes:
- Add `flex-wrap gap-2` to a header row that overflows.
- Stack a `flex` row to `flex-col sm:flex-row` for narrow screens.

If you make page edits, add them to the final commit.

- [ ] **Step 5: Update `README.md`**

Open `README.md`. Under `## Status`, add a new line below the existing v1-shipped line:

```markdown
- **Styling redesign:** Complete. Polymarket-vibe palette (dark navy + teal + coral), full responsive sweep, both light and dark OS modes.
```

Under `## Docs`, after the Plan 4 line, add:

```markdown
- Styling spec: `docs/superpowers/specs/2026-05-14-shadow-kpi-styling-design.md`
- Styling plan: `docs/superpowers/plans/2026-05-14-shadow-kpi-styling-plan.md`
```

- [ ] **Step 6: Final commit**

```bash
git add README.md  # plus any mobile-sweep page edits if you made any
git commit -m "$(cat <<'EOF'
docs: note styling redesign in README

Adds the styling-redesign status row and links to the spec
and plan. Mobile sweep applied during this task (see commit
body for any inline page fixes).

Final coat of paint —
two modes, mobile clean, README
points to where it lives.
EOF
)"
```

- [ ] **Step 7: Verify working tree**

```bash
git status
git log --oneline | head -15
```

Expected: clean tree. 12 commits added since the start of this plan.

---

## Definition of Done

- `npm run build` succeeds.
- `npm run typecheck` exits 0.
- 110 unit + integration tests pass (101 pre-existing + 9 added across StatusPill / OddsBar).
- 4 E2E specs pass.
- Every page in the 12-route sweep renders cleanly on both light and dark OS modes at desktop AND 375×667 mobile viewports.
- No `bg-primary`, `text-primary-foreground`, `bg-white`, `bg-black`, hex color, or hardcoded color string remains in `src/app/` or `src/components/` outside `globals.css`, `odds-bar.tsx` (which uses the gradient hex values intentionally), and the body-font-color fix in `layout.tsx`. (`grep -rE '#[0-9a-fA-F]{3,6}|bg-(white|black|primary|gray-)' src/app src/components` should turn up only the two intentional exceptions.)
- The Polymarket-vibe redesign visibly distinguishes shadow-kpi from default Tailwind starter aesthetics.
