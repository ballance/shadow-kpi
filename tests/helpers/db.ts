import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@/server/db/schema';

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TestDbHandle {
  db: TestDb;
  truncateAll: () => Promise<void>;
  close: () => Promise<void>;
}

let container: StartedPostgreSqlContainer | null = null;

export async function startTestDb(): Promise<TestDbHandle> {
  container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('shadowkpi_test')
    .withUsername('shadowkpi')
    .withPassword('shadowkpi')
    .start();

  const url = container.getConnectionUri();
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: './src/server/db/migrations' });

  const tables = [
    'ledger_entry',
    'bet',
    'notification',
    'comment',
    'membership',
    'market',
    'team',
    'session',
    'account',
    '"verificationToken"',
    '"user"',
  ];

  return {
    db,
    truncateAll: async () => {
      await db.execute(sql.raw(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE;`));
    },
    close: async () => {
      await client.end();
      await container?.stop();
      container = null;
    },
  };
}
