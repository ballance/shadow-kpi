import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, type TestDbHandle } from '../helpers/db';
import { teams } from '@/server/db/schema';

describe('testcontainers DB helper', () => {
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

  it('connects and lets us insert + read', async () => {
    await handle.db.insert(teams).values({ name: 'Test Team', inviteCode: 'abc123' });
    const rows = await handle.db.select().from(teams);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Test Team');
  });

  it('truncateAll wipes the team table', async () => {
    const rows = await handle.db.select().from(teams);
    expect(rows).toHaveLength(0);
  });
});
