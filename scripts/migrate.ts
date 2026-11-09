import { databaseUrl, getPool, runMigrations } from '../server/db.js'

// Applies any missing database migrations. The app also does this automatically on first use,
// so running it by hand is optional (for example in a deploy pipeline).
if (!databaseUrl()) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}
const applied = await runMigrations()
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.')
await getPool().end()
