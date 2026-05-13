import { and, desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Db } from '@/server/db/client';
import { teams, memberships, ledgerEntries, users, type Team } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { getBalance, grantInitialAllowance } from '@/server/ledger';

const INVITE_CODE_LENGTH = 10;

export interface CreateTeamInput {
  name: string;
  creatorId: string;
}

export async function createTeam(db: Db, input: CreateTeamInput): Promise<Team> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'Team name cannot be empty.');
  }
  return await db.transaction(async (tx) => {
    const [team] = await tx
      .insert(teams)
      .values({ name, inviteCode: nanoid(INVITE_CODE_LENGTH) })
      .returning();
    await tx
      .insert(memberships)
      .values({ userId: input.creatorId, teamId: team.id });
    await grantInitialAllowance(tx as unknown as Db, {
      userId: input.creatorId,
      teamId: team.id,
    });
    return team;
  });
}

export async function findTeamByInviteCode(db: Db, code: string): Promise<Team | null> {
  const rows = await db.select().from(teams).where(eq(teams.inviteCode, code)).limit(1);
  return rows[0] ?? null;
}

export interface JoinByInviteCodeInput {
  userId: string;
  inviteCode: string;
}

export async function joinByInviteCode(
  db: Db,
  input: JoinByInviteCodeInput,
): Promise<Team> {
  return await db.transaction(async (tx) => {
    const team = await findTeamByInviteCode(tx as unknown as Db, input.inviteCode);
    if (!team) {
      throw new DomainError('INVITE_CODE_INVALID', 'No team found for that invite code.');
    }

    const existing = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, input.userId), eq(memberships.teamId, team.id)))
      .limit(1);
    if (existing.length > 0) {
      throw new DomainError('ALREADY_MEMBER', "You're already a member of this team.");
    }

    await tx.insert(memberships).values({ userId: input.userId, teamId: team.id });
    await grantInitialAllowance(tx as unknown as Db, {
      userId: input.userId,
      teamId: team.id,
    });
    return team;
  });
}

export interface RotateInviteCodeInput {
  teamId: string;
  userId: string;
}

export async function rotateInviteCode(
  db: Db,
  input: RotateInviteCodeInput,
): Promise<Team> {
  const membership = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, input.userId), eq(memberships.teamId, input.teamId)))
    .limit(1);
  if (membership.length === 0) {
    throw new DomainError('NOT_TEAM_MEMBER', 'You are not a member of this team.');
  }
  const [updated] = await db
    .update(teams)
    .set({ inviteCode: nanoid(INVITE_CODE_LENGTH) })
    .where(eq(teams.id, input.teamId))
    .returning();
  return updated;
}

export interface MembershipRow {
  team: Team;
  balance: number;
}

export async function listMembershipsForUser(
  db: Db,
  userId: string,
): Promise<MembershipRow[]> {
  const rows = await db
    .select({ team: teams })
    .from(memberships)
    .innerJoin(teams, eq(memberships.teamId, teams.id))
    .where(eq(memberships.userId, userId));

  const result: MembershipRow[] = [];
  for (const r of rows) {
    const balance = await getBalance(db, { userId, teamId: r.team.id });
    result.push({ team: r.team, balance });
  }
  return result;
}

export interface LeaderboardRow {
  userId: string;
  email: string;
  balance: number;
}

export async function getTeamLeaderboard(
  db: Db,
  teamId: string,
): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      balance: sql<number>`COALESCE(SUM(${ledgerEntries.amount}) FILTER (WHERE ${ledgerEntries.teamId} = ${teamId}), 0)::int`,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(
      ledgerEntries,
      and(
        eq(ledgerEntries.userId, users.id),
        eq(ledgerEntries.teamId, teamId),
      ),
    )
    .where(eq(memberships.teamId, teamId))
    .groupBy(users.id, users.email)
    .orderBy(desc(sql`COALESCE(SUM(${ledgerEntries.amount}) FILTER (WHERE ${ledgerEntries.teamId} = ${teamId}), 0)`));

  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    balance: r.balance ?? 0,
  }));
}
