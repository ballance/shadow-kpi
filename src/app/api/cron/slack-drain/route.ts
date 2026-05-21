import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { drainOutbox } from '@/server/slack/outbox';
import { slackClient } from '@/server/slack/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'CRON_SECRET not configured.' } },
      { status: 500 },
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: 'NOT_AUTHENTICATED', message: 'Bad cron auth.' } },
      { status: 401 },
    );
  }

  const tokenEncKey = process.env.SLACK_TOKEN_ENC_KEY;
  if (!tokenEncKey) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'SLACK_TOKEN_ENC_KEY not configured.' } },
      { status: 500 },
    );
  }

  const result = await drainOutbox(db, {
    api: slackClient,
    tokenEncKey,
    batchLimit: 200,
    wallClockBudgetMs: 50_000,
    sendIntervalMs: 1100,
  });

  return NextResponse.json(result);
}
