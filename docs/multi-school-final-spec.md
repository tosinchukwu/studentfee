# School Fee Registry v3: final specification for review

Status: final draft for your approval. Nothing is implemented or deployed. The deployed `v2.studentfee.testnet` is never modified.
This document replaces section 3 (accounting) and the stuck-operation rules of `docs/multi-school-architecture.md`. Everything else in that outline still applies unless this document says otherwise.

## 1. Testnet parameters (apply to testnet only; review before any mainnet use)

| Setting | Value |
|---|---|
| Platform owner | `mouseng20.testnet`, after wallet ownership is verified (section 11) |
| Platform fee treasury | A new dedicated account, to be created. Name needed before deployment |
| Default platform fee | 1% (100 bps) |
| Fee cap | 5% (500 bps) |
| Maximum invoice amount | 1,000 USDC (`1000000000` base units) |
| Maximum money at risk | 5,000 USDC (`5000000000` base units), see section 4.5 |
| Treasury change delay | 24 hours |
| Stuck-operation waiting period | 10 minutes |
| Maximum unreconciled recovery collateral | 1,000 USDC |
| `allow_retry` (collateral-backed retry) | On for testnet, intended off for mainnet |
| Automatic settlement service | Yes, built only after the contract passes testnet integration tests (section 12) |
| Upgradeable | No |

Rule: the owner account cannot also be a school administrator. `mouseng20.testnet` is the v2 admin, which is unaffected, but a v3 demo school needs a different admin account.

## 2. Data model

School: `school_id`, `name` (80), `description` (200), `admin`, `treasury`, `status` (`PendingApproval`, `Active`, `Suspended`), `treasury_verified`, `fee_bps`, `storage_balance`, `created_at`, queued treasury change (`new_treasury`, `effective_at`).
Indexes: `admin` to `school_id` (unique), so one school per administrator.

Invoice (the six v2 statuses keep their exact names: `Pending`, `PaymentReceived`, `Settling`, `Refunding`, `Paid`, `Cancelled`; v3 adds two recovery statuses, `SettlementRecovered` and `RefundRecovered`, described in section 9.4): `school_id`, `amount`, `due_date` (ms), `status`, `fee_bps` snapshot, `treasury` snapshot, `fee_amount`, `net_amount`, `payer`, `paid_at` (ns), `attempt_id`, `operation_started_at` (ns), `recovered` (bool), `recovered_at` (ns), `collateral_used`, and the pinned operation: `op_type` (`Settle` or `Refund`), `op_recipient` (the treasury snapshot for `Settle`, the payer for `Refund`) and `op_amount` (`net_amount` for `Settle`, `amount` for `Refund`). `op_recipient` and `op_amount` are written once when the payment is accepted and never change. No method accepts a recipient or an amount as an argument.

Global: `owner`, `platform_treasury`, `usdc_token`, `paused`, `maintenance`, `allow_retry`, `max_invoice`, `max_at_risk`, `max_unreconciled`, `unreconciled_collateral`, and the ledger below.

## 3. Roles

- Owner: approve, suspend, reactivate schools, set fee rates (up to the cap), pause and unpause, withdraw fees, resolve stuck operations, two-step ownership transfer.
- School admin: create and cancel its own invoices, refund its own payments, manage its storage balance, propose treasury changes and admin transfers.
- Anyone: pay an invoice, call `settle_invoice` for an invoice in `PaymentReceived`, read views.
- The owner cannot move money belonging to schools in flight. It can only pause, resolve stuck operations under the safeguards in section 9, and withdraw fees.

## 4. Ledger and accounting (corrected)

### 4.1 Buckets (USDC base units)

| Name | Meaning |
|---|---|
| `H` held_total | Gross amount of invoices in `PaymentReceived`, `SettlementRecovered` or `RefundRecovered`. Inside the contract, no transfer started |
| `SI` settle_in_flight | Gross amount of invoices in `Settling`. A payout to a school was started and is not confirmed |
| `SF` settle_fee_reserved | The fee part of `SI`. It stays in the contract whether the payout succeeds or fails |
| `RI` refund_in_flight | Gross amount of invoices in `Refunding` |
| `FA` fees_available | Platform fees earned and free to withdraw |
| `FW` fees_in_flight | Fee withdrawals started and not confirmed |

Per-school mirrors: `school_held[s]` (the part of `H` for school `s`) and `school_in_flight[s]` (the part of `SI + RI`).
`B` is the real USDC balance of the registry.

Derived bounds:
- `L_min = H + SF + FA`: what the contract must hold whatever the timing of any in-flight transfer.
- `L_max = H + SI + RI + FA + FW`: what it holds if none of its in-flight transfers has executed yet.
- `L_max - L_min` = the net amounts of settlements in flight + `RI` + `FW`. Exactly the money that may already have left.
- Money at risk `M = H + SI + RI` (cap in section 4.5).

### 4.2 Invariants
- S1, always: `B >= L_min`. This holds before, during and after every transfer, with or without callbacks.
- S2, when idle (`SI = RI = FW = 0`): `B >= H + FA`. The difference is surplus from stray token transfers. Surplus is never paid out.
- S3: `H` equals the sum of `school_held`. `SI + RI` equals the sum of `school_in_flight`.
- S4: no automatic path pays an invoice twice. The only second payout is `retry_with_collateral`, backed by `FA`, capped by `unreconciled_collateral <= max_unreconciled`.
- S5: `unreconciled_collateral` never exceeds what the platform put up, and `reclaim_surplus` can only return up to that amount.

### 4.3 State changes (every change is made before the transfer is sent)

| Event | Ledger change | Real balance |
|---|---|---|
| Payment accepted (`PaymentReceived`) | `H += A` | `B += A` (token credits it first) |
| `settle_invoice` starts | `H -= A`, `SI += A`, `SF += fee` | unchanged |
| Payout executes (token) | none | `B -= net` |
| Callback, success (`Paid`) | `SI -= A`, `SF -= fee`, `FA += fee` | unchanged |
| Callback, failure (`PaymentReceived`) | `SI -= A`, `SF -= fee`, `H += A` | unchanged (nothing left) |
| `refund_payment` starts | `H -= A`, `RI += A` | unchanged |
| Refund executes (token) | none | `B -= A` |
| Refund callback, success (`Pending`) | `RI -= A` | unchanged |
| Refund callback, failure (`PaymentReceived`) | `RI -= A`, `H += A` | unchanged |
| `withdraw_fees(w)` starts | `FA -= w`, `FW += w` | unchanged |
| Withdrawal callback, success | `FW -= w` | unchanged |
| Withdrawal callback, failure | `FW -= w`, `FA += w` | unchanged |
| `restart_settlement` (from `SettlementRecovered`) | same as `settle_invoice` starts | unchanged |
| `restart_refund` (from `RefundRecovered`) | same as `refund_payment` starts | unchanged |
| Restarted operation fails (callback) | back to the same recovered status, `H += A` | unchanged |

Here `A = net + fee`, `fee = floor(A * fee_bps / 10000)`, computed once when the payment is accepted.

### 4.4 Why the ledger stays correct while a payout is in flight
Worked example: invoice `A = 100`, fee 1, net 99, idle balance `B = 100`, nothing else held.
1. Settlement starts. Ledger: `H = 0`, `SI = 100`, `SF = 1`. `L_min = 1`, `L_max = 100`. `B = 100`. S1 holds with room to spare.
2. The payout executes. `B = 1`. S1 holds: `1 >= L_min = 1`. This is the window you described. The balance dropped and the callback has not run. Because the 100 is already in `SI` and not in `H`, no other operation can count on that money, and the fee part is held back in `SF`.
3a. Callback success. `SI = 0`, `SF = 0`, `FA = 1`. `L_max = 1`, `B = 1`. Idle, S2 holds.
3b. If the payout had failed at step 2: `B` stays 100. Callback failure restores `H = 100`, `SI = 0`, `SF = 0`. `L_min = 100`, `B = 100`. S1 holds.
3c. Callback never executes. The ledger stays at step 1 or 2. In both cases S1 holds, nothing else can spend the 100 (the invoice is `Settling`), and the invoice waits for owner recovery (section 9). The 99 is counted as "unknown location" in `SI`, not as available.

Refunds and withdrawals follow the same pattern with `RI` and `FW`, where the whole amount may leave and `L_min` excludes it.

### 4.5 Limits
- `create_invoice` rejects any amount above 1,000 USDC.
- `ft_on_transfer` refuses a payment (returns the amount) if `M + A` would exceed 5,000 USDC.
- `M` counts `H + SI + RI`. Fees are not in `M`, so withdraw them regularly.

## 5. Methods (summary)

| Method | Caller | Key conditions |
|---|---|---|
| `new(owner, platform_treasury, usdc_token, limits)` | deployer, once | Called in the same transaction as deployment |
| `register_school(name, description, treasury)` | anyone, payable | One school per admin. Treasury verified with USDC (section 7) |
| `approve_school(id, fee_bps)` | owner | Re-verifies treasury, fee <= cap, then `Active` in the callback |
| `suspend_school`, `reactivate_school` | owner | Held funds can still settle and be refunded |
| `propose_admin`, `accept_admin` | school admin, new admin | Two steps |
| `queue_treasury_change`, `apply_treasury_change` | school admin | Verified at queue and at apply. 24 hours between |
| `deposit_storage`, `withdraw_storage` | school admin | Prepaid invoice storage |
| `create_invoice(school_id, invoice_id, amount, due_date)` | that school's admin | `Active`, not paused, amount <= 1,000 USDC, storage charged |
| `cancel_invoice(invoice_id)` | that invoice's school admin | `Pending` only |
| `ft_on_transfer(sender, amount, msg)` | USDC token only | Section 6 |
| `settle_invoice(invoice_id)` | anyone | Status must be exactly `PaymentReceived`, not paused |
| `refund_payment(invoice_id)` | that invoice's school admin | Status must be exactly `PaymentReceived` |
| `restart_settlement(invoice_id)` | owner or that school's admin | Status must be `SettlementRecovered`, 10 minutes after recovery, not paused. Sends `op_amount` to `op_recipient` only |
| `restart_refund(invoice_id)` | that school's admin or owner | Status must be `RefundRecovered`, 10 minutes after recovery. Sends `op_amount` to `op_recipient` (the original payer) only |
| `withdraw_fees(amount)` | owner | Section 8 |
| `close_as_sent`, `retry_with_collateral`, `finalize_withdrawal_as_sent` | owner | Section 9.4. 10-minute wait, one item per call, no balance reading |
| `reclaim_surplus(amount)` | owner | Section 9.6. Maintenance mode, no frozen items, two balance readings, limited to unreconciled collateral |
| `maintenance_on`, `maintenance_off` | owner | Blocks all money movement for `reclaim_surplus` |
| `pause`, `unpause` | owner | Pause blocks new payments, new invoices, settlement and fee withdrawals. Refunds and cancellations stay allowed |
| Views | anyone | schools, invoices, all ledger buckets, `L_min`, `L_max`, solvency |

## 6. Payment, settlement and refund flows

Payment: parent calls `ft_transfer_call` on USDC (receiver = registry, msg = invoice id). `ft_on_transfer` accepts only if all hold: caller is the configured token, invoice is `Pending`, school is `Active`, not paused, amount equals the invoice amount exactly, and `M + A <= 5,000 USDC`. Otherwise it returns the full amount and the token refunds the payer. On acceptance: `PaymentReceived`, payer, treasury and fee snapshots, `H += A`.
Settlement: section 4.3. Sends only `net_amount` to the treasury snapshot. Recipient and amount are never parameters.
Refund: full `A` to the payer, no fee, then the invoice returns to `Pending`.
After `Paid`, no on-chain refund exists. The school returns money from its own treasury and records it as a note.

## 7. Treasury registration

The school admin registers the treasury with USDC from their own wallet (`storage_deposit` with the treasury as the account, `registration_only`, amount read live from the token's `storage_balance_bounds`; reported minimum is 0.00125 NEAR). The registry only verifies with `storage_balance_of` and keeps no deposit for it.
- `register_school` keeps the school record only if the verification callback returns a registered balance. Otherwise it refunds the deposit attached for the registry's own storage.
- `approve_school` re-verifies and activates in its callback. There is no other route to `Active`.
- `queue_treasury_change` and `apply_treasury_change` verify too. The platform treasury is verified when set.
- Already registered, insufficient deposit, failed registration and excess deposit are handled by the token (refund to the admin) and by the verification step, as listed in the earlier outline, section 4.3.
- The registry account itself must be registered with USDC once after deployment. The health check reports this.

## 8. Platform fee withdrawal

Fees move `FA` to `FW` before the transfer and come back on failure (section 4.3). Callbacks remove a stored withdrawal record first, so a replay does nothing. Fees can never fund school payouts because payouts are computed from invoice records, not from the balance. The platform treasury is the separate dedicated account, verified as USDC-registered.
A stuck withdrawal is resolved with the same propose, verify and execute method as in section 9, with `FW` in place of `SI`.

## 9. Stuck-operation recovery (revised: freeze by default, no true/false claim)

### 9.1 Your concern is correct
A NEAR contract cannot read the outcome of an earlier transaction, and a balance check cannot prove it. The pooled balance is also unreliable as evidence: a payment that the token has credited but whose `ft_on_transfer` has not run yet raises the balance before the ledger knows about it. The earlier version of this section (a balance check that "verified" the owner's true/false claim) is withdrawn.
The new rule: the contract never tries to learn whether a transfer happened. It makes ignorance safe.

### 9.2 Principles
1. Freeze by default. A `Settling` or `Refunding` invoice, or a pending fee withdrawal, with no callback stays frozen indefinitely. There is no timeout that releases it. The frozen amount stays in its in-flight bucket (`SI`, `RI`, `FW`), so no other operation can spend it (S1 holds).
2. No method restores a frozen item to a payable state without collateral. There is no boolean claim to get wrong.
3. Any action that could cause a second payout is backed by platform money (`FA`), never by school money.
4. Recovery methods are pure ledger operations in a single receipt. They read no balance, so nothing can change underneath them.

### 9.3 Prevention (making a missing callback very unlikely)
- Each settlement, refund and withdrawal is rejected at the start, with no state change, unless the caller attached enough gas for the transfer plus the callback.
- The callback is tiny: no cross-contract calls, no panics, checked arithmetic done before the transfer starts. Reserved callback gas is at least 3 times the measured worst case.
- The operation is refused at the start if the registry's free NEAR balance (above its storage requirement) is below a reserve, because a callback that cannot write state is the realistic cause of a stuck item.
- The callback receipt is created together with the transfer. It cannot be dropped, only fail.

### 9.4 What the owner can do with a frozen item (owner only, 10 minutes after the operation started, one item per call)

| Method | Meaning | Collateral | Effect if the original transfer really left | Effect if it did not |
|---|---|---|---|---|
| `close_as_sent(id, evidence)` | Accept that it was sent. No money moves | none | Ledger now matches reality | School or payer is unpaid. Other schools unaffected. The stranded amount sits in the pool as surplus |
| `retry_with_collateral(id, evidence)` | Assume it left. Move the item to the recovered status of the SAME operation type, funded out of platform fees. No payout happens in this call | `FA >= net` (settlement) or `FA >= A` (refund) | After the restart the school or payer is paid twice, paid from platform fees | Paid once. The stranded copy is later returned to the platform by `reclaim_surplus` |
| `finalize_withdrawal_as_sent(withdrawal_id)` | Accept that a fee withdrawal left | none | Correct | Platform fees stranded as surplus. Reclaimable |

- Fee withdrawals have no retry or restore method. Putting a frozen withdrawal back into `FA` could overstate fees if it had really left, and the shortfall would fall on school money. The only safe move is to treat it as sent.
- Operation type is pinned. `retry_with_collateral` reads `op_type` from the frozen item and moves it to the matching status: a frozen `Settling` invoice becomes `SettlementRecovered`, a frozen `Refunding` invoice becomes `RefundRecovered`. It never returns to `PaymentReceived`. It sets `recovered = true` and `recovered_at`, bumps `attempt_id`, adds the collateral to `unreconciled_collateral`, and requires `unreconciled_collateral + collateral <= max_unreconciled` (1,000 USDC on testnet).
- The only exits from the recovered statuses:
  - `SettlementRecovered` to `Settling`, through `restart_settlement`, sending `op_amount` to `op_recipient` (the original school treasury snapshot).
  - `RefundRecovered` to `Refunding`, through `restart_refund`, sending `op_amount` to `op_recipient` (the original payer).
  - Each restart needs 10 minutes since `recovered_at`, and is callable only by the owner or that invoice's school admin. If the restarted operation fails (callback runs and reports failure), the invoice goes back to the same recovered status, not to `PaymentReceived`. If it succeeds, a settlement ends `Paid` and a refund ends `Pending`. If it gets stuck again, it is frozen again, with the same two recovery choices and the same pinned type.
- Eligibility by status, with no exceptions: `settle_invoice` and `refund_payment` accept only `PaymentReceived`. `cancel_invoice` accepts only `Pending`. `ft_on_transfer` accepts only `Pending`. A recovered invoice therefore cannot be settled when it is a refund, cannot be refunded when it is a settlement, cannot be cancelled and cannot take a new payment.
- Snapshots are preserved: payer, school, treasury, fee and net amounts are never recomputed during recovery. A later treasury change, admin change or fee-rate change does not alter `op_recipient`, `op_amount` or the fee.
- Ordinary failures are different: when the callback runs and reports that a transfer failed, nothing moved and the callback itself is the proof, so the invoice returns to `PaymentReceived`, as in v2, and the school admin may choose settlement or refund again.
- The automatic settlement service only looks at `PaymentReceived`, so it never touches recovered invoices.
- Recovery and restart bump `attempt_id`. Every callback carries `(invoice_id, attempt_id, op_type)` and is applied only if the status, the attempt id and the operation type all match, so a late or stale callback, or a callback of the other operation type, is ignored.
- Neither needs the registry to be paused, because neither reads a balance.
- `retry_with_collateral` can be disabled with a contract setting (`allow_retry`), intended to be off on mainnet. With it off, frozen items can only be closed.

### 9.5 Ledger changes

| Item | `close_as_sent` | `retry_with_collateral` |
|---|---|---|
| Settlement (`A`, fee, net) | `SI -= A`, `SF -= fee`, `FA += fee`, status `Paid` | `SI -= A`, `SF -= fee`, `H += A`, `FA -= net`, `unreconciled += net`, status `SettlementRecovered`, `recovered` |
| Refund (`A`) | `RI -= A`, status `Pending` | `RI -= A`, `H += A`, `FA -= A`, `unreconciled += A`, status `RefundRecovered`, `recovered` |
| Withdrawal (`w`) | `FW -= w` | not available |

Why this keeps the pool solvent in both truths. `L_min = H + SF + FA` is unchanged by `retry_with_collateral` (the `H += A` is offset by `SF -= fee` and `FA -= net`, since `A = net + fee`). Whether the original payout left or not, the real balance already satisfied `B >= L_min` (S1), so the new ledger is covered without using any other school's money. `close_as_sent` only moves `SF` into `FA`, which leaves `L_min` unchanged too.

### 9.6 Returning stranded money to the platform: `reclaim_surplus(amount)` (owner only)
Only needed after a retry whose original transfer did not leave, or after a close that proved wrong.
- Allowed only in `maintenance` mode held for at least 10 minutes. Maintenance blocks payments (they are returned), settlement, refunds and withdrawals, so nothing is in motion.
- Allowed only when there are no frozen items and `SI = RI = FW = 0`.
- The contract reads its balance twice, at least 10 minutes apart during maintenance, and uses the lower reading. Surplus = `B - (H + FA)`.
- `amount <= surplus` and `amount <= unreconciled_collateral`. The second limit means the platform can only reclaim what it previously put up as collateral, so a miscalculated surplus can never create fee money out of school funds.
- Effect: `FA += amount`, `unreconciled -= amount`.
- A stranded amount from a wrong `close_as_sent` is not covered by `unreconciled_collateral`, so it is not reclaimable on chain. It stays in the pool as surplus and is handled by a decision of the owner outside the contract, or by a future version.

### 9.7 Answers to your six questions
1. How does it know whether the transfer succeeded? It does not, and it never needs to. Neither the balance nor anything else on chain can prove it. Off-chain evidence is recorded in an event and used only by a human to choose between the two actions in 9.4, both of which are safe for other schools in either case.
2. Callback missing, can the invoice be paid twice? No automatic path exists: `Settling` has no exit except the matching callback, `close_as_sent` (no payout) and `retry_with_collateral` (an explicit owner action). If the owner uses retry and the first payout really left, the school is paid twice. That duplicate is paid from platform fees, not from other schools, and is capped at 1,000 USDC outstanding. If you want a strict "never twice", turn `allow_retry` off: items then stay frozen or are closed.
3. Wrong "not sent" claim: there is no such claim. The only way out of a frozen item that can lead to another payout is `retry_with_collateral`, and it needs `FA` to cover the possible duplicate. It leads to the recovered status of the same operation type, never to `PaymentReceived`. On-chain checks: item is `Settling` or `Refunding`, 10 minutes elapsed, `FA >= net` (or `A`), `unreconciled` cap not exceeded, `allow_retry` on, caller is the owner.
4. Refunds and withdrawals: refunds use the same two actions with the full amount as collateral, and a recovered refund can only be restarted as a refund to the original payer (section 9.4). Withdrawals can only be closed as sent. In all cases the effect on other schools' funds is none, by the `L_min` argument in 9.5.
5. Recovery lock: recovery methods read no balance and run atomically, so no concurrent operation can interfere with them. Other operations on other invoices continue normally and the frozen amount is excluded from everything they use. Only `reclaim_surplus`, which does read the balance, requires maintenance mode, which blocks every other money movement, plus two readings 10 minutes apart.
6. Tests: section 14.

### 9.8 What stays unsolved
- A wrong `close_as_sent` leaves one school unpaid (stranded amount). It does not touch other schools. The runbook (explorer receipt check plus treasury balance before and after) is the control.
- A `retry_with_collateral` after a payout that really left costs the platform up to one net amount per incident.
- Both are deliberate: the contract trades liveness for one invoice against the safety of every other school's funds.

## 10. Storage
As in the earlier outline, section 7: `1250000000000000000000` yoctoNEAR is 0.00125 NEAR (the token's registration minimum, read live). School and invoice records are charged at their measured size against the school's prepaid storage balance, and the registry keeps enough NEAR for its own storage.

## 11. Owner verification
Before deployment, `mouseng20.testnet` proves control of the account by signing in through the app's existing signed-message check, which also confirms the signing key is a full-access key. The contract is initialized with that account as owner only after this succeeds. Testnet accepts a single key. Mainnet requires a multisig owner, decided separately.

## 12. Automatic settlement service (built after integration tests pass)
- Not built now. Planned only after the v3 contract has passed the testnet integration tests in section 14.
- A dedicated settler account holds only a small NEAR balance for gas and no USDC. It uses a function-call key restricted to `settle_invoice` on the v3 contract, with a small allowance.
- The key lives only in the server environment, never in the repository or the browser.
- It watches for `PaymentReceived`, calls `settle_invoice`, backs off on failure, makes at most one attempt per invoice per few minutes, and ignores every status other than `PaymentReceived`.
- It never changes who is paid or how much, because settlement is permissionless and fixed by stored data. The payer's Finish payment button stays as the fallback.

## 13. Application changes
As in the earlier outline, sections 9 and 10, plus:
- Owner console shows every bucket, `L_min`, `L_max`, money at risk against the 5,000 USDC cap, and a recovery tool that shows the contract's verdict before submitting.
- The v3 adapter keeps all eight on-chain status names internally. The two new statuses, `SettlementRecovered` and `RefundRecovered`, show as Processing to parents and as "Needs recovery restart" to the school admin and owner, with the matching restart button.
- The invoice form and the API reject amounts above 1,000 USDC.
- The CSV adds Gross, Platform fee, Net, Contract version and a Recovered flag.

## 14. Tests required before deployment

Accounting timeline (simulate each step and callback separately):
- Settlement: after start, after payout executes, after success callback. S1 holds at every step and S2 holds when idle.
- Settlement with failed payout: ledger and invoice return to `PaymentReceived`.
- Settlement where the callback never runs: ledger stays correct, invoice cannot be settled again, cannot be refunded or cancelled.
- The same three cases for refunds and for fee withdrawals.
- Several schools with interleaved settlements, refunds and withdrawals: `H` equals the per-school sums, and each school receives exactly its own net amounts.
- Cap tests: invoice of 1,000 USDC accepted, above rejected, payment that would push money at risk above 5,000 USDC refunded in full.

Recovery and accounting tests (exact scenarios). Notation: USDC amounts in whole units for readability (the contract uses base units). Fee 1%. Common setup unless stated: school 1 has invoice I1 with `A = 100` (fee 1, net 99), school 2 has invoice I2 with `A = 200` (fee 2, net 198), both `PaymentReceived`, `FA = 5`, so `H = 300`, `B = 305`. `L_min = H + SF + FA`.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| T1 | Transfer succeeded, callback missing, owner closes | 1. Settle I1: `H=200, SI=100, SF=1`. 2. Payout executes: `B=206`. 3. Drop the callback. 4. Settle I2 normally: payout 198, callback ok: `SI=100, SF=1, FA=7, H=0, B=8`. 5. `close_as_sent(I1)` at minute 9 | Step 3 to 4: I1 stays `Settling`, second settle of I1 rejected, refund and cancel of I1 rejected, `B(206) >= L_min(206)` then `B(8) >= L_min(8)`. Step 5 rejected (under 10 minutes). Again at minute 10: `SI=0, SF=0, FA=8`, I1 `Paid`, `B=8 >= H+FA=8` |
| T2 | Transfer failed, callback missing, owner closes (wrong) | Settle I1, payout fails (`B=305`), drop callback, `close_as_sent(I1)` after 10 minutes | I1 `Paid`, `FA=6`, `H=200`, `B=305`, surplus 99. S1 holds. School 2 still settles 198. `reclaim_surplus` rejected (`unreconciled=0`). School 1 unpaid. Documented residual (9.8) |
| T3a | Retry without enough collateral | Same as T1 steps 1 to 3, `FA=5`, `retry_with_collateral(I1)` after 10 minutes | Rejected (`FA 5 < net 99`). I1 stays frozen. Nothing else changes |
| T3b | Retry, original payout had left | Setup with `FA=120` (`B=420`). Settle I1, payout executes (`B=321`), drop callback. After 10 minutes `retry_with_collateral(I1)`. Then, 10 minutes later, the owner calls `restart_settlement(I1)` | After retry: `SI=0, SF=0, H=300, FA=21, unreconciled=99`, I1 `SettlementRecovered` and `recovered`, `B=321 >= H+SF+FA=321`. `settle_invoice(I1)` and `refund_payment(I1)` are rejected. `restart_settlement(I1)` is rejected under 10 minutes and for any account other than the owner or school 1's admin. After the allowed restart (`H=200, SI=100, SF=1`), the payout and callback: `H=200, FA=22, B=222 >= 222`. School 1 received 198 in total, `FA` fell by 98. School 2's I2 is still fully covered and settles |
| T3c | Retry, original payout had not left | Same setup, payout fails (`B=420`), drop callback, `retry_with_collateral`, then `restart_settlement` succeeds | After second settlement: `H=200, FA=22, B=321`, surplus 99 equal to `unreconciled`. School 1 paid once. `reclaim_surplus(99)` in maintenance after two readings: `FA=121, unreconciled=0`. `reclaim_surplus(100)` rejected |
| T4 | No other way out of a frozen item | With I1 frozen, call every method as owner, school 1 admin, school 2 admin and anyone: `settle_invoice`, `refund_payment`, `cancel_invoice`, `create_invoice` with the same id, `resolve` variants, pause, maintenance | Everything rejected except the matching callback and the two owner recovery methods under their conditions. I1 never reaches `PaymentReceived`, `SettlementRecovered` or any payable state without `retry_with_collateral`. There is no exit that pays a different recipient or amount |
| T5 | Failed transfer, callback delivered | Settle I1, payout fails, callback runs | `SI=0, SF=0, H=300, FA=5`, I1 `PaymentReceived`, `B=305` |
| T6 | Late and repeated callbacks | After T1 step 5 deliver the original callback. After T3b retry deliver the original callback. After T3b restart deliver the original and the retry-time attempt ids. Deliver a successful callback twice | Each ignored (`attempt_id`, status or `op_type` mismatch). Ledger and status unchanged. Event logged |
| T7a | Simultaneous settle and refund of I1 | Both in the same block | One starts, the other is rejected. `SI + RI = 100` |
| T7b | Interleaved callbacks of I1 and I2 in both orders | Settle both, deliver callbacks in either order | Same final ledger: `H=0, FA=8, B=8`. Each school got only its own net |
| T7c | Withdrawal while settlements are in flight | `FA=5`: settle I1 (fee 1 in `SF`), `withdraw_fees(6)` | Rejected (`6 > FA 5`). `withdraw_fees(5)` accepted: `FA=0, FW=5`. After I1's callback `FA=1`. Withdrawal never uses `SF` |
| T7d | New payment during a frozen item | I1 frozen, school 2 invoice I3 (`A=50`) paid | Accepted, `H` rises, I1's frozen amount unchanged. Money at risk counts the frozen `SI` against the 5,000 USDC cap |
| T7e | Two recovery calls on the same item | Two owner calls `retry_with_collateral(I1)` in one block | First succeeds, second rejected (status already `SettlementRecovered`). Collateral taken once |
| T8a | Stuck refund, owner closes | Refund I1: `RI=100`, payout executes (`B=205`), drop callback, `close_as_sent(I1)` after 10 minutes | `RI=0`, I1 `Pending`, payer received money. `B(205) >= H(200)+FA(5)` |
| T8b | Stuck refund, retry | `FA=120`, same refund, `retry_with_collateral(I1)` | `RI=0, H=300, FA=20, unreconciled=100`, I1 `RefundRecovered`, `recovered`. S1 holds in both truths |
| T9 | Stuck fee withdrawal | `FA=5`, `withdraw_fees(5)`, payout executes, drop callback | `FA=0, FW=5`. Restore method does not exist. `finalize_withdrawal_as_sent` after 10 minutes: `FW=0`. School funds untouched |
| T10 | `reclaim_surplus` guards | Try: not in maintenance, maintenance under 10 minutes, a frozen item present, amount above surplus, amount above `unreconciled`, second reading lower than the first, non-owner | All rejected. With a payment in flight during maintenance the payment is returned and does not affect the readings |
| T11 | Freeze is permanent without owner action | Leave I1 frozen for a long simulated time | No state change. No automatic release, timeout or callback replay |
| T12 | Prevention | Settle with too little prepaid gas. Settle with the registry's free NEAR below the reserve. Measure callback gas on the worst case | Both rejected with no state change. Measured gas times 3 is at most the reserved callback gas |
| T13 | `allow_retry` off | Run T3b with `allow_retry = false` | `retry_with_collateral` rejected. Only `close_as_sent` available |
| T14 | Phantom credit | During a long sequence of payments, settlements and recoveries, run a solvency check at each step | S1 holds at every step. No recovery decision ever used a balance reading |
| T15 | Solvency across many schools | Random sequences of payments, settlements, refunds, failures, dropped callbacks and recoveries over 3 schools, 200 steps | After each step `B >= L_min`. After all items are resolved and the registry is idle, `B >= H + FA` |
| T16 | A recovered refund cannot pay the school | After T8b (I1 `RefundRecovered`), as anyone, owner, school 1 admin and the payer call `settle_invoice(I1)`, `restart_settlement(I1)`, `cancel_invoice(I1)` and send a new payment to I1 | All rejected. School 1's treasury balance is unchanged. `H`, `FA` and `RI` unchanged |
| T17 | The original payer receives the restarted refund | Continue T16: `restart_refund(I1)` at 9 minutes, then at 10 minutes by school 1 admin | At 9 minutes rejected. At 10 minutes: `Refunding`, `H=200, RI=100`, `ft_transfer(payer, 100)` where payer is the snapshot from the original payment. Payout executes, callback: `RI=0`, I1 `Pending`. A refund call with any extra recipient argument is rejected |
| T18 | Snapshots survive recovery | Between recovery and restart: school 1 changes its treasury (after the 24-hour delay), transfers its admin role and the owner changes its fee rate. Then restart a recovered settlement (T3b) and a recovered refund (T8b) | The settlement pays the original treasury snapshot exactly `net_amount` with the original fee. The refund pays the original payer exactly `amount`. `op_recipient`, `op_amount`, fee and net are unchanged |
| T19 | Late callbacks cannot interfere with a recovered refund | I1 `RefundRecovered` (attempt n+1). Deliver the original refund callback (attempt n). Deliver a settlement callback carrying attempt n+1. Then restart the refund (attempt n+2) and deliver the n, n+1 and a settlement-type n+2 callback before the real one | All ignored. Only the refund callback for attempt n+2 applies. No payout to the school, ledger changes only as in T17 |
| T20 | Wrong-type exits are impossible | From `SettlementRecovered` call `refund_payment`, `restart_refund`, `cancel_invoice`. From `RefundRecovered` call `settle_invoice`, `restart_settlement`, `cancel_invoice`. Try with every role | All rejected. No sequence of calls by any account changes the operation type of a recovered invoice |
| T21 | Restarted operation fails | Restart a refund and a settlement with the payout failing, callback delivered | Each returns to its own recovered status (`RefundRecovered`, `SettlementRecovered`), `H` restored, never to `PaymentReceived` |
| T22 | Restarted operation gets stuck again | Restart a refund, drop the callback | I1 frozen as `Refunding` with `op_type = Refund`. `close_as_sent` and `retry_with_collateral` available again within the `max_unreconciled` cap, type still `Refund` |
| T23 | Ordinary refund failure | Refund I1 with the callback delivered reporting failure | I1 `PaymentReceived` (nothing moved, the callback is proof). Settlement or refund may be chosen again |

Registration and permissions: treasury cases (registered, unregistered, insufficient deposit, excess deposit, unregistered before approval), owner-only methods, one school per admin, owner cannot be a school admin, cross-school attempts on every method, two-step admin transfer, treasury change delay and re-verification, pause behavior (blocks payments and settlement, allows refunds and cancellations).
Payments and fees: exact amount, under and over payment, wrong token, unknown invoice, suspended school, rounding at 1 unit, at 5% and at zero, rate change affecting only new invoices, storage charge and top-up.
Application: the list in the earlier outline, section 11, plus owner console figures matching the chain.
Two payments for one invoice at the same moment, on testnet, before sign-off.

## 15. Remaining items before approval
1. Name of the new dedicated platform fee treasury account (it must be created and registered with USDC first).
2. Confirmed: the owner `mouseng20.testnet` (after signed-message verification) cannot be a school admin, and the v3 demo school uses a different admin account.
3. Your decision on the recovery model in section 9: freeze by default, `close_as_sent`, collateral-backed `retry_with_collateral`, and `allow_retry` (on for testnet, off for mainnet).
4. Your explicit approval of this specification. After that, your NEAR developer implements and deploys v3 to a new testnet account, and I review it before changing the app. `v2.studentfee.testnet` stays untouched.

The limits above are for testnet and must be reviewed before any mainnet use.



I have reviewed the revised section 9. The freeze-by-default and collateral-backed recovery approach is an improvement, but I found an issue that needs to be corrected before approval.

Critical issue: refund recovery

In section 9.5, "retry_with_collateral" handles a stuck refund by:

- Reducing "RI" by the invoice amount.
- Restoring the amount to "H".
- Deducting collateral from "FA".
- Changing the invoice status to "PaymentReceived".

However, "PaymentReceived" allows "settle_invoice" to be called.

This creates a dangerous possibility: an invoice whose refund was being retried could subsequently be settled to the school's treasury instead of being refunded to the original payer.

Please revise this.

My requirements:

1. A recovered settlement must only be retried as a settlement to the original school's treasury.
2. A recovered refund must only be retried as a refund to the original payer.
3. The two recovery paths must have distinct states or otherwise enforce their original operation type.
4. A recovered refund must never become eligible for "settle_invoice".
5. Preserve the original payer, school, treasury, amount and fee snapshots throughout recovery.
6. Add tests proving that a recovered refund cannot accidentally pay the school, that the original payer receives the retry, and that late callbacks cannot interfere.

Please also update the recovery tables and test scenarios to reflect this distinction.

Do not implement or deploy anything yet. I want to review the corrected specification first.


The other major decisions can remain:
Owner: mouseng20.testnet.
Owner cannot be a school admin.
Different admin for the v3 demo school.
allow_retry: ON for testnet, OFF for mainnet.
Existing v2 contract remains untouched.