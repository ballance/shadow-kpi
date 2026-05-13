import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { createTeam } from '@/server/teams';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Schema = z.object({ name: z.string().min(1).max(80) });

export default async function NewTeamPage() {
  async function action(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');
    const parsed = Schema.safeParse({ name: formData.get('name') });
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'Team name is required.');
    }
    const team = await createTeam(db, {
      name: parsed.data.name,
      creatorId: session.user.id,
    });
    redirect(`/t/${team.id}`);
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Create a team</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Team name</Label>
            <Input id="name" name="name" required maxLength={80} />
          </div>
          <Button type="submit">Create team</Button>
        </form>
      </CardContent>
    </Card>
  );
}
