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
