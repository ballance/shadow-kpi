import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { findTeamByInviteCode, joinByInviteCode } from '@/server/teams';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
      <main className="mx-auto max-w-md px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Invite not found</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            That invite link looks broken. Ask whoever shared it for a new one.
          </CardContent>
        </Card>
      </main>
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
    <main className="mx-auto max-w-md px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Join {team.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground">
            You're about to join <strong>{team.name}</strong>. You'll get 12 fresh doughnuts to start.
          </p>
          <form action={joinAction}>
            <Button type="submit">Join team</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
