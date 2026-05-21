import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { memberships } from '@/server/db/schema';
import { newNonce, signStateToken } from '@/server/slack/state';

export const dynamic = 'force-dynamic';

const SCOPES = [
  'chat:write',
  'chat:write.public',
  'im:write',
  'team:read',
  'users:read',
  'channels:read',
].join(',');

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

  const clientId = process.env.SLACK_CLIENT_ID;
  const stateKey = process.env.SLACK_TOKEN_ENC_KEY;
  const publicUrl = process.env.SLACK_APP_PUBLIC_URL ?? process.env.NEXTAUTH_URL;
  if (!clientId || !stateKey || !publicUrl) {
    return NextResponse.json({ error: 'slack not configured' }, { status: 500 });
  }
  const redirectUri = `${publicUrl}/api/slack/oauth/callback`;
  const nonce = newNonce();
  const stateToken = signStateToken({ kind: 'install', teamId, nonce }, stateKey);

  // In E2E mode bypass the real Slack OAuth and go straight to the callback.
  if (process.env.E2E_MODE === '1') {
    const cb = new URL(redirectUri);
    cb.searchParams.set('code', 'e2e-mock-code');
    cb.searchParams.set('state', stateToken);
    const e2eRes = NextResponse.redirect(cb);
    e2eRes.cookies.set('slack_oauth_nonce', nonce, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/slack',
      maxAge: 600,
    });
    return e2eRes;
  }

  const slackUrl = new URL('https://slack.com/oauth/v2/authorize');
  slackUrl.searchParams.set('client_id', clientId);
  slackUrl.searchParams.set('scope', SCOPES);
  slackUrl.searchParams.set('redirect_uri', redirectUri);
  slackUrl.searchParams.set('state', stateToken);

  const res = NextResponse.redirect(slackUrl);
  res.cookies.set('slack_oauth_nonce', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/slack',
    maxAge: 600,
  });
  return res;
}
