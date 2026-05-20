import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { markUninstalled } from '@/server/slack/install';
import { verifySlackSignature } from '@/server/slack/verify';

export const dynamic = 'force-dynamic';

interface EventEnvelope {
  type: string;
  challenge?: string;
  team_id?: string;
  event?: { type: string };
}

export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  const rawBody = await request.text();
  const ts = request.headers.get('x-slack-request-timestamp') ?? '';
  const sig = request.headers.get('x-slack-signature') ?? '';
  const ok = verifySlackSignature({
    rawBody, timestamp: ts, signature: sig, signingSecret,
  });
  if (!ok) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  const env = JSON.parse(rawBody) as EventEnvelope;
  if (env.type === 'url_verification' && env.challenge) {
    return NextResponse.json({ challenge: env.challenge });
  }
  if (env.event?.type === 'app_uninstalled' && env.team_id) {
    await markUninstalled(db, env.team_id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true });
}
