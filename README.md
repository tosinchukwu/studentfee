# StudentFee — School Fee Payment Tracker

StudentFee helps a school collect and reconcile fees using USDC on NEAR. A school administrator creates an invoice for a student and term; the parent receives a unique payment link; the school office tracks the payment state and exports invoice records as CSV.

**Live prototype:** https://studentfee-weld.vercel.app  
**Source code:** https://github.com/tosinchukwu/studentfee  
**Network:** NEAR Testnet only — this is a hackathon prototype, not a production payment service.

Built primarily with Arc Studio for rapid prototyping of the USDC payment flow.

## The problem

Schools often reconcile cash, bank transfers and paper receipts manually. Parents may not know whether a payment has arrived, while bursars spend time matching transactions to students and terms.

## What StudentFee does

- Lets a school administrator create a fee invoice with student, term, amount, optional fee items and due date.
- Generates a shareable payment link for each invoice; parents do not need a school dashboard account.
- Accepts testnet USDC through the deployed NEAR contract.
- Tracks payment progress and only marks an invoice **Paid** after on-chain settlement is confirmed.
- Shows transaction references and payment receipts.
- Provides invoice filters, collection/outstanding summaries and CSV export.\n- Imports up to 200 students from a validated CSV, publishes individual invoices in wallet-approved batches, and exports their payment links.

## Try the live prototype

Open **https://studentfee-weld.vercel.app** to inspect the deployed interface. The prototype uses NEAR Testnet.

**Access note for judges:** administrator actions are restricted to the project owner's wallet, `mouseng20.testnet`. Its private key is not public and must never be requested or shared. You can inspect the public site without connecting a wallet, but creating invoices requires the authorized administrator to sign. To reproduce a parent payment, use an invoice link supplied by the project owner and your own NEAR Testnet wallet with testnet USDC. The public demo post for this submission will include a recorded walkthrough of the complete flow.

### Administrator workflow (owner-authorized)

1. The project owner opens [the administrator workspace](https://studentfee-weld.vercel.app/admin).
2. The owner connects `mouseng20.testnet` and signs in by approving the wallet's message-signing request.
3. The owner chooses **New invoice**, enters the student, term, amount and due date, then approves the on-chain invoice creation.
4. The owner copies the generated payment link and shares it with the parent.
5. For a class or school-wide upload, choose **Import CSV**, download the template, fill in Student Name, Term, Fee (USDC) and Due Date (Student ID and Note are optional), then upload and review the validation preview.\n6. Choose **Generate invoices and payment links**. The app publishes up to five individual invoices per wallet transaction and verifies each batch against the v2 contract. Download the resulting payment-links CSV to share with parents. If a batch is interrupted, inspect the saved drafts in the invoice list before retrying; do not upload the same file again.\n7. The dashboard shows invoice status and transaction details; **Export CSV** downloads the invoice register.

### Parent payment flow (with a supplied invoice link)

1. Open the invoice payment link supplied by the school.
2. Review the student, term, amount and due date.
3. Connect your own NEAR Testnet wallet and approve the USDC transfer.
4. After the first transaction, choose **Finish payment** and approve the settlement transaction.
5. Wait for contract confirmation. The receipt shows the payer, timestamp and transaction reference; the invoice is marked **Paid** only after settlement is confirmed.

**Important:** Payment uses two wallet approvals: one for the USDC transfer and one to finish settlement. A successful token transfer alone does not mean the invoice is Paid. If the parent closes the page between the two steps, the payment can be resumed from the payment page or dashboard.

If you only want to inspect the interface, no wallet connection is needed. Wallet and payment actions require a compatible NEAR Testnet wallet and testnet USDC.

## NEAR integration

Bulk import uses the same existing `create_invoice` method as manual invoice creation. It does not change or redeploy the contract; it creates one on-chain invoice per student. The current submission uses the existing Standard v2 contract:

- **Network:** NEAR Testnet
- **Contract:** `v2.studentfee.testnet`
- **Admin account:** `mouseng20.testnet`
- **USDC:** NEP-141 testnet token, 6 decimals
- **Contract source and deployed configuration:** see [docs/near-contract-integration.md](docs/near-contract-integration.md).

The payment flow is:

1. The administrator creates an invoice on the contract.
2. The parent calls `ft_transfer_call` on the USDC token with the invoice ID.
3. The contract records the incoming payment.
4. `settle_invoice` transfers the funds to the configured treasury.
5. The invoice becomes Paid only when the settlement callback confirms success.

The backend stores application data and sessions in PostgreSQL. It does not custody wallet private keys or sign payment transactions on behalf of users.

## Technology

- React 18, Vite, TypeScript and Tailwind CSS
- NEAR Wallet Selector
- NEAR Rust contract and NEP-141 USDC
- Vercel serverless API routes
- PostgreSQL (Neon through the Vercel Marketplace)
- Bun for package management and local development

## Known limitations and honest scope

- The app is deployed for **NEAR Testnet only**. Do not use real funds.
- Simultaneous payments for the same invoice from two parents at the exact same moment have not been tested.
- NEAR Mobile Android integration is wired in but has not been verified on a physical device; see [docs/near-mobile.md](docs/near-mobile.md).
- The current submission is the Standard v2 experience. The separate Multi-school v3 work is still under development and is not part of the deployed payment flow.
- This prototype has not had an independent security audit and is not presented as production-ready financial infrastructure.
- No private keys or wallet seed phrases should be entered into the app.

## Run locally

Prerequisites: Bun, PostgreSQL and a NEAR Testnet account holding testnet USDC.

```bash
bun install
docker run -d --name fees-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fees \
  -p 5432:5432 postgres:18-alpine
echo 'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/fees' >> .env
bun run dev
```

The web app runs on port 5173 and the API on port 8787. Tables are created automatically on first use.

Useful commands:

- `bun run build` — production frontend build
- `bun run typecheck` — TypeScript check
- `bun run check` — project lint/type-check script
- `bun run db:migrate` — apply database migrations manually

### Environment variables

- `DATABASE_URL` — PostgreSQL connection string (required, server-side only)
- `NEAR_RPC_URL` — NEAR Testnet RPC endpoint (optional)
- `CONTRACT_ID` — fee contract account (optional)
- `USDC_TOKEN_ID` — USDC token account (optional)
- `ADMIN_ACCOUNT` — school administrator account (optional)
- `TREASURY_ACCOUNT` — school treasury account (optional)
- `SCHOOL_NAME` — default school name (optional)

Never commit `.env` files or expose `DATABASE_URL` in client-side code.

## Deployment

See [docs/deploy-vercel.md](docs/deploy-vercel.md) for Vercel and PostgreSQL setup. After deployment, check `/api/health`; it should report that the database and v2 contract adapter are available.

## Project notes

- Built primarily with Arc Studio for rapid prototyping; the NEAR contract is separately implemented and deployed by the project owner.
- No Arc Studio or Circle branding appears in the interface.
- The interface uses friendly labels for some intermediate on-chain states while preserving the exact contract statuses internally.
