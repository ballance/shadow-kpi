import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db/client';
import { memberships } from '@/server/db/schema';

interface TeamLayoutProps {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}

export default async function TeamLayout({ children, params }: TeamLayoutProps) {
  const session = await auth();
  if (!session?.user) redirect('/signin');
  const { teamId } = await params;

  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, session.user.id), eq(memberships.teamId, teamId)))
    .limit(1);
  if (rows.length === 0) redirect('/teams');

  return <>{children}</>;
}
