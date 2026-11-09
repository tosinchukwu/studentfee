# Backend architecture

- `api/[...path].ts`: the only Vercel function. Converts the request and calls the shared handler.
- `server/handler.ts`: the whole API as `handle(Request): Promise<Response>`. No framework or runtime dependency, so a Vercel function, the local Bun server or a scheduled job can all call it.
- `server/index.ts`: local and self-hosted server that serves `dist/` and calls the same handler.
- `server/db.ts`, `server/migrations.ts`, `server/store.ts`: PostgreSQL connection, versioned migrations and all queries. Sessions are stored as hashes. Sign-in challenges are single use.
- `server/contracts/`: one adapter per deployed contract version behind the `ContractAdapter` interface. Only the v2 adapter exists. Each invoice stores `contract_id` and `contract_version`, so old invoices keep using their own contract when v3 arrives. `server/contracts/registry.ts` chooses the adapter for new invoices.
- `src/lib/contracts.ts`: the browser-side adapter with the same split (method names and argument shapes per version).

## Ready for the automatic settlement service (not built yet)
The v3 specification defers it until the contract passes its testnet tests. When it is built:
- Add a scheduled route (for example `api/cron/settle.ts`, protected by a `CRON_SECRET` header) that calls a new `settlePending()` function in `server/services/`.
- It lists invoices through `store.ts`, reads each one through its adapter (`adapterForContract`), and sends `settle_invoice` only for invoices in `PaymentReceived`.
- The settler's key must live in server environment variables only, restricted to the `settle_invoice` method. Nothing in the browser changes.
