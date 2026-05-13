import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { createMarket } from '@/server/markets';
import { DomainError } from '@/server/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface NewMarketPageProps {
  params: Promise<{ teamId: string }>;
}

const FormSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  lockupAt: z.string().min(1),
  resolvesAt: z.string().min(1),
});

export default async function NewMarketPage({ params }: NewMarketPageProps) {
  const { teamId } = await params;

  async function action(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user) throw new DomainError('NOT_AUTHENTICATED', 'Please sign in.');

    const parsed = FormSchema.safeParse({
      title: formData.get('title'),
      description: formData.get('description') ?? undefined,
      lockupAt: formData.get('lockupAt'),
      resolvesAt: formData.get('resolvesAt'),
    });
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'Please fill all required fields.');
    }

    const lockupAt = new Date(parsed.data.lockupAt);
    const resolvesAt = new Date(parsed.data.resolvesAt);
    if (Number.isNaN(lockupAt.getTime()) || Number.isNaN(resolvesAt.getTime())) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid date format.');
    }

    const market = await createMarket(db, {
      teamId,
      creatorId: session.user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      lockupAt,
      resolvesAt,
    });
    redirect(`/t/${teamId}/markets/${market.id}`);
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>New market</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={200}
              placeholder="Will the deploy ship by EOD Friday?"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              name="description"
              maxLength={2000}
              placeholder="Pacific time, our deploy script, no rollbacks."
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lockupAt">Lockup time (bets close)</Label>
            <Input id="lockupAt" name="lockupAt" type="datetime-local" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="resolvesAt">Resolution time (when you call it)</Label>
            <Input id="resolvesAt" name="resolvesAt" type="datetime-local" required />
          </div>
          <Button type="submit">Create market</Button>
        </form>
      </CardContent>
    </Card>
  );
}
