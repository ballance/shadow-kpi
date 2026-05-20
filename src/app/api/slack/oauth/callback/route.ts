import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { upsertInstall } from '@/server/slack/install';
import { verifyStateToken, type InstallStatePayload } from '@/server/slack/state';
import { slackHttpClient } from '@/server/slack/api';

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
  const cookieNonce = request.headers
    .get('cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith('slack_oauth_nonce='))
    ?.split('=')[1];
  const stateKey = process.env.SLACK_TOKEN_ENC_KEY;
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const publicUrl = process.env.SLACK_APP_PUBLIC_URL ?? process.env.NEXTAUTH_URL;
  if (!stateKey || !clientId || !clientSecret || !publicUrl) {
    return NextResponse.json({ error: 'slack not configured' }, { status: 500 });
  }
  if (!cookieNonce) {
    return NextResponse.json({ error: 'missing csrf cookie' }, { status: 400 });
  }
  const verified = verifyStateToken<InstallStatePayload>(state, stateKey, cookieNonce);
  if (!verified || verified.kind !== 'install') {
    return NextResponse.json({ error: 'invalid state' }, { status: 400 });
  }

  const redirectUri = `${publicUrl}/api/slack/oauth/callback`;
  const exchange = await slackHttpClient.oauthV2Access({
    clientId, clientSecret, code, redirectUri,
  });
  if (!exchange.ok || !exchange.accessToken) {
    return NextResponse.json(
      { error: `slack exchange failed: ${exchange.error}` },
      { status: 502 },
    );
  }

  await upsertInstall(db, {
    workspaceId: exchange.teamId,
    workspaceName: exchange.teamName,
    accessToken: exchange.accessToken,
    botUserId: exchange.botUserId,
    installerUserId: session.user.id,
    tokenEncKey: stateKey,
  });

  return NextResponse.redirect(
    new URL(`/t/${verified.teamId}/settings/slack?installed=1`, request.url),
  );
}
