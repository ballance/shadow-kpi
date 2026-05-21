import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { memberships, slackInstalls, slackTeamChannels } from '@/server/db/schema';
import { newNonce, signStateToken, type LinkStatePayload } from '@/server/slack/state';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/signin', request.url));
  }
  const url = new URL(request.url);
  const teamId = url.searchParams.get('team_id');
  if (!teamId) {
    return NextResponse.json({ error: 'team_id required' }, { status: 400 });
  }
  const member = await db
    .select({ teamId: memberships.teamId })
    .from(memberships)
    .where(and(eq(memberships.userId, session.user.id), eq(memberships.teamId, teamId)))
    .limit(1);
  if (member.length === 0) {
    return NextResponse.json({ error: 'not a team member' }, { status: 403 });
  }
  const [mapping] = await db
    .select({ workspaceId: slackTeamChannels.workspaceId })
    .from(slackTeamChannels)
    .innerJoin(
      slackInstalls,
      and(
        eq(slackInstalls.workspaceId, slackTeamChannels.workspaceId),
        isNull(slackInstalls.revokedAt),
      ),
    )
    .where(eq(slackTeamChannels.teamId, teamId))
    .limit(1);
  if (!mapping) {
    return NextResponse.json({ error: 'team has no slack workspace' }, { status: 400 });
  }
  const clientId = process.env.SLACK_CLIENT_ID;
  const stateKey = process.env.SLACK_TOKEN_ENC_KEY;
  const publicUrl = process.env.SLACK_APP_PUBLIC_URL ?? process.env.NEXTAUTH_URL;
  if (!clientId || !stateKey || !publicUrl) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  const redirectUri = `${publicUrl}/api/slack/link/callback`;
  const nonce = newNonce();
  const linkPayload: Omit<LinkStatePayload, 'exp'> = {
    kind: 'link',
    userId: session.user.id,
    teamId,
    nonce,
  };
  const stateToken = signStateToken(linkPayload, stateKey);

  // In E2E mode bypass the real Slack OIDC and go straight to the callback.
  if (process.env.E2E_MODE === '1') {
    const cb = new URL(redirectUri);
    cb.searchParams.set('code', 'e2e-mock-code');
    cb.searchParams.set('state', stateToken);
    const e2eRes = NextResponse.redirect(cb);
    e2eRes.cookies.set('slack_link_nonce', nonce, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/slack',
      maxAge: 600,
    });
    return e2eRes;
  }

  const slackUrl = new URL('https://slack.com/openid/connect/authorize');
  slackUrl.searchParams.set('response_type', 'code');
  slackUrl.searchParams.set('client_id', clientId);
  slackUrl.searchParams.set('scope', 'openid email profile');
  slackUrl.searchParams.set('redirect_uri', redirectUri);
  slackUrl.searchParams.set('state', stateToken);

  const res = NextResponse.redirect(slackUrl);
  res.cookies.set('slack_link_nonce', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/slack',
    maxAge: 600,
  });
  return res;
}
