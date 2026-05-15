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
