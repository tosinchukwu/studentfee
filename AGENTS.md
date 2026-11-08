# School Fee Payment Tracker

Project memory for developers and agents.

## What this app does

School fee invoices with public payment links. Parents pay USDC on NEAR Testnet. The school office tracks status and exports CSV.

## Chain and contract (source of truth: `docs/near-contract-integration.md`)

- Network: NEAR Testnet
- Fee contract: `v2.studentfee.testnet` (Rust, written and deployed by the project owner)
- Admin: `mouseng20.testnet`
- Treasury: `bd73e625f18d762274625333c5200aae67d0ec65d09797b27118a06c24dc6669`
- USDC token: `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` (6 decimals)
- ABI: `src/abi/school_fee_registry_abi.json`
- Statuses: Pending, PaymentReceived, Settling, Refunding, Paid, Cancelled. Never rename them. The UI maps the middle three to "Processing".
- Payment is two steps: parent calls `ft_transfer_call` on USDC (msg = invoice id), then anyone calls `settle_invoice`. `refund_payment` is admin only.
- `due_date` is Unix ms. `paid_at` and `operation_started_at` are nanoseconds.

## Stack

- Frontend: React 18, Vite, TypeScript, Tailwind (`src/`)
- Backend: Bun + SQLite (`server/`), proxied from Vite at `/api`
- Wallets: NEAR Wallet Selector (`src/lib/near.tsx`)

## Key files

- `server/index.ts` routes, `server/auth.ts` admin sign-in (NEP-413 signed message), `server/chain.ts` contract reads
- `src/pages/AdminPage.tsx`, `src/pages/PayPage.tsx`, `src/pages/NewInvoiceForm.tsx`, `src/pages/InvoiceList.tsx`
- `docs/`: contract specification, review notes, integration reference

## Rules

- No third-party branding in the interface.
- Never store or ask for private keys. Never commit `.env` or the `data/` folder.
- Payment links are built with `getShareBase()` from `src/lib/share.ts`. Keep `installShareSync()` in `src/main.tsx`.

## Run

```bash
bun install
bun run server
bun run dev
```
