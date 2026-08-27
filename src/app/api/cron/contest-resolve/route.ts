import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { resolveDueContests } from '@/server/contests/contests';

export const dynamic = 'force-dynamic';

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

  await resolveDueContests(db);
  return NextResponse.json({ ok: true });
}
