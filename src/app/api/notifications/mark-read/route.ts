import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { markAllRead } from '@/server/notifications';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'NOT_AUTHENTICATED', message: 'Sign in required.' } },
      { status: 401 },
    );
  }
  const updated = await markAllRead(db, session.user.id);
  return NextResponse.json({ updated });
}
