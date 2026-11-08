# Multi-school School Fee Registry: technical outline (v3 proposal)

Status: proposal for your approval. Nothing here is implemented. The deployed contract `v2.studentfee.testnet` stays untouched.

## 0. Summary of the approach

- Deploy a NEW contract (working name `v3.studentfee.testnet`, contract version 2.0.0) that keeps the existing payment state machine and adds schools, per-school treasuries and a platform fee.
- One shared registry contract, not one contract per school. Funds from all schools briefly pass through one pooled USDC balance, so the contract is built around one invariant: it can never send out more than it holds for a given invoice.
- Everything a school needs to list and search (student names, terms, CSVs) stays in the backend database, scoped by school. The chain stores only money state.
- Old invoices stay on the old contract. The app reads both.

### Main trade-off: shared registry versus one contract per school
| | Shared registry (recommended) | Contract per school (factory) |
|---|---|---|
| Isolation | By code and accounting | By NEAR account boundaries |
| Cost per school | One registration | A sub-account, a deploy, a USDC registration, extra NEAR |
| Platform fees | Easy, one place | Needs a fee path in every contract |
| Complexity and time | Moderate | High (factory, upgrades, many accounts) |
| Blast radius of a bug | All schools' in-flight payments | One school |

Recommendation: the shared registry, with a strict solvency rule and an external audit before mainnet. A factory design is the hardening path if the product grows.

## 1. How schools are registered

- `register_school(name, description, treasury)` is callable by any account, attaching a NEAR deposit that covers storage. The caller becomes the school admin.
- A school gets a sequential `school_id` (u64) and starts in status `PendingApproval`.
- The platform owner calls `approve_school(school_id, fee_bps)`. Only `Active` schools can create invoices or receive payments.
- Why approval instead of fully open: parents see the school name on the payment page. With open registration anyone could register "Springfield Academy" and collect real money. Approval is one cheap check that blocks that.
- Stored per school: name (max 80 characters), description or location (max 200), admin, treasury, status, fee_bps, created_at.
- One admin account maps to one school. This keeps scoping simple. A person who runs two schools uses two accounts.
- The owner can `suspend_school` and `reactivate_school`. Suspension stops new invoices and new payments. It never touches funds already held, which can still be settled or refunded.

## 2. Administrator and treasury per school

- Each school has its own admin and its own treasury account.
- Treasury must be registered with USDC (storage deposit). Registering the treasury costs a NEAR storage deposit on the token. Note: your earlier notes said 1.25 NEAR. The value reported by the token for your existing accounts is 1250000000000000000000 yoctoNEAR, which is 0.00125 NEAR. Please double check what you actually paid.
- `register_school` is payable and forwards that deposit to the token for the treasury. If the treasury is already registered, the token keeps or refunds it.
- Admin transfer is two steps: `propose_admin(school_id, new_admin)` then the new admin calls `accept_admin`. This prevents handing a school to a mistyped account.
- Treasury change is delayed: `queue_treasury_change(new_treasury)`, then `apply_treasury_change` after a waiting period (proposed: 24 hours on testnet, longer on mainnet). A stolen admin key cannot redirect money instantly, and the platform owner can cancel a pending change by suspending the school.
- The treasury used for a payment is copied onto the invoice when the payment is received, so a change in between cannot redirect that payment.

## 3. How each school creates, manages and cancels its invoices

- `create_invoice(school_id, invoice_id, amount, due_date)`: caller must equal that school's admin and the school must be `Active`. The invoice stores `school_id` and a snapshot of the school's `fee_bps` at creation time.
- `invoice_id` stays 32 lowercase hex characters, globally unique across schools. Creation fails if it already exists.
- `cancel_invoice(invoice_id)`: the school is read from the stored invoice, never from caller input. Caller must be that school's admin and the invoice must be `Pending`.
- Storage: every invoice costs the contract storage. Each school keeps a prepaid storage balance: `create_invoice` is payable or draws from a balance the admin topped up with `deposit_storage`. Unused deposit can be withdrawn. Without this a school could drain the contract's NEAR balance with invoice spam.
- Listing, searching and filtering invoices stays off chain. Iterating over a school's invoices in a view call is unbounded and gets more expensive over time, so the contract exposes `get_invoice` and counters only.

## 4. How payments are routed to the correct school treasury

- The parent still calls `ft_transfer_call` on USDC with receiver = the registry and `msg` = invoice id. Nothing about the parent's step changes.
- `ft_on_transfer` looks up the invoice by `msg`, then its school. It accepts only if the invoice is `Pending`, the school is `Active`, the sender token is the configured USDC and the amount equals the invoice amount. Otherwise it returns the full amount and the token refunds the parent (same as v2).
- On acceptance the invoice becomes `PaymentReceived`, storing payer, treasury snapshot and a held-amount entry.
- `settle_invoice(invoice_id)` stays permissionless, as in v2. It sends `amount - fee` to the stored treasury snapshot. The recipient is never taken from the caller.
- The parent's page does not need to know the school. The backend maps invoice to school.

## 5. How platform fees are collected

- Model (proposal): the parent pays exactly the invoice amount. The fee is deducted from the school's share.
  - `fee = amount * fee_bps / 10000`, rounded down. Cap `fee_bps` at 500 (5 percent) in the contract so the owner cannot set an extreme value.
  - Example: a 250.00 invoice at 100 bps gives a 2.50 fee. The school receives 247.50.
- Mechanism: settlement sends only the net amount to the school treasury, in one transfer, exactly like v2. The fee simply stays in the registry's USDC balance and is added to `accrued_fees` when the settlement succeeds.
- `withdraw_fees(amount)`: owner only, sends to the platform treasury, using the same attempt-and-callback pattern as settlement, and restores `accrued_fees` if the transfer fails.
- Why not send school and platform shares in one settlement: two transfers are not atomic. One could succeed and the other fail, leaving the invoice in a state that needs manual recovery. A single transfer plus an internal counter avoids that.
- Alternative: add the fee on top of the invoice amount. Parents would pay more than the invoice shows, which is bad for a school fee. Not recommended.
- Fee rate: set per school at approval and snapshotted on each invoice, so changing a rate never alters issued invoices.

## 6. Preventing one school from touching another school's data

On chain:
- Every state-changing school method derives the school from the stored invoice and compares it to the caller. `cancel_invoice` and `refund_payment` take only an invoice id.
- `create_invoice` takes a `school_id` but rejects unless the caller is that school's admin.
- A school admin has no way to name another school's treasury. Treasuries are only changed through the delayed change on their own school.
- `resolve_stuck_operation` becomes platform-owner only (it is admin-only in v2). In a pooled contract a school admin could otherwise claim a settlement succeeded or failed and trigger a double payout from other schools' funds.
- Solvency rule: the contract tracks `held_total` (the sum of all invoice amounts in `PaymentReceived`, `Settling` or `Refunding`) plus `accrued_fees`. Every outgoing transfer is for an exact amount derived from one invoice, never from caller input, and a state change prevents repeating it. A view `solvency()` returns the tracked total so monitoring can compare it with the contract's real USDC balance.

Off chain (backend and database):
- Every table has `school_id`. Every admin query is `WHERE school_id = <school of the signed-in account>`, never a school id from the request.
- Sign-in is still a signed message from the wallet. The session stores the account and the one school it administers.
- The public invoice endpoint returns only that single invoice and only the fields a parent needs.
- Exports contain only the signed-in school's rows.

## 7. Refunds and settlements

State machine (statuses stay exactly as the deployed contract names them):

`Pending` to `PaymentReceived` to `Settling` to `Paid`; `PaymentReceived` to `Refunding` to `Pending`; `Pending` to `Cancelled`.

- Settlement: permissionless, one transfer of the net amount to the treasury snapshot, with an `attempt_id` so stale callbacks are ignored. On success the invoice becomes `Paid`, `accrued_fees` increases and `held_total` decreases. On failure it returns to `PaymentReceived`.
- Refund: `refund_payment(invoice_id)` by that school's admin, only from `PaymentReceived` (for example after settlement keeps failing because a treasury lost its USDC registration). The full amount returns to the payer and no fee is taken, because no fee is accrued before a successful settlement.
- Refund after `Paid`: not possible on chain, because the money has left the contract. A school that wants to give money back sends it from its own treasury. The dashboard records this as a note, not as an on-chain refund.
- Stuck operations (a settlement or refund that never reports back): `resolve_stuck_operation` by the platform owner only, after checking the transaction outcome, same meaning as v2.

## 8. Required changes

Contract (new code, new account):
- New state: owner, platform treasury, USDC token, default fee, schools, admin-to-school index, invoices (with `school_id`, fee and treasury snapshots), `held_total`, `accrued_fees`, per-school storage balances.
- New methods: `register_school`, `approve_school`, `suspend_school`, `reactivate_school`, `propose_admin`, `accept_admin`, `queue_treasury_change`, `apply_treasury_change`, `deposit_storage`, `withdraw_fees`, owner transfer in two steps, and views for schools, solvency and fees.
- Changed methods: `create_invoice`, `cancel_invoice`, `refund_payment`, `ft_on_transfer`, `settle_invoice`, `resolve_stuck_operation`.
- Events for school registered, approved, suspended, treasury changed, invoice created, paid, cancelled and fee withdrawn.
- Not upgradeable, like v2. The new account must itself be registered with USDC once.

USDC integration:
- Same token. The registry account changes, so `ft_transfer_call` receiver becomes the new contract for new invoices.
- Every school treasury and the platform treasury must be registered with USDC.
- Old invoices keep paying into the old contract. The backend stores a `contract_id` per invoice, so the pay page uses the right receiver.

Backend and database:
- New `schools` table (school_id, name, description, admin account, treasury cache, status, fee rate). `invoices` gets `school_id` and `contract_id`. Sessions get the account and school.
- School name moves from a global setting to a per-school field.
- Sign-in resolves account to school. Unknown accounts see a Register your school screen. Platform owner sees the owner console.
- Chain reads query the contract named on each invoice.

Dashboard:
- School registration form (name, description or location, treasury) and an Awaiting approval state.
- Admin dashboard scoped to the school: invoices, filters, CSV with extra columns for gross amount, platform fee and net to school.
- Treasury and admin change screens with the waiting period shown.
- Owner console: approve and suspend schools, set fee rates, see accrued fees, withdraw fees, and a solvency check.

## 9. Security risks and handling

| Risk | Handling |
|---|---|
| A bug lets one invoice send more than it holds, draining other schools' pooled funds | Single-purpose transfers from stored amounts, status guards, `attempt_id`, held-total tracking, external audit before mainnet |
| Fake school impersonates a real one | Approval step before a school can invoice or be paid |
| Admin key stolen, treasury redirected | Delayed treasury change, owner can suspend |
| Owner key stolen | Owner can only approve schools, set fees under a hard cap and withdraw accrued fees. It cannot touch held school funds. Use a multisig account for the owner |
| School admin abuses stuck-operation recovery | Recovery is owner-only |
| Treasury not registered with USDC | Registration is forwarded at school registration. Settlement failure leaves funds safely in `PaymentReceived`, refundable |
| Storage drain by invoice spam | Prepaid per-school storage balance |
| Fee rounding errors | Round down, fee never exceeds the amount, tested at boundaries |
| Cross-school data access in the app | School derived from the session on the server, never from request parameters |
| Race: two payments on one invoice | Existing `PaymentReceived` guard and exact-amount rule. Needs a real simultaneous-payment test, which has not been done on v2 either |
| Callback arrives late or twice | `attempt_id` check |
| Suspension mid-flight | Held funds can still settle or be refunded |
| Lost owner or admin accounts | Two-step transfers. Recovery plan to be agreed |

## 10. Test cases required before deployment

Contract unit and integration tests:
- Registration: any account can register, duplicate admin rejected, name length limits, storage deposit required, treasury registration forwarded.
- Approval and suspension: only owner, fee cap enforced, suspended school cannot invoice or receive new payments, held funds still settle.
- Admin and treasury: two-step admin transfer, wrong account cannot accept, treasury change waits and can be cancelled, snapshot used for in-flight payments.
- Invoices: only that school's admin can create, cancel and refund, cross-school attempts rejected for every method, duplicate ids rejected, cancel only from Pending.
- Payments: exact amount accepted, under and over payment fully refunded, wrong token rejected, unknown invoice refunded, suspended school refunded, second payment on one invoice refunded.
- Settlement: correct net to the correct treasury, fee accrued, failed transfer restores `PaymentReceived`, stale callback ignored, permissionless call cannot change the recipient.
- Fees: rounding at 1 unit and at the cap, zero fee, snapshot unaffected by later rate changes, `withdraw_fees` owner only and restored on failure.
- Refunds: only from `PaymentReceived`, full amount, no fee taken, not possible after `Paid`.
- Solvency: after random sequences of operations across several schools, the tracked total equals the real USDC balance.
- Simultaneous payments for one invoice, on a sandbox or testnet.

Application tests:
- Admin of school A cannot read, export, cancel or refund school B's invoices through the API.
- Public invoice endpoint exposes only that invoice.
- A legacy v2 invoice still loads and pays through the old contract.
- Registration to approval to first paid invoice, end to end with real wallets on testnet.
- CSV columns and totals match the chain for a mixed set of paid, pending and cancelled invoices.

## 11. Decisions I need from you

1. Registration: approval by the platform owner (recommended) or fully open?
2. Fee: percentage deducted from the school's share (recommended), or something else? Starting rate, for example 1 percent? Is the cap of 5 percent acceptable?
3. Treasury change waiting period: 24 hours on testnet and longer on mainnet?
4. One school per admin account (recommended)?
5. Who is the platform owner account, and where should platform fees be sent?
6. Should the app keep supporting the existing v2 contract for old invoices, or can the demo start fresh on v3?

## 12. Suggested order of work (after your approval)

1. You confirm the decisions above and I update this outline into a final specification.
2. Your NEAR developer implements and tests the v3 contract from that specification, and deploys it to testnet under a new account.
3. I review the contract against the specification and the app.
4. I update the database, backend and dashboard, then run the full test list on testnet.


my need feedback 

 The proposed architecture is acceptable in principle. I want to proceed with the shared multi-school registry, but please revise the outline before implementation.

My decisions:

1. School registration must require platform owner approval.
2. Initial platform fee should be 1%.
3. Maximum platform fee should be capped at 5%.
4. Fees should be deducted from the school's payment, not added to the parent's invoice.
5. Each school must have its own treasury.
6. Treasury changes should have a 24-hour delay on testnet and a longer delay on mainnet.
7. One school per administrator account.
8. Continue supporting existing v2 invoices and payments. Do not modify the deployed v2 contract.

Please address these additional concerns:

A. Pooled USDC accounting:
Explain how held_total, accrued_fees and pending outgoing transfers will be accounted for during asynchronous NEAR promise execution. Demonstrate how the contract prevents double payouts and protects each school's funds.

B. Treasury registration:
Explain how the contract handles already-registered treasuries, insufficient deposits, failed storage registration and refunded excess deposits. A school must not become Active unless its treasury registration is verified.

C. Platform fee withdrawal:
Explain how accrued fees are protected from school funds and how failed fee withdrawals are recovered safely.

D. Security:
Explain the implications of using one shared registry for all schools, including the consequences of a contract bug.

E. Migration:
Explain how the application will support both v2 and v3 without breaking existing invoice payment links.

F. Storage accounting:
Correct the storage deposit calculation. The previously reported minimum of 1250000000000000000000 yoctoNEAR equals 0.00125 NEAR.

Do not write code or deploy anything yet.

Return the revised technical outline, including the updated accounting model, payment flow, security assumptions and test cases. Wait for my explicit approval before implementation.