# Deploying to Vercel (frontend, API and PostgreSQL)

Everything runs on Vercel: the web app (static files), the API (serverless function `api/[...path].ts`) and a PostgreSQL database. No application data is stored on any server disk.

## One-time setup
1. Push this project to your GitHub repository and import it in Vercel (Vite is detected automatically).
2. In the Vercel project, open the Storage tab, choose Neon (Postgres) from the Marketplace, create a database and connect it to the project for Production and Preview. Vercel adds `DATABASE_URL` (and related variables) automatically. Nothing else is required.
3. Redeploy. The first request creates the tables automatically (migrations run once per server instance, guarded by a database lock).
4. Check `https://<your-site>/api/health`. It should answer `{"ok":true,"database":"ok","contract":"v2"}`.

## Environment variables
| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` (or `POSTGRES_URL`) | Yes | PostgreSQL connection string. Server only |
| `NEAR_RPC_URL`, `CONTRACT_ID`, `USDC_TOKEN_ID`, `ADMIN_ACCOUNT`, `TREASURY_ACCOUNT`, `SCHOOL_NAME` | No | Override the testnet defaults |

None of these values is ever sent to the browser. The public `/api/config` route returns only public contract addresses.

## Migrations
- Migrations are in `server/migrations.ts` (append-only, tracked in the `schema_migrations` table).
- They run automatically on first use. To run them by hand: `DATABASE_URL=... bun run db:migrate`.

## Local development
`docker run -d --name fees-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fees -p 5432:5432 postgres:18-alpine`, then set `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/fees` in `.env` and run `bun run dev`.

## Database provider
Neon is recommended: it is what Vercel's Marketplace offers for Postgres, and it sets `DATABASE_URL` for you. Its Free plan (no credit card) includes 1 GB storage and 100 compute hours per month per project, and the database sleeps after 5 minutes idle and wakes in a few hundred milliseconds. That is plenty for development and a hackathon demo. Paid usage starts at roughly $0.106 per compute-hour and $0.35 per GB-month, billed through Vercel. Check neon.com/pricing for current numbers.
