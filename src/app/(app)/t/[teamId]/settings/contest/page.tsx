import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { getTeamContestConfig, upsertTeamContestConfig } from '@/server/contests/contests';
import { parseSymbols, parseTiers } from '@/server/contests/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface ContestSettingsPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function ContestSettingsPage({ params, searchParams }: ContestSettingsPageProps) {
  const session = await auth();
  if (!session?.user) redirect('/signin');
  const { teamId } = await params;
  const { error } = await searchParams;

  const config = await getTeamContestConfig(db, teamId);
  const symbols: string[] = config ? JSON.parse(config.symbols) : [];
  const prizeTiers: number[] = config ? JSON.parse(config.prizeTiers) : [25, 15, 10];

  async function saveAction(formData: FormData) {
    'use server';
    const actionSession = await auth();
    if (!actionSession?.user) redirect('/signin');
    try {
      await upsertTeamContestConfig(db, teamId, {
        enabled: formData.get('enabled') === 'on',
        symbols: parseSymbols(String(formData.get('symbols'))),
        prizeTiers: parseTiers(String(formData.get('prizeTiers'))),
      });
    } catch {
      redirect(`/t/${teamId}/settings/contest?error=1`);
    }
    revalidatePath(`/t/${teamId}/settings/contest`);
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily price contest</CardTitle>
          <CardDescription>
            Pick a rotating watchlist and prize split for your team&apos;s daily closing-price guess.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
              Couldn&apos;t save settings. Check your symbols and prize tiers.
            </div>
          )}
          <form action={saveAction} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <input
                id="enabled"
                name="enabled"
                type="checkbox"
                defaultChecked={config?.enabled ?? false}
                className="h-4 w-4 rounded border-border-strong"
              />
              <Label htmlFor="enabled">Enable daily contests for this team</Label>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="symbols">Symbols (comma-separated, rotates daily)</Label>
              <Input
                id="symbols"
                name="symbols"
                defaultValue={symbols.join(', ')}
                placeholder="AAPL, MSFT, SPY"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="prizeTiers">Prize tiers (coins, in place order)</Label>
              <Input
                id="prizeTiers"
                name="prizeTiers"
                defaultValue={prizeTiers.join(', ')}
                placeholder="25, 15, 10"
              />
            </div>

            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
