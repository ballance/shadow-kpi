import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { findTeamByInviteCode, joinByInviteCode } from '@/server/teams';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface JoinPageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { code } = await params;
  const session = await auth();

  if (!session?.user) {
    const callbackUrl = encodeURIComponent(`/join/${code}`);
    redirect(`/signin?callbackUrl=${callbackUrl}`);
  }

  const team = await findTeamByInviteCode(db, code);
  if (!team) {
    return (
      <div className="flex flex-col items-center gap-4 max-w-md mx-auto py-12">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Invite not found</CardTitle>
            <CardDescription>That invite link looks broken.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-fg-muted">
            Ask whoever shared it for a new one, or{' '}
            <Link href="/teams" className="underline hover:text-fg">go back to your teams</Link>.
          </CardContent>
        </Card>
      </div>
    );
  }

  async function joinAction() {
    'use server';
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    try {
      await joinByInviteCode(db, { userId: session.user.id, inviteCode: code });
    } catch (err) {
      if (err instanceof DomainError && err.code === 'ALREADY_MEMBER') {
        // fine — fall through to redirect
      } else {
        throw err;
      }
    }
    if (team) redirect(`/t/${team.id}`);
  }

  return (
    <div className="flex flex-col items-center gap-4 max-w-md mx-auto py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">Join {team.name}</CardTitle>
          <CardDescription>Click the button below to accept the invite.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">
            You're about to join <strong className="text-fg">{team.name}</strong>. You'll get 12 fresh doughnuts to start.
          </p>
          <form action={joinAction}>
            <Button type="submit">Join team</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
