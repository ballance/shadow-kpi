import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import {
  memberships, slackInstalls, slackTeamChannels, teams,
} from '@/server/db/schema';
import { listWorkspaceChannels } from '@/server/slack/channels';
import { slackClient } from '@/server/slack/api';
import { SlackChannelPicker } from './SlackChannelPicker';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ installed?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/signin');
  const { teamId } = await params;
  const { installed } = await searchParams;

  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .innerJoin(
      memberships,
      and(eq(memberships.teamId, teams.id), eq(memberships.userId, session.user.id)),
    )
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) notFound();

  const installs = await db
    .select({
      workspaceId: slackInstalls.workspaceId,
      workspaceName: slackInstalls.workspaceName,
    })
    .from(slackInstalls)
    .where(isNull(slackInstalls.revokedAt));

  const [existingMapping] = await db
    .select()
    .from(slackTeamChannels)
    .where(eq(slackTeamChannels.teamId, teamId))
    .limit(1);

  const tokenEncKey = process.env.SLACK_TOKEN_ENC_KEY;
  let channels: Array<{ id: string; name: string }> = [];
  const pickerWorkspace = existingMapping?.workspaceId ?? installs[0]?.workspaceId;
  if (pickerWorkspace && tokenEncKey) {
    channels = await listWorkspaceChannels(db, pickerWorkspace, slackClient, tokenEncKey);
  }

  return (
    <main className="container mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Slack integration</h1>
      <p className="text-muted-foreground">
        Post {team.name} market events into a Slack channel.
      </p>

      {installs.length === 0 && (
        <a
          href={`/api/slack/install?team_id=${teamId}`}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-primary-foreground"
        >
          Add to Slack
        </a>
      )}

      {installs.length > 0 && (
        <SlackChannelPicker
          teamId={teamId}
          workspaces={installs}
          channels={channels}
          existingMapping={existingMapping ?? null}
          justInstalled={installed === '1'}
        />
      )}
    </main>
  );
}
