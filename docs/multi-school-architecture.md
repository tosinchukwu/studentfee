# Multi-school School Fee Registry: revised technical outline (v3)

> Superseded in part: section 3 (accounting) and the stuck-operation rules are replaced by `docs/multi-school-final-spec.md`.

Status: revision 2, for your explicit approval. Nothing is implemented or deployed. The deployed contract `v2.studentfee.testnet` stays untouched.

## 1. Your decisions, applied

| # | Decision | How it is applied |
|---|---|---|
| 1 | Owner approval for every school | New schools start as `PendingApproval` and cannot invoice or be paid until approved |
| 2 | Platform fee starts at 1% | Default `fee_bps` = 100 |
| 3 | Fee capped at 5% | Hard cap of 500 bps in the contract |
| 4 | Fee deducted from the school's share | Parent pays exactly the invoice amount. School receives amount minus fee |
| 5 | One treasury per school | Stored on the school, verified as registered with USDC before activation |
| 6 | Treasury change delay | 24 hours on testnet. A longer delay for mainnet is a separate setting, chosen before any mainnet work |
| 7 | One school per administrator | A unique admin-to-school index |
| 8 | Keep supporting v2 | The app reads and pays v2 invoices through the old contract. v2 is never modified |

Still open (see section 12): the platform owner account, where fees go, and the maximum invoice amount.

## 2. Architecture overview

- A new contract (working name `v3.studentfee.testnet`, contract version 2.0.0). Not upgradeable, like v2.
- One shared registry. The trade-off against one contract per school is in section 8 (security).
- Money state is on chain. Student names, terms, fee items, listings and CSV stay in the backend database, scoped by school.
- Existing statuses are kept exactly: `Pending`, `PaymentReceived`, `Settling`, `Refunding`, `Paid`, `Cancelled`.

## 3. Pooled USDC accounting (concern A)

### 3.1 The problem
All schools' payments sit in one USDC balance of the registry between "payment received" and "settled". NEAR runs a transfer as separate steps (a call, then a callback later), so the contract must never rely on the real balance alone. It keeps its own ledger and moves money between ledger buckets BEFORE sending, then confirms or restores in the callback.

### 3.2 Ledger (all amounts in USDC base units, 6 decimals)
- Per invoice: `status`, `amount`, `school_id`, `fee_bps` snapshot, `treasury` snapshot, `fee_amount`, `net_amount`, `payer`, `attempt_id`, `operation_started_at`.
- `held_total`: the sum of `amount` for every invoice in `PaymentReceived`, `Settling` or `Refunding`. This is money that belongs to payers or schools and is still inside the contract.
- `school_held[school_id]`: the same sum per school.
- `fees_available`: platform fees earned and free to withdraw.
- `fees_in_flight`: fees reserved by withdrawals that have been sent but not yet confirmed.
- `withdrawals[withdrawal_id]`: amount and start time of each pending fee withdrawal.

### 3.3 Rules (the invariants)
- I1, at rest: real USDC balance >= `held_total` + `fees_available` + `fees_in_flight`. Stray tokens sent without a call make the balance larger. They are never paid out.
- I2: `held_total` equals the sum of `school_held` over all schools.
- I3: an invoice's money can leave the contract at most once. Both exits (settle and refund) start only from `PaymentReceived`, and both move the invoice out of that status before sending.
- I4: every outgoing amount is read from the stored invoice (`net_amount` or `amount`) or from a stored withdrawal. Never from caller input.

### 3.4 Payment received
`ft_on_transfer` (called only by the configured USDC token) accepts only if the invoice is `Pending`, its school is `Active`, the contract is not paused and the amount equals the invoice amount exactly. Otherwise it returns the full amount and the token refunds the payer, as in v2.
On acceptance, in one step: status `PaymentReceived`, store payer and treasury snapshot, compute `fee_amount = floor(amount * fee_bps / 10000)` and `net_amount = amount - fee_amount`, then `held_total += amount` and `school_held[school] += amount`. Fee is computed once here, so settlement never recomputes it.

### 3.5 Settlement during asynchronous execution
1. `settle_invoice(id)` (anyone) requires `PaymentReceived`. In the same call, before any promise: status `Settling`, `attempt_id += 1`, `operation_started_at = now`. It checks `school_held[school] >= amount` and `held_total >= amount` and panics otherwise. Then it sends `ft_transfer(treasury_snapshot, net_amount)` and attaches the callback `on_settlement_complete(id, attempt_id)`. NEAR keeps state changes and the promise together, or neither.
2. While `Settling`, a second `settle_invoice`, a `refund_payment` or a `cancel_invoice` all fail the status check. This is what stops a double payout: there is no path from `Settling` to another send.
3. The private callback first checks `status == Settling` and `attempt_id` matches. If not, it is stale and does nothing.
4. Transfer succeeded: status `Paid`, `held_total -= amount`, `school_held[school] -= amount`, `fees_available += fee_amount`.
5. Transfer failed (for example the treasury lost its USDC registration): status back to `PaymentReceived`. Nothing was sent, ledgers unchanged, and the admin can fix the treasury or refund.
6. The risky case is "transfer succeeded but the callback never ran" (out of gas or lost). The invoice stays `Settling`. It cannot be settled again. Only `resolve_stuck_operation` by the platform owner can clear it, only after a minimum waiting time (proposed 10 minutes), after checking the transaction outcome off chain, and it bumps `attempt_id` so any late callback is ignored. The callback does only cheap state updates and is given generous gas to make this very unlikely.

### 3.6 Refund
`refund_payment(id)` by that school's admin, only from `PaymentReceived`. Same pattern: status `Refunding`, `attempt_id += 1`, send the full `amount` to the payer, callback. Success: invoice back to `Pending` (as in v2), ledgers decreased, no fee taken. Failure: back to `PaymentReceived`. Fees accrue only on a successful settlement, so a refund never has a fee to claw back.

### 3.7 Why one school's funds are protected
- A school payout needs `school_held` for that school to cover the invoice. A bug that tried to pay one invoice twice would find the second payout missing from the ledger and panic.
- Paths are mutually exclusive per invoice (I3), and recipients are snapshots, never parameters.
- This is defense in depth, not a proof. Section 8 covers what happens if there is still a bug.

## 4. Treasury registration (concern B)

### 4.1 Design choice
The registry does not handle the treasury's USDC registration deposit at all. The school admin registers the treasury with USDC directly, from their own wallet, and the registry only VERIFIES it. That keeps NEAR deposits out of the registry, so no refund bookkeeping can go wrong.

### 4.2 Flow
1. The dashboard checks the treasury with `storage_balance_of` on USDC.
2. Not registered: the admin presses Register treasury, which calls `storage_deposit` on USDC with `account_id` = treasury and `registration_only = true`. The amount comes from the token's `storage_balance_bounds` minimum, read live, not hardcoded.
3. `register_school(name, description, treasury)` is payable, attaching only the registry's own storage cost for the school record (measured, see section 7).
4. The contract calls `storage_balance_of(treasury)` on USDC and handles the answer in a callback.
5. Registered (non-null): the school record is kept in `PendingApproval` with `treasury_verified = true`.
6. Not registered: the record is not kept, and the full attached deposit is returned to the caller.
7. `approve_school` (owner) re-checks the same way and only sets `Active` in its callback if still registered. An account can unregister between registration and approval.

### 4.3 The cases you asked about
| Case | Result |
|---|---|
| Treasury already registered | Step 2 is skipped, or if called anyway the token refunds the whole deposit to the caller. Verification passes |
| Insufficient deposit | The token rejects the call. NEAR returns the attached amount to the caller. Nothing changes |
| Registration fails | Treasury stays unregistered, so `register_school` fails verification and returns its deposit |
| Excess deposit | The token refunds the excess to the caller, who is the admin and not the registry |
| Registered but later unregisters | Settlement transfer fails, invoice returns to `PaymentReceived`, funds safe, refund available |
| Treasury change | `queue_treasury_change` and `apply_treasury_change` both verify registration |
| Registry's own USDC registration | A one-time step after deployment, checked by the setup health check |

A school is `Active` only when the verification callback succeeded at approval time. There is no other path to `Active`.

## 5. Platform fee withdrawal (concern C)

- Fees are a separate bucket: `fees_available`. They enter it only after a successful settlement and leave it only through `withdraw_fees`.
- Schools never touch `fees_available`. School payouts are computed from invoice records, not from the balance, so fees cannot be spent on payouts and payouts cannot dip into fees.
- `withdraw_fees(amount)` (owner only, not while a withdrawal is being resolved by hand): requires `amount <= fees_available`. Before sending: `fees_available -= amount`, `fees_in_flight += amount`, store `withdrawals[id]`. Then `ft_transfer` to the platform treasury with callback `on_withdraw_complete(id)`.
- The callback removes `withdrawals[id]` first, so it can run only once. Success: `fees_in_flight -= amount`. Failure: `fees_in_flight -= amount` and `fees_available += amount`. The fees are never both available and in flight.
- Stuck withdrawal: `resolve_stuck_withdrawal(id, succeeded)` by the owner after a waiting time and an off-chain check, with the same effect as the callback.
- The platform treasury is verified as USDC-registered when it is set.

## 6. Payment flow, updated end to end

1. School registers its treasury with USDC, then calls `register_school`. Owner approves. School is `Active`.
2. Admin creates the invoice in the dashboard (backend draft), then `create_invoice` on v3. Fee rate is snapshotted.
3. Parent opens the link `/pay/<id>`. The backend returns the invoice and its `contract_id`. Parent calls `ft_transfer_call` on USDC (receiver = that contract, msg = invoice id). Invoice becomes `PaymentReceived`.
4. Anyone calls `settle_invoice`. The school treasury receives the net amount. Invoice is `Paid`. The fee is added to `fees_available`.
5. The owner withdraws fees to the platform treasury when wanted.

## 7. Storage accounting (concern F)

Correction: `1250000000000000000000` yoctoNEAR equals 0.00125 NEAR (1 NEAR = 10^24 yoctoNEAR), not 1.25 NEAR. That is the minimum USDC storage balance the token reported for both the v2 contract and your treasury. The earlier notes mislabeled it.

How storage will be accounted for in v3:
- NEAR charges 10^19 yoctoNEAR per byte stored, so 1 NEAR pays for about 100 KB.
- USDC registration of an account (treasury, platform treasury, the registry itself): the token's minimum, read live from `storage_balance_bounds`. Reported value today: 0.00125 NEAR each. It is paid once per account, directly to the token.
- School record (name, description, admin, treasury and ledger fields): a few hundred bytes. Roughly 0.003 NEAR as an estimate only. The real figure is measured in tests from the change in `env::storage_usage()` and then used as the required deposit.
- Invoice record: also a few hundred bytes. Roughly 0.0025 NEAR as an estimate only, measured the same way.
- Each school keeps a prepaid storage balance in the registry (`deposit_storage`). `create_invoice` charges the measured storage cost to that balance and fails if it is too low. Unused balance can be withdrawn by the school admin. This stops one school from draining the registry's NEAR by creating invoices.
- The registry account must keep a NEAR balance above its storage requirement. The health check warns when it is low.
- The 0.00125 NEAR figure is for the token's own records. It is separate from the registry's storage and must not be mixed up with it in the code or the dashboard.

## 8. Security (concern D)

### 8.1 What a shared registry means
- Funds of different schools share one USDC balance while a payment is waiting to be settled. A serious bug in payment, settlement, refund or fee code can affect every school's in-flight money and the accrued fees, not just one school.
- Because the contract is not upgradeable, a bug cannot be patched in place. The response is to pause, refund and redeploy.
- Money already settled is in school treasuries, outside the registry, and is not affected.
- Exposure is limited to: invoices in `PaymentReceived`, `Settling` or `Refunding`, plus `fees_available` and `fees_in_flight`.

### 8.2 Shared registry versus one contract per school
| | Shared registry (chosen) | Contract per school |
|---|---|---|
| Worst-case bug | All in-flight funds and fees | One school's in-flight funds |
| Setup per school | One registration | Account, deploy, USDC registration, extra NEAR |
| Fees and owner tools | One place | Repeated in every contract |
| Time to build | Shorter | Much longer |

### 8.3 Controls that limit the damage
- Pause switch (owner): blocks new payments, new invoices, settlement and fee withdrawal. Refunds and cancellations stay allowed so payers can always get their money back.
- Held-funds cap (`max_held_total`) and a maximum invoice amount, set at deployment, so the loss from any bug is bounded. Values to be agreed (section 12).
- Prompt settlement keeps the pool small. Anyone can settle, so the app prompts the payer at once. An optional platform-run settle service can sweep `PaymentReceived` invoices.
- Frequent fee withdrawals keep `fees_available` small.
- Solvency view and monitoring: compare tracked ledgers with the real USDC balance when no settlement or refund is in flight.
- Owner account is a multisig. Two-step ownership transfer.
- `resolve_stuck_operation` and `resolve_stuck_withdrawal` are owner-only with waiting times, because a school admin must never decide whether money left the pool.
- Independent audit before any mainnet use. Testnet first.

### 8.4 Risk table
| Risk | Handling |
|---|---|
| Double payout of one invoice | Status transitions before sending, attempt ids, exclusive exits, per-school ledger check |
| Late or repeated callback | `attempt_id` and status check, withdrawals removed on first callback |
| Fake school impersonating a real one | Owner approval |
| Admin key stolen | 24-hour treasury change delay, owner can suspend |
| Owner key stolen | Owner can approve schools, set fees under the cap, pause, withdraw fees. It cannot move school funds in flight. Multisig |
| Pause abused | Refunds stay possible |
| Storage spam | Prepaid per-school storage balance |
| Treasury unregistered later | Settlement fails safely, refundable |
| Rounding | Floor, fee never above amount, tested at boundaries |
| Cross-school data access in the app | School comes from the signed session on the server, never from request parameters |
| Same invoice paid by two parents at once | `PaymentReceived` guard and exact amount. Needs a real test, not yet done for v2 either |

## 9. Migration and v2 support (concern E)

Principle: a payment link is only an invoice id. It stays the same.

- Database: `invoices` gets `contract_id` (existing rows are set to `v2.studentfee.testnet`) and `school_id` (null for v2). A `schools` table holds v3 schools. v2 invoices belong to a built-in "legacy school" row tied to `mouseng20.testnet`.
- Link resolution: `/pay/<id>` calls the backend, which finds the invoice and returns its `contract_id` and version. The pay page uses that contract as the `ft_transfer_call` receiver and for `settle_invoice`. Old links keep working with no change.
- Contract adapters in the app: one for v2 and one for v3, each providing read invoice, create, cancel, settle and refund with that version's argument shapes and status fields. Pages talk to the adapter, not to a specific contract.
- Creation: new invoices go to v3 only. The legacy school can still cancel, settle and refund existing v2 invoices.
- Dashboard: one combined list with a quiet version tag. A signed-in account sees its v3 school and, for `mouseng20.testnet`, the legacy invoices.
- Fees: v2 pays 100% to its treasury with no platform fee. The CSV gets Gross, Platform fee and Net columns, filled for v3 and showing a fee of 0 for v2, plus a Contract column.
- Sessions and API: the server checks the account against the contract named on each invoice before allowing an action.
- Sunset: when no v2 invoice remains open, v2 support can be removed in one change.
- The v2 contract is read and called, never modified.

## 10. Required changes by area

Contract: new state and methods (`register_school`, `approve_school`, `suspend_school`, `reactivate_school`, `propose_admin`, `accept_admin`, `queue_treasury_change`, `apply_treasury_change`, `deposit_storage`, `withdraw_storage`, `withdraw_fees`, `set_fee_default`, `set_school_fee`, `pause`, `unpause`, owner transfer, the two stuck-resolution methods, and views for schools, ledgers and solvency). Changed methods: `create_invoice`, `cancel_invoice`, `refund_payment`, `ft_on_transfer`, `settle_invoice`. Events for every state change.

Backend: per-school scoping on every query, account to school resolution at sign-in, owner endpoints, contract adapters, per-invoice `contract_id`, fee and net fields cached from chain events.

Database: `schools` table, `school_id` and `contract_id` on invoices, per-school settings including the school name.

Dashboard: school registration with treasury check, awaiting-approval state, treasury and admin change screens with the 24-hour countdown, storage balance top-up, platform owner console (approve, suspend, fee rates, pause, ledgers, solvency, withdraw fees), CSV with fee columns.

USDC integration: same token. New registry account must be registered with USDC once. Every treasury and the platform treasury must be registered. Payments for new invoices go to the v3 account, for old invoices to v2.

## 11. Test cases required before deployment

Accounting:
- After every payment, settlement, refund, failure and withdrawal step: `held_total` equals the sum of `school_held`, and the tracked total never exceeds the real balance when nothing is in flight.
- Settlement and refund on the same invoice, called together: only one starts.
- Settle twice in a row: the second fails while `Settling`.
- Callback replay and stale `attempt_id`: ignored.
- Forced transfer failure: invoice returns to `PaymentReceived`, ledgers unchanged.
- Callback missing: invoice stays `Settling`, cannot be re-settled, owner recovery works only after the waiting time and invalidates late callbacks.
- Fee withdrawal success, failure and replay: `fees_available` and `fees_in_flight` correct each time, withdrawing more than available fails, school payouts unaffected.
- Several schools with interleaved payments: each school's payout equals its own invoices minus fees.

Treasury and schools:
- Treasury already registered, unregistered, insufficient deposit, excess deposit, and unregistered between registration and approval. School is never `Active` without verification.
- Approval, suspension, reactivation: owner only. Suspended school cannot invoice or receive new payments, held funds still settle.
- One school per admin enforced. Two-step admin transfer. Treasury change waits 24 hours, can be cancelled, re-verifies at apply, does not affect in-flight payments.

Invoices and payments:
- Only the school's own admin can create, cancel and refund. Cross-school attempts on every method fail.
- Exact amount accepted, under and over payment fully refunded, wrong token rejected, unknown invoice refunded, paused contract refunds.
- Fee rounding at 1 unit, at the 5% cap and at zero. Fee rate change affects only new invoices.
- Storage: invoice creation charges the measured amount, fails when the prepaid balance is too low, withdrawal of unused balance works.
- Pause blocks payments and settlement but not refunds or cancellations.
- Two payments for one invoice at the same moment, on testnet.

Application:
- Admin of school A cannot read, export, cancel or refund school B's invoices through the API.
- Public invoice endpoint exposes only that invoice.
- A v2 invoice link created before the upgrade still loads and pays through v2. A v3 link pays through v3.
- Registration, approval and first paid invoice end to end with real wallets.
- CSV totals, fees and nets match the chain for a mixed set of v2 and v3 invoices.

## 12. Open items I still need from you

1. Platform owner account (preferably a multisig account) and the platform treasury that receives fees.
2. Maximum invoice amount and the held-funds cap for testnet.
3. Minimum waiting time before a stuck operation can be resolved (proposed 10 minutes).
4. Whether the platform should run an automatic settle service, which would need a platform-owned funded account key kept outside this app.
5. Mainnet treasury-change delay. This is not set now, and no mainnet configuration is written in this outline.

## 13. Suggested order of work (after your approval)

1. You answer section 12. I turn this outline into the final specification.
2. Your NEAR developer implements and tests v3 from that specification and deploys to a new testnet account.
3. I review the contract against the specification and the app.
4. I add the adapters, database and dashboard changes and run the application tests on testnet.


chevk ou

The revised outline is much better. I agree with the overall architecture.

Before final approval, I need one more technical correction and clarification.

1. Pooled accounting:
   Please introduce an explicit school payout in-flight accounting bucket, or an equivalent safe mechanism.

When settlement sends the school's net amount but the callback has not yet executed, the actual USDC balance has already decreased while held_total has not yet been updated.

Explain exactly how the ledger remains correct during this period, including successful transfers, failed transfers, and callbacks that never execute.

2. Stuck-operation recovery:
   Explain how resolve_stuck_operation prevents double payouts if the owner supplies an incorrect operation_succeeded value. Include safeguards and detailed recovery tests.

3. Apply these proposed testnet settings:

- Platform owner: mouseng20.testnet, subject to wallet ownership verification.
- Platform fee treasury: a separate dedicated NEAR account, to be created.
- Maximum invoice amount: 1,000 USDC.
- Maximum held funds: 5,000 USDC.
- Stuck-operation waiting period: 10 minutes.
- Automatic settlement service: Yes, but implement it only after the core contract has passed its testnet integration tests.

The limits above are for testnet and must be reviewed before mainnet.

Do not implement or deploy anything yet.

Return the corrected accounting model, explain the stuck-operation safeguards, and provide the final specification for review.