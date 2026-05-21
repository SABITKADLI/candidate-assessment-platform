import pg from 'postgres';

// postgres.js ships as CJS with a default export. webpack's ESM interop
// sometimes surfaces it as { default: fn }, tsx does not — normalize.
const postgres: typeof pg =
  (pg as unknown as { default?: typeof pg }).default ?? pg;

declare global {
  // eslint-disable-next-line no-var
  var __cap_sql: ReturnType<typeof postgres> | undefined;
}

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
    types: {},
  });
}

function real(): ReturnType<typeof postgres> {
  return globalThis.__cap_sql ?? (globalThis.__cap_sql = make());
}

type PG = ReturnType<typeof postgres>;

// Use a *function* as the proxy target so the `apply` trap fires for
// tagged-template invocations (`sql`...``). Accessors like `sql.begin`
// still route through `get`.
const target = function () { /* proxied */ } as unknown as PG;

export const sql: PG = new Proxy(target, {
  apply(_t, _thisArg, args) {
    return (real() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_t, prop, receiver) {
    const r = real();
    const v = Reflect.get(r as object, prop, receiver);
    return typeof v === 'function' ? v.bind(r) : v;
  },
  has(_t, prop) { return prop in (real() as object); },
}) as PG;

export type Sql = typeof sql;
