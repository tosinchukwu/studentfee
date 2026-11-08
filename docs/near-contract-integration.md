# School Fee Registry: deployed contract reference

This is the source of truth for the app. It comes from your deployment notes and ABI reference. It replaces the earlier draft specification wherever the two differ.

## Deployment
- Network: NEAR Testnet, RPC `https://rpc.testnet.near.org`
- Contract account: `v2.studentfee.testnet`
- Deployment transaction: `HHi6A4bmvJsYrRqqZQ5FXbceB9kN1SXrF2gr6T7SsZme`
- Admin: `mouseng20.testnet`
- Treasury: `bd73e625f18d762274625333c5200aae67d0ec65d09797b27118a06c24dc6669`
- USDC token: `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` (6 decimals)
- Contract and treasury are both registered with USDC (1.25 NEAR each)
- Contract version 1.0.0, ABI schema 0.4.0

## Methods
- Admin: `create_invoice(invoice_id, amount, due_date)`, `cancel_invoice(invoice_id)`, `transfer_admin(new_admin)`
- Payment: `ft_on_transfer` (called by USDC only), `settle_invoice(invoice_id)`, `refund_payment(invoice_id)`
- Private callbacks (the app never calls them): `on_settlement_complete`, `on_refund_complete`
- Recovery (admin): `resolve_stuck_operation(invoice_id, operation_succeeded)`
- Views: `get_config`, `get_invoice`, `is_invoice_payable`, `contract_source_metadata`
- `new` already ran. Never call it again.

## Data rules
- `invoice_id`: exactly 32 lowercase hex characters
- `amount`: string in USDC base units (12.34 USDC = `"12340000"`)
- `due_date`: Unix milliseconds
- `paid_at`, `operation_started_at`: nanoseconds (divide by 1,000,000 for milliseconds)
- Statuses, kept exactly as on chain: `Pending`, `PaymentReceived`, `Settling`, `Refunding`, `Paid`, `Cancelled`
- Friendly label for the app: `PaymentReceived`, `Settling` and `Refunding` can show as "Processing", but the real value is stored and used internally.

## Payment flow
1. Admin creates the invoice.
2. The parent's wallet calls `ft_transfer_call` on the USDC token with receiver `v2.studentfee.testnet` and `msg` = invoice ID. The contract records the payment (`PaymentReceived`) and returns any excess for the token to refund.
3. Settlement is a separate step: `settle_invoice` moves the USDC to the treasury, and the invoice becomes `Paid` only when the callback confirms it. A failed settlement goes back to `PaymentReceived`.
4. Refunds go through `refund_payment` and finish asynchronously.

A successful token transfer does not mean the invoice is paid. The app shows Paid only when `get_invoice` says `Paid`.

## Rules for the app
- Use the deployed contract and its real ABI. No simplified or assumed interface.
- Never ask for or store private keys.
- Show transaction hashes and payment status.
- Development and testing on testnet only.
- Not yet tested: truly simultaneous payments for the same invoice.

## Access rules (confirmed)
- `settle_invoice`: anyone. Moves a received payment to the treasury.
- `refund_payment`: admin only (`mouseng20.testnet`). Refunds the payer.

## App flow that follows from this
- After the parent's payment reaches `PaymentReceived`, the parent's own wallet signs a second step, `settle_invoice`, as part of one progress screen ("Step 2 of 2: finishing payment"). No server-held key is needed.
- If the parent closes the page between the steps, the pay page and the admin dashboard both show a "Finish payment" button for any invoice in `PaymentReceived`, and anyone can press it.
- Refunds are an admin-only action on the dashboard.

## Still needed
- Nothing else from the contract side. Waiting for your final build prompt.
