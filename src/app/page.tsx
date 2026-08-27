import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <main className="force-dark min-h-screen flex items-center justify-center px-6 bg-[radial-gradient(ellipse_at_top,_var(--surface-elevated),_var(--bg))]">
      <div className="flex flex-col items-center gap-6 text-center max-w-lg">
        <Image
          src="/op-wings.png"
          alt="OptionsPlayers"
          width={480}
          height={120}
          priority
          className="w-full max-w-sm h-auto select-none"
        />
        <h1 className="sr-only">OptionsPlayers</h1>
        <p className="font-display text-xl sm:text-2xl text-fg-muted italic">
          Platform and Trading Community.
        </p>
        <p className="text-base text-fg-dim">
          Bet coins on what happens at work.
        </p>
        <Button asChild size="default">
          <Link href="/signin">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
