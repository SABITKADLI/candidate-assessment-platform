import postgres from 'postgres';

// Lazy pool. Module import never throws; connection creation deferred until
// the first query runs. This lets workers guard their boot on env vars
// without the DB module exploding on their `import` line.
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
    types: {},
  });
}

type PG = ReturnType<typeof postgres>;
export const sql = new Proxy({} as PG, {
  get(_t, prop, receiver) {
    const real = globalThis.__cap_sql ?? (globalThis.__cap_sql = make());
    const v = Reflect.get(real, prop, receiver);
    return typeof v === 'function' ? v.bind(real) : v;
  },
  apply(_t, _thisArg, args) {
    const real = globalThis.__cap_sql ?? (globalThis.__cap_sql = make());
    return (real as unknown as (...a: unknown[]) => unknown)(...args);
  },
}) as PG;

export type Sql = typeof sql;
