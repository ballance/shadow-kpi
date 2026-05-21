import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import {
  memberships, slackInstalls, slackTeamChannels, slackUserLinks, teams,
} from '@/server/db/schema';
import { LinkedAccountsClient } from './LinkedAccountsClient';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; linked?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/signin');
  const { error, linked } = await searchParams;
  const userId = session.user.id;

  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      workspaceId: slackInstalls.workspaceId,
      workspaceName: slackInstalls.workspaceName,
    })
    .from(teams)
    .innerJoin(
      memberships,
      and(eq(memberships.teamId, teams.id), eq(memberships.userId, userId)),
    )
    .innerJoin(slackTeamChannels, eq(slackTeamChannels.teamId, teams.id))
    .innerJoin(
      slackInstalls,
      and(
        eq(slackInstalls.workspaceId, slackTeamChannels.workspaceId),
        isNull(slackInstalls.revokedAt),
      ),
    );

  const workspaceIds = Array.from(new Set(rows.map((r) => r.workspaceId)));
  const existingLinks =
    workspaceIds.length === 0
      ? []
      : await db
          .select({
            workspaceId: slackUserLinks.workspaceId,
            slackUserId: slackUserLinks.slackUserId,
          })
          .from(slackUserLinks)
          .where(
            and(
              eq(slackUserLinks.userId, userId),
              inArray(slackUserLinks.workspaceId, workspaceIds),
            ),
          );

  return (
    <main className="container mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Linked accounts</h1>
      {error === 'workspace_mismatch' && (
        <div className="rounded border border-red-600 p-3 text-sm text-red-700">
          You signed into a different Slack workspace than your team&apos;s. Try again from the
          matching workspace.
        </div>
      )}
      {error === 'email_mismatch' && (
        <div className="rounded border border-red-600 p-3 text-sm text-red-700">
          The Slack email didn&apos;t match your shadow-kpi email. Make sure you&apos;re signed
          into Slack with the same address.
        </div>
      )}
      {linked === '1' && (
        <div className="rounded border border-green-600 p-3 text-sm text-green-700">
          Linked. Check your Slack DMs for a confirmation.
        </div>
      )}
      <LinkedAccountsClient
        teams={rows.map((r) => ({
          teamId: r.teamId,
          teamName: r.teamName,
          workspaceId: r.workspaceId,
          workspaceName: r.workspaceName,
          linked: existingLinks.find((l) => l.workspaceId === r.workspaceId) ?? null,
        }))}
      />
    </main>
  );
}
