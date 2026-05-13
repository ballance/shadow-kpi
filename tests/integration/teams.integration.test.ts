import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import {
  createTeam,
  findTeamByInviteCode,
  joinByInviteCode,
  listMembershipsForUser,
  rotateInviteCode,
} from '@/server/teams';
import { users, memberships, ledgerEntries } from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { WEEKLY_ALLOWANCE } from '@/server/ledger';

describe('teams service', () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await startTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    await handle.truncateAll();
  });

  async function makeUser(id: string, email: string) {
    await handle.db.insert(users).values({ id, email });
  }

  describe('createTeam', () => {
    it('creates a team, assigns a random invite code, and makes the creator a member', async () => {
      await makeUser('u1', 'u1@example.com');
      const team = await createTeam(handle.db, { name: 'Team A', creatorId: 'u1' });
      expect(team.name).toBe('Team A');
      expect(team.inviteCode).toMatch(/^[A-Za-z0-9_-]{10}$/);

      const mems = await handle.db.select().from(memberships);
      expect(mems).toHaveLength(1);
      expect(mems[0]).toMatchObject({ userId: 'u1', teamId: team.id });
    });

    it('grants the creator their initial 12 doughnuts', async () => {
      await makeUser('u1', 'u1@example.com');
      const team = await createTeam(handle.db, { name: 'Team A', creatorId: 'u1' });
      const ledger = await handle.db.select().from(ledgerEntries);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        userId: 'u1',
        teamId: team.id,
        kind: 'allowance_grant',
        amount: WEEKLY_ALLOWANCE,
      });
    });

    it('rejects empty names', async () => {
      await makeUser('u1', 'u1@example.com');
      await expect(
        createTeam(handle.db, { name: '  ', creatorId: 'u1' }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('findTeamByInviteCode', () => {
    it('returns the team when the code matches', async () => {
      await makeUser('u1', 'u1@example.com');
      const created = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });
      const found = await findTeamByInviteCode(handle.db, created.inviteCode);
      expect(found?.id).toBe(created.id);
    });

    it('returns null when the code does not match', async () => {
      const found = await findTeamByInviteCode(handle.db, 'nope');
      expect(found).toBeNull();
    });
  });

  describe('joinByInviteCode', () => {
    it('adds a membership and grants 12 doughnuts to the new member', async () => {
      await makeUser('u1', 'u1@example.com');
      await makeUser('u2', 'u2@example.com');
      const team = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });

      const joined = await joinByInviteCode(handle.db, {
        userId: 'u2',
        inviteCode: team.inviteCode,
      });
      expect(joined.id).toBe(team.id);

      const mems = await handle.db.select().from(memberships);
      expect(mems).toHaveLength(2);

      const allLedger = await handle.db.select().from(ledgerEntries);
      const u2Entries = allLedger.filter((e) => e.userId === 'u2');
      expect(u2Entries).toHaveLength(1);
      expect(u2Entries[0]).toMatchObject({
        teamId: team.id,
        kind: 'allowance_grant',
        amount: WEEKLY_ALLOWANCE,
      });
    });

    it('throws INVITE_CODE_INVALID when the code does not match a team', async () => {
      await makeUser('u1', 'u1@example.com');
      await expect(
        joinByInviteCode(handle.db, { userId: 'u1', inviteCode: 'wrong' }),
      ).rejects.toMatchObject({ code: 'INVITE_CODE_INVALID' });
    });

    it('throws ALREADY_MEMBER if the user is already in the team', async () => {
      await makeUser('u1', 'u1@example.com');
      const team = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });
      await expect(
        joinByInviteCode(handle.db, { userId: 'u1', inviteCode: team.inviteCode }),
      ).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
    });
  });

  describe('rotateInviteCode', () => {
    it('changes the invite code if the caller is a member', async () => {
      await makeUser('u1', 'u1@example.com');
      const team = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });
      const oldCode = team.inviteCode;
      const updated = await rotateInviteCode(handle.db, { teamId: team.id, userId: 'u1' });
      expect(updated.inviteCode).not.toBe(oldCode);
      expect(await findTeamByInviteCode(handle.db, oldCode)).toBeNull();
      expect((await findTeamByInviteCode(handle.db, updated.inviteCode))?.id).toBe(team.id);
    });

    it('throws NOT_TEAM_MEMBER if the caller is not in the team', async () => {
      await makeUser('u1', 'u1@example.com');
      await makeUser('u2', 'u2@example.com');
      const team = await createTeam(handle.db, { name: 'T', creatorId: 'u1' });
      await expect(
        rotateInviteCode(handle.db, { teamId: team.id, userId: 'u2' }),
      ).rejects.toMatchObject({ code: 'NOT_TEAM_MEMBER' });
    });
  });

  describe('listMembershipsForUser', () => {
    it('returns each team the user belongs to with a balance', async () => {
      await makeUser('u1', 'u1@example.com');
      const t1 = await createTeam(handle.db, { name: 'A', creatorId: 'u1' });
      const t2 = await createTeam(handle.db, { name: 'B', creatorId: 'u1' });

      const rows = await listMembershipsForUser(handle.db, 'u1');
      expect(rows).toHaveLength(2);
      const ids = rows.map((r) => r.team.id).sort();
      expect(ids).toEqual([t1.id, t2.id].sort());
      for (const r of rows) {
        expect(r.balance).toBe(WEEKLY_ALLOWANCE);
      }
    });

    it('returns empty array when user has no teams', async () => {
      await makeUser('u1', 'u1@example.com');
      const rows = await listMembershipsForUser(handle.db, 'u1');
      expect(rows).toEqual([]);
    });
  });
});
