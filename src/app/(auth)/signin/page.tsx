import { redirect } from 'next/navigation';
import { signIn, auth } from '@/server/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) redirect(params.callbackUrl ?? '/teams');

  async function action(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    const callbackUrl = String(formData.get('callbackUrl') ?? '/teams');
    if (!email) return;
    await signIn('resend', { email, redirectTo: callbackUrl });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in to shadow-kpi</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <input
              type="hidden"
              name="callbackUrl"
              value={params.callbackUrl ?? '/teams'}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit">Send me a magic link</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
