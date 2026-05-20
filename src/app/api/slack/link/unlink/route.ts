import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { deleteUserLink } from '@/server/slack/link';

export const dynamic = 'force-dynamic';

const Body = z.object({ workspaceId: z.string() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }
  const { workspaceId } = Body.parse(await request.json());
  await deleteUserLink(db, { userId: session.user.id, workspaceId });
  return NextResponse.json({ ok: true });
}
