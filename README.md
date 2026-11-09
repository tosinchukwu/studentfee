# School Fee Payment Tracker

A school fee collection tool. The school office creates fee invoices, each with a unique payment link. Parents pay in USDC on NEAR Testnet. The office sees every invoice and its status, and exports payments as a CSV for the accountant.

Built with [Arc Studio](https://studio.arc.io)

## Problem

Schools collect fees through cash, bank transfers and receipts that are matched by hand. Parents do not know whether a payment arrived. Bursars spend hours reconciling who paid what.

## Solution

- The school office creates an invoice per student and term, with optional fee items and a due date.
- Each invoice gets a public payment link. Parents do not need an account with the school.
- The invoice moves from Pending to Paid, with a transaction reference and a timestamp.
- The dashboard lists every invoice with filters. A CSV export opens directly in Excel or Google Sheets.

## How it works

1. Open `/admin` and connect the school wallet (`mouseng20.testnet`), then press Sign in. You see the empty invoice dashboard.
2. Press New invoice, fill in the student, term, due date and amount, and press Create invoice. Approve the wallet prompt. You get a payment link and the invoice shows as Pending.
3. Press Copy payment link on the invoice and open it in another browser. You see the invoice details, the amount and the due date.
4. Press Connect wallet to pay, then Pay. Approve the wallet prompt. The page shows "Step 1 of 2 done".
5. Press Finish payment and approve it. The page shows Payment received, with the date, the payer and a transaction reference.
6. Go back to the dashboard. The invoice shows as Paid with its reference. Collected and Outstanding totals update.
7. Press Export CSV. A file downloads with one row per invoice, ready to open in a spreadsheet.

## Tech stack

- React 18, Vite, TypeScript, Tailwind CSS
- Vercel serverless API (`api/`) sharing one request handler with a local Bun server
- PostgreSQL for invoice details, sessions and settings (Neon via the Vercel Marketplace)
- NEAR Testnet contract `v2.studentfee.testnet` (Rust, deployed separately) for invoice amounts, status and settlement, behind a contract adapter per version
- Testnet USDC (NEP-141 token, 6 decimals)
- NEAR Wallet Selector (MyNearWallet, Meteor Wallet, HERE Wallet)

## How to run / try the demo

Prerequisites: Bun, a PostgreSQL database, and a NEAR Testnet account that holds the testnet USDC token.

```bash
bun install
# start PostgreSQL locally, for example:
docker run -d --name fees-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fees -p 5432:5432 postgres:18-alpine
echo 'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/fees' >> .env
bun run dev      # web app (port 5173) and API (port 8787) together
```

Tables are created automatically on first use. Other commands: `bun run db:migrate` (apply migrations by hand), `bun run build` (production build into `dist/`), `bun run start` (API and built app on one port), `bun run check` (lint and type check).

Environment variables:

- `DATABASE_URL`: PostgreSQL connection string (required, server only)
- `NEAR_RPC_URL`: NEAR Testnet RPC endpoint (optional)
- `CONTRACT_ID`: the fee contract account (optional)
- `USDC_TOKEN_ID`: the USDC token account (optional)
- `ADMIN_ACCOUNT`: the school administrator account (optional)
- `TREASURY_ACCOUNT`: the school account that receives payments (optional)
- `SCHOOL_NAME`: default school name shown in the header (optional)

Deploying to Vercel: see `docs/deploy-vercel.md`. Check `/api/health` after deploying.

## Notes for judges

- Built primarily with Arc Studio for rapid prototyping of the USDC payment flow.
- No Arc Studio or Circle branding appears in the interface.
- A practical real-world money tool: payments, tracking and export.
- The app uses the contract as deployed. Statuses shown to users are friendly labels; the exact on-chain values are kept internally.
- Payment has two wallet approvals: send the USDC, then finish the payment. A parent who closes the page between the two can come back, and anyone can press Finish payment.
- Only the school administrator account can sign in to the dashboard. Invoice details are visible to a parent only through that invoice's link.
- Not yet tested: payments for the same invoice from two parents at the exact same moment.
