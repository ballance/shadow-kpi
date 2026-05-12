import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <h1 className="text-4xl font-bold">shadow-kpi</h1>
      <p className="text-muted-foreground">Bet doughnuts on what happens at work.</p>
      <Link
        href="/signin"
        className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90"
      >
        Sign in
      </Link>
    </main>
  );
}
