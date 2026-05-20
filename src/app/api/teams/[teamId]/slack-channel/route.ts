import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { memberships, slackInstalls } from '@/server/db/schema';
import { clearTeamChannel, setTeamChannel } from '@/server/slack/channels';
import { enqueueOutboxMessages } from '@/server/slack/outbox';
import { plainTextMessage } from '@/server/slack/blocks';

export const dynamic = 'force-dynamic';

const SetBody = z.object({
  workspaceId: z.string(),
  channelId: z.string(),
  channelName: z.string(),
});

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

  await setTeamChannel(db, {
    teamId,
    workspaceId: body.workspaceId,
    channelId: body.channelId,
    channelName: body.channelName,
    configuredByUserId: session.user.id,
  });

  await enqueueOutboxMessages(db, [
    {
      workspaceId: body.workspaceId,
      targetKind: 'channel',
      targetId: body.channelId,
      payload: plainTextMessage(
        `shadow-kpi is now wired to this channel for *${body.channelName}*. You'll see new markets, locks, and resolutions here.`,
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
