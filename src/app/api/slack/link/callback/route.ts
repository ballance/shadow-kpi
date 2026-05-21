import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { users, slackTeamChannels } from '@/server/db/schema';
import { upsertUserLink } from '@/server/slack/link';
import { verifyStateToken, type LinkStatePayload } from '@/server/slack/state';
import { slackHttpClient } from '@/server/slack/api';
import { enqueueOutboxMessages } from '@/server/slack/outbox';
import { plainTextMessage } from '@/server/slack/blocks';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/signin', request.url));
  }
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return NextResponse.json({ error: 'missing code or state' }, { status: 400 });
  }
  const cookieNonce = (await cookies()).get('slack_link_nonce')?.value;
  const stateKey = process.env.SLACK_TOKEN_ENC_KEY;
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const publicUrl = process.env.SLACK_APP_PUBLIC_URL ?? process.env.NEXTAUTH_URL;
  if (!stateKey || !clientId || !clientSecret || !publicUrl) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  if (!cookieNonce) {
    return NextResponse.json({ error: 'missing csrf cookie' }, { status: 400 });
  }
  const verified = verifyStateToken<LinkStatePayload>(state, stateKey, cookieNonce);
  if (!verified || verified.kind !== 'link') {
    return NextResponse.json({ error: 'invalid state' }, { status: 400 });
  }
  if (verified.userId !== session.user.id) {
    return NextResponse.json({ error: 'session/state mismatch' }, { status: 400 });
  }

  const [mapping] = await db
    .select({ workspaceId: slackTeamChannels.workspaceId, channelId: slackTeamChannels.channelId })
    .from(slackTeamChannels)
    .where(eq(slackTeamChannels.teamId, verified.teamId))
    .limit(1);
  if (!mapping) {
    return NextResponse.json({ error: 'team has no slack workspace' }, { status: 400 });
  }

  const redirectUri = `${publicUrl}/api/slack/link/callback`;
  const exchange = await slackHttpClient.openidConnectToken({
    clientId, clientSecret, code, redirectUri,
  });
  if (!exchange.ok || !exchange.accessToken) {
    return NextResponse.json(
      { error: `slack token exchange failed: ${exchange.error}` },
      { status: 502 },
    );
  }

  // Claims come from the userinfo endpoint over TLS, not from a self-decoded
  // id_token. Slack signs the response server-side and we trust the TLS
  // connection the same way oauth.v2.access does. Avoids the JWKS dance.
  const claims = await slackHttpClient.openidConnectUserInfo({
    token: exchange.accessToken,
  });
  if (!claims.ok) {
    return NextResponse.json(
      { error: `slack userinfo failed: ${claims.error}` },
      { status: 502 },
    );
  }
  if (claims.slackTeamId !== mapping.workspaceId) {
    return NextResponse.redirect(
      new URL('/profile/linked-accounts?error=workspace_mismatch', request.url),
    );
  }
  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!u || !claims.email || u.email.toLowerCase() !== claims.email.toLowerCase()) {
    return NextResponse.redirect(
      new URL('/profile/linked-accounts?error=email_mismatch', request.url),
    );
  }

  await upsertUserLink(db, {
    userId: session.user.id,
    workspaceId: mapping.workspaceId,
    slackUserId: claims.slackUserId,
  });

  await enqueueOutboxMessages(db, [
    {
      workspaceId: mapping.workspaceId,
      targetKind: 'dm',
      targetId: claims.slackUserId,
      payload: plainTextMessage(
        "You're linked to shadow-kpi. You'll get DMs when your bets resolve and when your markets lock.",
      ),
      dedupKey: null,
    },
  ]);

  return NextResponse.redirect(new URL('/profile/linked-accounts?linked=1', request.url));
}
