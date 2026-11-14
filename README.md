# StudentFee — School Fee Payment Tracker

StudentFee is a school-fee invoicing and reconciliation prototype built on **NEAR**. A school creates an invoice for a student and term, shares a payment link with a parent, receives USDC on NEAR, and tracks the payment through on-chain settlement. The school can review receipts and export its invoice register as CSV.

- **Live app:** https://studentfee-weld.vercel.app
- **Public demo:** https://studentfee-weld.vercel.app/demo
- **Admin workspace:** https://studentfee-weld.vercel.app/admin (project-owner access only)
- **Source:** https://github.com/tosinchukwu/studentfee
- **Hackathon track:** Real-World Money (`realworld`)
- **Network:** NEAR Testnet; test tokens only. This is not a production payment service.

## Problem

Schools often reconcile fees from cash, bank transfers and paper receipts manually. Parents may not know whether a payment has actually arrived, and bursars spend time matching transactions to students and terms.

StudentFee gives each fee a shareable invoice link and an on-chain payment record. It is designed around a familiar school workflow rather than requiring parents to understand blockchain mechanics.

## What is implemented

- Create individual fee invoices with student, term, amount, due date and optional fee details.
- Generate a unique payment link for each invoice.
- Accept NEAR Testnet USDC using the NEP-141 token standard.
- Track intermediate payment states and mark an invoice **Paid only after the contract confirms settlement**.
- Show the payer, payment time and transaction reference on the receipt.
- Filter invoices, view collection/outstanding summaries and export the invoice register to CSV.
- Import up to 200 students from a validated CSV, publish invoices in wallet-approved batches, and export the resulting payment links.
- Provide a public Demo route so judges can inspect the interface without signing in.

## Judge quickstart

You can inspect the product without connecting a wallet:

1. Open the [live StudentFee app](https://studentfee-weld.vercel.app).
2. Select **Explore Demo** or open the [public Demo page](https://studentfee-weld.vercel.app/demo).
3. Review the sample fee register, invoice fields and public testnet invoice workflow.
4. To exercise the real Testnet flow, use the Demo page's **Create a live test invoice** form. Connect a NEAR Testnet wallet, enter a student, term, amount and future due date, then approve invoice creation. The creator wallet pays the contract's storage deposit.
5. Copy the generated invoice link and open it from a second wallet with testnet USDC. Approve the USDC transfer, select **Finish payment**, and wait until the receipt displays **Paid**. Follow the transaction reference to the NEAR Testnet explorer.

**Important distinction:** the three rows in the Demo page's example fee register are static sample data. They are illustrative UI records, not on-chain invoices and cannot be paid. The live invoice form on that same page creates a separate invoice on the public Demo contract. The public Demo is testnet-only and is not the school's private admin workspace.

If you do not have testnet USDC, you can still inspect the public interface and follow the recorded demo video linked from the project's hackathon post when it is published. Do not send real funds.

## Main application workflows

### School administrator (project-owner access)

1. Open the [administrator workspace](https://studentfee-weld.vercel.app/admin).
2. Connect the authorized administrator account, `mouseng20.testnet`, and approve the wallet's message-signing request.
3. Select **New invoice**, enter the student, term, amount and due date, and approve the on-chain invoice creation.
4. Copy the generated payment link and share it with the parent.
5. To create a class batch, select **Import CSV**, download the template, fill in Student Name, Term, Fee (USDC) and Due Date (Student ID and Note are optional), then upload the file and review the validation preview.
6. Select **Generate invoices and payment links**. The app publishes up to five individual invoices per wallet transaction and verifies each batch against the v2 contract. Download the payment-links CSV. If a batch is interrupted, inspect saved drafts before retrying; do not upload the same file again.
7. Review invoice status and transaction details. Select **Export CSV** to download the invoice register.

The administrator workspace is intentionally restricted. No shared admin credentials, private keys or seed phrases are provided to judges.

### Parent payment (using an invoice link)

1. Open the payment link supplied by the school.
2. Check the student, term, amount and due date.
3. Connect a NEAR Testnet wallet and approve the USDC transfer.
4. Select **Finish payment** and approve the separate settlement call.
5. Wait for on-chain confirmation. The receipt shows the payer, timestamp and transaction reference. The invoice becomes **Paid** only after the settlement callback confirms success.

Payment has two on-chain stages. A successful USDC transfer alone does **not** mean the invoice is Paid. If the parent closes the page after the transfer, the payment can be resumed from the payment page or dashboard.

## How NEAR is used

StudentFee fits the **Real-World Money** track because it brings school invoicing and stablecoin collection onto NEAR using a deployed NEAR smart contract and NEP-141 USDC.

The project has two separate Testnet contract contexts:

| Purpose | Contract | Access |
| --- | --- | --- |
| School's Standard v2 invoice workflow | `v2.studentfee.testnet` | Authorized school administrator creates and manages invoices |
| Public, permissionless demo invoice workflow | `demo.studentfee.testnet` | Any NEAR Testnet wallet can create a demo invoice, subject to contract limits |

The configured USDC token is a NEP-141 Testnet token with 6 decimal places. See [the deployed contract reference](docs/near-contract-integration.md), [the Standard v2 Rust source snapshot](contracts/near-v2/README.md), and [the public Demo contract notes](contracts/near-demo/README.md) for contract details.

### Settlement sequence

1. The administrator or demo creator creates an invoice on the relevant NEAR contract.
2. The parent calls `ft_transfer_call` on the configured USDC token, passing the invoice ID to the invoice contract.
3. The contract records the received payment.
4. `settle_invoice` transfers the USDC to the configured treasury.
5. The invoice becomes **Paid** only when the settlement callback confirms success. If settlement fails, the contract keeps the payment in a recoverable intermediate state rather than falsely marking it Paid.

The application backend uses PostgreSQL for invoice metadata and sessions. It does not custody wallet private keys or sign payment transactions for users.

### Track scope and deliberate limitations

The hackathon's [Real-World Money track](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md) lists NEAR Intents, stablecoins and meta-transactions as themes to consider. StudentFee currently uses **NEP-141 USDC directly on NEAR Testnet** and its own NEAR invoice contracts. It does **not** currently use the 1Click API, cross-chain NEAR Intents routing or a meta-transaction relayer. Wallet users approve their own transactions and pay their own Testnet gas. These are current product limitations, not features to assume.

The official [NEAR HACKATHON instructions](https://nearhackathon.com/HACKATHON.md) state that the listed integrations are hints rather than mandatory requirements (Q-011) and that a fitting NEAR contract is sufficient. StudentFee's core implementation is a school invoicing and stablecoin-payment workflow on NEAR.

## Technology

- React 18, Vite, TypeScript and Tailwind CSS
- NEAR Wallet Selector
- Rust smart contracts on NEAR and NEP-141 USDC
- Vercel serverless API routes
- PostgreSQL (Neon through the Vercel Marketplace)
- Bun for package management and development

The project was built primarily with Arc Studio for rapid prototyping; the NEAR contracts were separately implemented and deployed by the project owner.

## Local development and verification

Prerequisites: Bun, Docker (for PostgreSQL), and a NEAR Testnet wallet with testnet USDC if you want to exercise wallet/payment flows.

1. Install dependencies:

   ```bash
   bun install
   ```

2. Start PostgreSQL:

   ```bash
   docker run -d --name fees-pg \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=fees \
     -p 5432:5432 postgres:18-alpine
   ```

3. Create a local `.env` file containing the server-side database connection:

   ```bash
   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/fees
   ```

4. Start the app (Vite starts the API server alongside the frontend):

   ```bash
   bun run dev
   ```

5. Open http://localhost:5173. The Vite development server proxies `/api` requests to the local API on port 8787.

Useful checks:

- `bun run typecheck` — TypeScript check
- `bun run build` — production frontend build
- `bun run check` — repository check script
- `bun run db:migrate` — apply database migrations manually

### Environment variables

- `DATABASE_URL` — PostgreSQL connection string (required, server-side only)
- `NEAR_RPC_URL` — NEAR Testnet RPC endpoint (optional)
- `CONTRACT_ID` — Standard v2 fee contract account (optional)
- `USDC_TOKEN_ID` — Testnet USDC token account (optional)
- `ADMIN_ACCOUNT` — authorized school administrator account (optional)
- `TREASURY_ACCOUNT` — school treasury account (optional)
- `SCHOOL_NAME` — default school name (optional)

Never commit `.env` files or expose database credentials in client-side code.

## Deployment

The live prototype is deployed on Vercel with PostgreSQL. See [Vercel deployment notes](docs/deploy-vercel.md). The health endpoint is available at `/api/health`; it should report database and contract-adapter health.

## Known limitations and safety

- Testnet only. Do not use real funds.
- This prototype has not had an independent security audit and is not production-ready financial infrastructure.
- Simultaneous payments for the same invoice at exactly the same time have not been tested.
- The current submission is the Standard v2 experience plus the separate public Demo contract. The Multi-school v3 work is not part of the deployed submission.
- No private keys or wallet seed phrases should be entered into the app or committed to this repository.

## License

MIT. See [LICENSE](LICENSE).
