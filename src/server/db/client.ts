import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle> | undefined;
}

function makeDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const queryClient = postgres(url);
  return drizzle(queryClient, { schema });
}

export const db = global.__db ?? makeDb();
if (process.env.NODE_ENV !== 'production') global.__db = db;

export type Db = typeof db;
