import pg from 'pg'
import { MIGRATIONS } from './migrations.js'

// PostgreSQL connection for Node (Vercel functions) and Bun (local server).
// The connection string comes only from the server environment and is never sent to the browser.

// BIGINT columns hold millisecond timestamps, which fit safely in a JavaScript number.
pg.types.setTypeParser(20, (value) => Number(value))

export class DatabaseConfigError extends Error {}

let pool: pg.Pool | null = null

/**
 * The connection string from the server environment. Vercel's Neon integration sets DATABASE_URL,
 * but if a custom prefix was chosen it appears as PREFIX_DATABASE_URL, so those are accepted too.
 * Direct (unpooled) variants are skipped because serverless functions should use the pooled one.
 */
export function databaseUrl(): string {
  const direct = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (direct) return direct
  const match = Object.keys(process.env).find(
    (name) => /(^|_)(DATABASE|POSTGRES)_URL$/.test(name) && !/UNPOOLED|NON_POOLING/.test(name) && process.env[name],
  )
  return match ? (process.env[match] ?? '') : ''
}

export function getPool(): pg.Pool {
  if (pool) return pool
  const connectionString = databaseUrl()
  if (!connectionString) throw new DatabaseConfigError('DATABASE_URL is not set')
  // A serverless instance handles one request at a time, so one connection is enough there.
  const serverless = Boolean(process.env.VERCEL)
  pool = new pg.Pool({
    connectionString,
    max: serverless ? 1 : 5,
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  })
  pool.on('error', (error) => console.error('Database pool error:', error.message))
  return pool
}

let migrated: Promise<unknown> | null = null

/** Applies any missing migrations once per process. Safe to call on every request. */
export async function ensureSchema(): Promise<void> {
  migrated ??= runMigrations().catch((error: unknown) => {
    migrated = null
    throw error
  })
  await migrated
}

export async function runMigrations(): Promise<string[]> {
  const client = await getPool().connect()
  const applied: string[] = []
  try {
    // One migrator at a time, even if several serverless instances start together.
    await client.query('SELECT pg_advisory_lock(727274)')
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)')
    const done = new Set((await client.query<{ id: string }>('SELECT id FROM schema_migrations')).rows.map((row) => row.id))
    for (const migration of MIGRATIONS) {
      if (done.has(migration.id)) continue
      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [migration.id, Date.now()])
        await client.query('COMMIT')
        applied.push(migration.id)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined)
    client.release()
  }
  return applied
}

export async function query<T extends pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema()
  return (await getPool().query<T>(text, params)).rows
}

export async function queryOne<T extends pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1')
    return true
  } catch {
    return false
  }
}
