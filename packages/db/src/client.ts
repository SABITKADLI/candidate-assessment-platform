import postgres from 'postgres';

// Single shared connection pool per Node process. Next.js route handlers
// re-import this module; the singleton avoids pool explosion in dev HMR.
declare global {
  // eslint-disable-next-line no-var
  var __cap_sql: ReturnType<typeof postgres> | undefined;
}

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
    // Map Postgres timestamptz -> Date automatically (default), keep jsonb as object.
    types: {},
  });
}

export const sql = globalThis.__cap_sql ?? make();
if (process.env.NODE_ENV !== 'production') globalThis.__cap_sql = sql;

export type Sql = typeof sql;
