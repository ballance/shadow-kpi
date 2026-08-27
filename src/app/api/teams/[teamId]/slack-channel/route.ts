import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { memberships, slackInstalls } from '@/server/db/schema';
import {
  clearTeamChannel,
  listWorkspaceChannels,
  setTeamChannel,
} from '@/server/slack/channels';
import { slackHttpClient } from '@/server/slack/api';
import { enqueueOutboxMessages } from '@/server/slack/outbox';
import { plainTextMessage } from '@/server/slack/blocks';

export const dynamic = 'force-dynamic';

// channelName is NOT accepted from the client — it's re-fetched server-side
// from Slack's canonical channel list. Allowing the client to set it would
// let any team member inject arbitrary text into the channel confirmation
// message that goes back into the same Slack workspace.
const SetBody = z.object({
  workspaceId: z.string(),
  channelId: z.string(),
});

// TODO(slack-admin-role): All team members can currently set / clear the
// Slack channel. Once OptionsPlayers grows a membership role column, gate
// these endpoints on the admin role.
async function checkMember(userId: string, teamId: string): Promise<boolean> {
  const rows = await db
    .select({ teamId: memberships.teamId })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.teamId, teamId)))
    .limit(1);
  return rows.length > 0;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }
  const { teamId } = await params;
  if (!(await checkMember(session.user.id, teamId))) {
    return NextResponse.json({ error: 'NOT_TEAM_MEMBER' }, { status: 403 });
  }
  const body = SetBody.parse(await request.json());
  const [install] = await db
    .select({ id: slackInstalls.id, revokedAt: slackInstalls.revokedAt })
    .from(slackInstalls)
    .where(eq(slackInstalls.workspaceId, body.workspaceId))
    .limit(1);
  if (!install || install.revokedAt) {
    return NextResponse.json({ error: 'WORKSPACE_NOT_INSTALLED' }, { status: 400 });
  }

  // Resolve the canonical channel name server-side. This both validates
  // that the channel actually belongs to the workspace and prevents the
  // client from supplying a forged display name.
  const tokenEncKey = process.env.SLACK_TOKEN_ENC_KEY;
  if (!tokenEncKey) {
    return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 500 });
  }
  const channels = await listWorkspaceChannels(
    db,
    body.workspaceId,
    slackHttpClient,
    tokenEncKey,
  );
  const channel = channels.find((c) => c.id === body.channelId);
  if (!channel) {
    return NextResponse.json({ error: 'CHANNEL_NOT_FOUND' }, { status: 400 });
  }

  await setTeamChannel(db, {
    teamId,
    workspaceId: body.workspaceId,
    channelId: channel.id,
    channelName: channel.name,
    configuredByUserId: session.user.id,
  });

  await enqueueOutboxMessages(db, [
    {
      workspaceId: body.workspaceId,
      targetKind: 'channel',
      targetId: channel.id,
      payload: plainTextMessage(
        `OptionsPlayers is now wired to this channel for *${channel.name}*. You'll see new markets, locks, and resolutions here.`,
      ),
      dedupKey: null,
    },
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }
  const { teamId } = await params;
  if (!(await checkMember(session.user.id, teamId))) {
    return NextResponse.json({ error: 'NOT_TEAM_MEMBER' }, { status: 403 });
  }
  await clearTeamChannel(db, teamId);
  return NextResponse.json({ ok: true });
}
