# School Fee Registry v3: complete specification for final review

Status: complete draft for your approval. Nothing is implemented or deployed. `v2.studentfee.testnet` is never modified.
This document is self-contained. It replaces `docs/multi-school-architecture.md` and every earlier draft of this specification.

## 0. Decisions applied in this version

| # | Decision | Where |
|---|---|---|
| 1 | New terminal status `Refunded`. A `Refunded`, `Paid` or `Cancelled` invoice never accepts another payment. `ft_on_transfer` accepts `Pending` only. The payment snapshot is written once and is immutable for the invoice's lifetime | 2, 3, 6 |
| 2 | `reclaim_surplus`, maintenance mode and every balance-reading procedure are removed. Unidentifiable surplus is locked permanently. Collateral is never replenished | 4, 9 |
| 3 | Invoice-level `attempt_counter` (only increases) separated from the operation record (`op_type`, `op_recipient`, `op_amount`, active attempt id) | 3, 6.1 |
| 4 | Recovered states are absolute: `SettlementRecovered` exits only by `restart_settlement` or `close_as_sent`, `RefundRecovered` only by `restart_refund` or `close_as_sent` | 5, 9 |
| 5 | All ledger transitions recalculated, with worked examples for repeated recovery, stuck restarts, interleaving and fee withdrawals | 4 |
| 6 | Tests for all 14 required items plus the earlier suites | 13 |
| 7 | Unchanged: owner, fees, limits, separate fee treasury, deferred automatic settlement, non-upgradeable v3, v2 untouched | 1 |

## 1. Parameters

All limits are for testnet and must be reviewed before any mainnet use. This document writes no mainnet configuration.

| Setting | Value |
|---|---|
| Platform owner | `mouseng20.testnet`, after signed-message ownership verification (section 11). Never a school administrator |
| v3 demo school administrator | A different account from the owner |
| Platform fee treasury | A separate dedicated account. **Name still pending. Not invented here.** `withdraw_fees` stays disabled until the owner sets and verifies it |
| Default platform fee | 1% (100 bps). Cap 5% (500 bps) |
| Maximum invoice | 1,000 USDC (`1000000000` base units) |
| Maximum money at risk | 5,000 USDC (`5000000000`), counting `H + SI + RI` |
| Treasury change delay | 24 hours (testnet) |
| Wait before each recovery, and before each restart | 10 minutes |
| `allow_retry` | `true` on testnet. Intended `false` for mainnet |
| Collateral-backed recoveries per invoice | At most 2 |
| Lifetime collateral commitment, global | At most 1,000 USDC (`max_lifetime_collateral`). Monotonic, never replenished |
| Automatic settlement service | Built only after the contract passes the testnet integration tests (section 12) |
| Upgradeable | No |

## 2. Statuses and lifecycle

Nine statuses. The six v2 names are unchanged; `Refunded`, `SettlementRecovered` and `RefundRecovered` are new in v3.

| Status | Meaning | Terminal |
|---|---|---|
| `Pending` | Created, unpaid. The only status that accepts a payment | No |
| `PaymentReceived` | Exact payment held. The school can settle or refund | No |
| `Settling` | Settlement transfer to the school treasury in flight (or frozen) | No |
| `Refunding` | Refund transfer to the payer in flight (or frozen) | No |
| `SettlementRecovered` | A stuck settlement was recovered with collateral. Awaiting restart or close | No |
| `RefundRecovered` | A stuck refund was recovered with collateral. Awaiting restart or close | No |
| `Paid` | Settled | Yes |
| `Refunded` | Refunded to the payer | Yes |
| `Cancelled` | Cancelled before payment | Yes |

Allowed transitions (anything else is rejected):
- `Pending` to `PaymentReceived` (payment accepted) or `Cancelled` (school admin).
- `PaymentReceived` to `Settling` (`settle_invoice`) or `Refunding` (`refund_payment`).
- `Settling` to `Paid` (callback success), to `PaymentReceived` (callback confirms an ordinary failure), or stays frozen if no callback.
- `Refunding` to `Refunded` (callback success), to `PaymentReceived` (callback confirms an ordinary failure), or stays frozen.
- Frozen `Settling` to `Paid` (`close_as_sent`) or to `SettlementRecovered` (`retry_with_collateral`). Frozen `Refunding` to `Refunded` (`close_as_sent`) or to `RefundRecovered` (`retry_with_collateral`).
- `SettlementRecovered` to `Settling` (`restart_settlement`) or `Paid` (`close_as_sent`). Nothing else.
- `RefundRecovered` to `Refunding` (`restart_refund`) or `Refunded` (`close_as_sent`). Nothing else.
- A restarted operation behaves like the original: success ends `Paid` or `Refunded`; a callback-confirmed failure returns to the same recovered status; no callback freezes it again.
- Neither recovered status can return to `PaymentReceived`, accept a payment, be cancelled, or switch operation type.

Consequences of `Refunded` being terminal: another payment needs a new invoice with a new id. An `invoice_id` can never be reused, in any status. The v2 behavior "refund returns to `Pending`" does not exist in v3.

## 3. Data model

School: `school_id`, `name` (80), `description` (200), `admin`, `treasury`, `status` (`PendingApproval`, `Active`, `Suspended`), `treasury_verified`, `fee_bps`, `storage_balance`, `created_at`, queued treasury change (`new_treasury`, `effective_at`). A unique `admin` to `school_id` index gives one school per administrator.

Invoice:
- Identity: `invoice_id` (32 lowercase hex, globally unique, never reused), `school_id`, `amount` (gross, at most 1,000 USDC), `due_date` (ms), `status`, `fee_bps` snapshot taken at creation.
- Payment snapshot, written once when the payment is accepted, then immutable for the invoice's lifetime: `payer`, `treasury`, `amount` (gross), `fee_bps`, `fee_amount = floor(amount * fee_bps / 10000)`, `net_amount = amount - fee_amount`, `paid_at` (ns). Because only `Pending` accepts payments and no path returns to `Pending`, nothing can ever write it a second time.
- `attempt_counter` (u64): invoice-level. Only increases. Never reset, decreased or reused. Incremented by every transfer start (`settle_invoice`, `refund_payment`, `restart_settlement`, `restart_refund`), by `close_as_sent` and by `retry_with_collateral`.
- Operation record, separate from the counter (cleared whenever the invoice reaches `Paid` or `Refunded` by any route, including `close_as_sent`, and after a callback-confirmed ordinary failure): `op_type` (`Settle` or `Refund`), `op_recipient` (treasury snapshot for `Settle`, payer snapshot for `Refund`), `op_amount` (`net_amount` for `Settle`, gross `amount` for `Refund`), `active_attempt_id` (the attempt id of the transfer in flight, empty when none is in flight), `operation_started_at` (ns).
- Recovery fields: `recovery_count` (0 to 2), `recovered_at` (ns).
- Created when the school chooses to settle or refund. At payment acceptance there is no operation record, because the school has not chosen yet. The record is derived only from the payment snapshot, never from arguments. No method accepts a recipient or an amount.

Global: `owner`, `platform_treasury` (unset until provided), `usdc_token`, `paused`, `allow_retry`, `max_invoice`, `max_at_risk`, `max_lifetime_collateral`, `lifetime_collateral`, the ledger buckets (section 4), and a counter and record for each fee withdrawal.

## 4. Ledger and accounting

### 4.1 Buckets (USDC base units; `A` = gross, `A = net + fee`)

| Name | Meaning |
|---|---|
| `H` | Gross of invoices in `PaymentReceived`, `SettlementRecovered` or `RefundRecovered`. In the contract, no transfer in flight |
| `SI` | Gross of invoices in `Settling` |
| `SF` | Fee part of `SI`. Stays in the contract whatever happens |
| `RI` | Gross of invoices in `Refunding` |
| `FA` | Platform fees earned and free to withdraw, or to back a recovery |
| `FW` | Fee withdrawals sent and not confirmed |
| `lifetime_collateral` | Total collateral ever committed by `retry_with_collateral`. Only increases |

`B` is the real USDC balance of the registry.
- `L_min = H + SF + FA`: what must be in the contract whatever the timing of any in-flight transfer.
- `L_max = H + SI + RI + FA + FW`: what is in the contract if no in-flight transfer has executed yet.
- Money at risk `M = H + SI + RI`.
- Funds belonging to a school are never used for recovery or fee withdrawals: the only sources are `FA` (and only `FA`). `H`, `SI`, `RI` are touched only by the invoice's own operations.

### 4.2 Invariants
- S1, always: `B >= L_min`. Holds before, during and after every transfer, with or without callbacks.
- S2, when nothing is in flight (`SI = RI = FW = 0`): `B >= H + FA`. Any excess is locked surplus.
- S3: `H`, `SI`, `RI` equal the sums of the gross amounts of invoices in the matching statuses.
- S4: no automatic path pays an invoice twice. The only second payout is a collateral-backed restart, limited by `recovery_count <= 2`, `FA >= collateral` and `lifetime_collateral <= max_lifetime_collateral`.
- S5: `lifetime_collateral` never decreases. There is no method that withdraws, assigns or reclaims surplus. Surplus (stray tokens, collateral that turned out unneeded, amounts stranded by a wrong `close_as_sent`) is locked permanently.
- S6: `FA >= 0` always, and `FA` changes only by: a fee credit on a successful settlement (callback success or `close_as_sent` of a settlement, frozen or `SettlementRecovered`), a decrease at fee withdrawal start, a restoration after a confirmed failed fee withdrawal, and a collateral debit. It never increases from unidentified surplus or any other source.
- S7: `withdraw_fees(w)` requires `w <= FA`. There is no path from surplus (`B - (H + FA)` or any unidentified amount) to `FA` or to any recipient.

### 4.3 Transition table (every change is made before the transfer is sent)

| Event | Ledger change | Real balance `B` |
|---|---|---|
| Payment accepted (`Pending` to `PaymentReceived`) | `H += A` | `+A` (token credits first) |
| `settle_invoice` or `restart_settlement` starts | `H -= A`, `SI += A`, `SF += fee` | unchanged |
| Settlement transfer executes | none | `-net` |
| Settlement callback success (`Paid`) | `SI -= A`, `SF -= fee`, `FA += fee` | unchanged |
| Settlement callback confirms failure | `SI -= A`, `SF -= fee`, `H += A`. Status `PaymentReceived` (or `SettlementRecovered` for a restart) | unchanged (nothing left) |
| `refund_payment` or `restart_refund` starts | `H -= A`, `RI += A` | unchanged |
| Refund transfer executes | none | `-A` |
| Refund callback success (`Refunded`) | `RI -= A` | unchanged |
| Refund callback confirms failure | `RI -= A`, `H += A`. Status `PaymentReceived` (or `RefundRecovered` for a restart) | unchanged |
| `withdraw_fees(w)` starts | `FA -= w`, `FW += w` | unchanged |
| Withdrawal executes | none | `-w` |
| Withdrawal callback success | `FW -= w` | unchanged |
| Withdrawal callback failure | `FW -= w`, `FA += w` | unchanged |
| `close_as_sent`, frozen settlement | `SI -= A`, `SF -= fee`, `FA += fee`. Status `Paid` | unchanged |
| `close_as_sent`, frozen refund | `RI -= A`. Status `Refunded` | unchanged |
| `close_as_sent`, `SettlementRecovered` | `H -= A`, `FA += fee`. Status `Paid` | unchanged |
| `close_as_sent`, `RefundRecovered` | `H -= A`. Status `Refunded` | unchanged |
| `retry_with_collateral`, frozen settlement (needs `FA >= net`) | `SI -= A`, `SF -= fee`, `H += A`, `FA -= net`, `lifetime += net`. Status `SettlementRecovered` | unchanged |
| `retry_with_collateral`, frozen refund (needs `FA >= A`) | `RI -= A`, `H += A`, `FA -= A`, `lifetime += A`. Status `RefundRecovered` | unchanged |
| `finalize_withdrawal_as_sent` | `FW -= w` | unchanged |

Note: every row that ends an invoice in `Paid` or `Refunded` (callback success or `close_as_sent`) also clears `active_attempt_id` and the operation record.

Why `B >= L_min` survives each step, in both truths (original transfer left or did not):
- Starting a settlement lowers `L_min` by `net` (the `H` drop of `A` is offset by `SF += fee`) and leaves `B` unchanged. The transfer then lowers `B` by `net`, which is still within `L_min`.
- Starting a refund lowers `L_min` by `A` and the transfer lowers `B` by `A`.
- Callback success: for a settlement `L_min` is unchanged (`SF` moves into `FA`). For a refund `L_min` is unchanged.
- Callback failure: `L_min` rises back by what the start removed, and `B` never fell, so `B >= L_min`.
- `retry_with_collateral`: `L_min` is unchanged. For a settlement `H += A`, `SF -= fee`, `FA -= net` sum to zero because `A = net + fee`. For a refund `H += A` and `FA -= A` sum to zero.
- `close_as_sent`: only moves buckets without increasing `L_min`: frozen settlement moves `SF` into `FA` (unchanged), frozen refund drops `RI` (not in `L_min`), recovered settlement `H -= A`, `FA += fee` lowers `L_min` by `net`, recovered refund `H -= A` lowers it by `A`.
- Fee withdrawal: `FA -= w` lowers `L_min` by `w`, and the transfer lowers `B` by `w`.
- A missing callback leaves the ledger in the "executed or not executed" window, where S1 holds either way.

### 4.4 Worked examples

Common setup for E1 to E3 and E5: school 1 invoice I1 with `A = 100` (fee 1, net 99), school 2 invoice I2 with `A = 200` (fee 2, net 198), both `PaymentReceived`, `FA = 300`, `H = 300`, `B = 600`, `lifetime = 0`.

E1. Settlement recovery, original payout had left, restart succeeds.
Every stage shows the invoice I1 (school 1). `ac` = `attempt_counter`, `rc` = `recovery_count`, `lc` = `lifetime_collateral`. The operation record is `(Settle, treasury of school 1, 99)` once written. I2 stays `PaymentReceived` throughout.

| Stage | I1 status | ac | active attempt | Operation record | rc | lc | H | SI | SF | FA | B | L_min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0. Start | `PaymentReceived` | 0 | none | none | 0 | 0 | 300 | 0 | 0 | 300 | 600 | 600 |
| 1. `settle_invoice(I1)` | `Settling` | 1 | 1 | written | 0 | 0 | 200 | 100 | 1 | 300 | 600 | 501 |
| 2. Payout executes, callback lost | `Settling` (frozen) | 1 | 1 | kept | 0 | 0 | 200 | 100 | 1 | 300 | 501 | 501 |
| 3. After 10 min `retry_with_collateral` | `SettlementRecovered` | 2 | none | kept | 1 | 99 | 300 | 0 | 0 | 201 | 501 | 501 |
| 4a. After 10 more min `restart_settlement` | `Settling` | 3 | 3 | kept | 1 | 99 | 200 | 100 | 1 | 201 | 501 | 402 |
| 4b. Payout executes, callback (attempt 3) succeeds | `Paid` | 3 | none | cleared | 1 | 99 | 200 | 0 | 0 | 202 | 402 | 402 |

After 4b the contract is idle: `B(402) >= H + FA = 402`, no surplus. School 1 received 99 twice (198), `FA` fell from 300 to 202 (platform lost 98). The attempt 1 callback (if it ever arrived) is ignored at stages 3 and 4 because `ac` and `active attempt` no longer match.

E2. Same as E1, but the original payout did not leave.
Stage 2: the payout failed, `B = 600`, callback lost. Stage 3 as in E1 (`FA = 201`, `lc = 99`, `B = 600 >= L_min = 501`). Stage 4: the restart's payout executes, `B = 501`, callback succeeds, `Paid`, `FA = 202`. Now `B(501) >= H + FA = 402`; the excess 99 is locked surplus that nothing can claim. School 1 received 99 once, and the platform's collateral of 99 is permanently committed (`lc = 99`).

E3. Repeated settlement recovery (independent scenario: the restart's payout executes but its callback is lost).
Setup as in E1 stage 0. Stages 0 to 3 are identical to E1. E3 then continues from stage 3 on its own path, not from E1's stage 4.

| Stage | I1 status | ac | active attempt | Operation record | rc | lc | H | SI | SF | FA | B | L_min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3. (as E1) first recovery | `SettlementRecovered` | 2 | none | kept | 1 | 99 | 300 | 0 | 0 | 201 | 501 | 501 |
| 4. After 10 min `restart_settlement` | `Settling` | 3 | 3 | kept | 1 | 99 | 200 | 100 | 1 | 201 | 501 | 402 |
| 5. Restart payout executes, callback lost | `Settling` (frozen) | 3 | 3 | kept | 1 | 99 | 200 | 100 | 1 | 201 | 402 | 402 |
| 6. After 10 min `retry_with_collateral` (second) | `SettlementRecovered` | 4 | none | kept | 2 | 198 | 300 | 0 | 0 | 102 | 402 | 402 |
| 7a. After 10 more min `restart_settlement` | `Settling` | 5 | 5 | kept | 2 | 198 | 200 | 100 | 1 | 102 | 402 | 303 |
| 7b. Payout executes, callback (attempt 5) succeeds | `Paid` | 5 | none | cleared | 2 | 198 | 200 | 0 | 0 | 103 | 303 | 303 |

Checks:
- Stage 3: `FA = 300 - 99 = 201`, `lc = 99`. Stage 6: `FA = 201 - 99 = 102`, `lc = 99 + 99 = 198`, `rc = 2`. Stage 7b: `FA = 102 + 1 (fee) = 103`.
- Each stage obeys `B >= L_min`. At stage 7b the contract is idle and `B(303) >= H + FA = 303`.
- School 1 received 99 three times (297) because the first two payouts really left. The platform lost `300 - 103 = 197`. `lc` stays 198 forever and is never replenished.
- The operation record is `(Settle, treasury of school 1, 99)` from stage 1 until stage 7b, when the terminal `Paid` clears it. At stage 6 the status is `SettlementRecovered`, never `PaymentReceived`, so I1 cannot be refunded.
- Callbacks of attempts 1 and 3 arriving after stage 6 are ignored (`ac = 4`, no matching active attempt). A callback of attempt 5 would be accepted only at stage 7a or 7b.

E3b. Alternative outcome to E3 stage 7b (the payout executes, but its callback is lost). Stages 0 to 7a are exactly as in E3. At stage 7b the payout (attempt 5) executes and `B = 303`, but the callback is lost instead of succeeding. I1 stays `Settling` (frozen) with `ac = 5`, active attempt 5, operation record kept, `rc = 2`, `lc = 198`, `H = 200`, `SI = 100`, `SF = 1`, `FA = 102`, `B = 303`, `L_min = 200 + 1 + 102 = 303`. A third `retry_with_collateral` is rejected because `rc = 2`, even though `FA` (102) and the lifetime cap (297 of 1,000) would still allow it. Only `close_as_sent` or staying frozen remain. `close_as_sent` after 10 minutes: `ac = 6`, `SI = 0, SF = 0, FA = 103`, status `Paid`, `active_attempt_id` cleared, operation record cleared, `B(303) >= H + FA = 303`.

E4. Refund recovery (setup as above, `FA=300`).
1. Refund I1: `H=200, RI=100`. Payout executes: `B=500`. Callback lost. `L_min = 200+0+300 = 500`. 2. `retry_with_collateral`: `RI=0, H=300, FA=200, lifetime=100`, `RefundRecovered`. `L_min = 300+200 = 500 = B`. 3. `restart_refund` (pays the original payer 100): `H=200, RI=100`, payout executes `B=400`, callback success: `RI=0`, `Refunded`. Idle: `B(400) >= H+FA = 400`. The payer received 200 in total, platform lost 100.

E5. Failed restart callback. I1 in `SettlementRecovered` (E1 stage 3). `restart_settlement`: `H=200, SI=100, SF=1`. Payout fails, callback confirms: `SI=0, SF=0, H=300`. I1 back to `SettlementRecovered` (not `PaymentReceived`), operation record kept, `recovery_count` and `lifetime` unchanged, `B=501 >= L_min = 501`.

E6. Interleaving across schools and a fee withdrawal. Setup: `FA=5`, I1 `A=100`, I2 `A=200`, `H=300`, `B=305`.
1. Settle I1: `H=200, SI=100, SF=1`. 2. `withdraw_fees(6)` rejected (`6 > FA=5`). 3. `withdraw_fees(5)`: `FA=0, FW=5`. 4. Settle I2: `H=0, SI=300, SF=3`. 5. All payouts execute: `B = 305-99-198-5 = 3`. `L_min = 0+3+0 = 3`. 6. Callbacks in any order: I1 success `FA=1`, I2 success `FA=3`, withdrawal success `FW=0`. Idle: `B(3) >= H+FA = 3`. No school's `H` was used for the withdrawal, and no fee was used for a school payout.
6'. If the I2 callback is lost, I2 stays `Settling` and frozen. `FA=1` only. A `retry_with_collateral` for I2 needs `FA >= 198` and is rejected, so I2 stays frozen. School 1's funds and the fees are untouched.

E7. Lifetime cap. `lifetime=900`. A recovery needing collateral 99: `900+99 = 999 <= 1,000`, accepted. The next needing 99: `999+99 > 1,000`, rejected. Nothing lowers `lifetime`, so after the cap is reached no further collateral-backed recovery is ever possible on this deployment. Only `close_as_sent` or freezing remain.

## 5. Roles and methods

Roles:
- Owner: approves, suspends and reactivates schools, sets fee rates (up to 5%), sets the platform treasury, pauses, withdraws fees, performs recovery (`close_as_sent`, `retry_with_collateral`, `finalize_withdrawal_as_sent`), two-step ownership transfer. Cannot be a school administrator. Cannot move school funds, only fees in `FA`.
- School admin: one school per account. Creates and cancels its own invoices, settles and refunds its own payments, restarts its own recovered operations, manages storage, proposes treasury and admin changes.
- Anyone: pays an invoice, calls `settle_invoice` on an invoice in `PaymentReceived`, reads views.

| Method | Caller | Conditions |
|---|---|---|
| `new(owner, usdc_token, limits)` | deployer, once | Called in the same transaction as deployment. `platform_treasury` unset |
| `register_school(name, description, treasury)` | anyone, payable | One school per admin. Treasury verified (section 7) |
| `approve_school(id, fee_bps)` | owner | Re-verifies treasury, fee <= 500 bps. `Active` only in the callback |
| `suspend_school`, `reactivate_school` | owner | Held funds can still settle and be refunded |
| `propose_admin`, `accept_admin` | admin, new admin | Two steps. Owner cannot be the new admin |
| `queue_treasury_change`, `apply_treasury_change` | school admin | Verified at queue and at apply. 24 hours apart. Does not change snapshots of existing payments |
| `deposit_storage`, `withdraw_storage` | school admin | Prepaid invoice storage |
| `create_invoice(school_id, invoice_id, amount, due_date)` | that school's admin | `Active`, not paused, amount <= 1,000 USDC, id never used, storage charged |
| `cancel_invoice(invoice_id)` | that invoice's school admin | `Pending` only |
| `ft_on_transfer(sender, amount, msg)` | USDC token only | Status exactly `Pending`, plus section 6 |
| `settle_invoice(invoice_id)` | anyone | Status exactly `PaymentReceived`, not paused |
| `refund_payment(invoice_id)` | that invoice's school admin | Status exactly `PaymentReceived` |
| `restart_settlement(invoice_id)` | owner or that school's admin | Status exactly `SettlementRecovered`, 10 minutes after `recovered_at`, not paused |
| `restart_refund(invoice_id)` | owner or that school's admin | Status exactly `RefundRecovered`, 10 minutes after `recovered_at` |
| `close_as_sent(invoice_id, evidence)` | owner | Frozen `Settling`/`Refunding` (10 minutes after `operation_started_at`) or `SettlementRecovered`/`RefundRecovered` (10 minutes after `recovered_at`) |
| `retry_with_collateral(invoice_id, evidence)` | owner | Section 9. Needs `allow_retry` |
| `finalize_withdrawal_as_sent(withdrawal_id)` | owner | Frozen withdrawal, 10 minutes after start |
| `withdraw_fees(amount)` | owner | `amount <= FA`, platform treasury set and verified, not paused |
| `set_platform_treasury(account)` | owner | Verified as USDC-registered |
| `pause`, `unpause` | owner | Pause blocks `ft_on_transfer` acceptance, `create_invoice`, `settle_invoice`, `restart_settlement` and `withdraw_fees`. Refunds, `restart_refund`, cancellations and recovery stay allowed |
| Views | anyone | schools, invoices (full snapshot and operation record), every bucket, `L_min`, `L_max`, `lifetime_collateral`, frozen items |

There is no method that withdraws, assigns or reclaims surplus, and no maintenance mode.

## 6. Payment, settlement and refund flows

Payment: parent calls `ft_transfer_call` on USDC (receiver = the invoice's contract, msg = invoice id). `ft_on_transfer` accepts only if all hold: caller is the configured token, the invoice status is exactly `Pending`, the school is `Active`, not paused, the amount equals the invoice amount exactly, and `M + A <= 5,000 USDC`. Otherwise it returns the full amount and the token refunds the payer. `Paid`, `Refunded`, `Cancelled`, the recovered statuses and every in-flight status therefore reject payments. On acceptance it writes the payment snapshot and sets `PaymentReceived`, `H += A`.
Settlement: `settle_invoice` sends only `net_amount` to the treasury snapshot, per section 4.3.
Refund: `refund_payment` sends the full gross amount to the payer snapshot, no fee, and ends `Refunded` on success.
After `Paid`, no on-chain refund exists. The school returns money from its own treasury and records it as a note.
After `Refunded`, the same invoice id is finished. A new payment needs a new invoice.

### 6.1 Attempt counter, operation record and callback rules
1. Payment accepted: only the payment snapshot is written. There is no operation record.
2. `settle_invoice` or `refund_payment` starts (from `PaymentReceived`), or a restart starts (from a recovered status). In the same call, before any promise: `attempt_counter += 1`, `active_attempt_id = attempt_counter`, `operation_started_at = now`; for a fresh start `op_type`, `op_recipient` and `op_amount` are derived from the payment snapshot; for a restart they are read from the existing operation record and must equal what the snapshot would give. The ledger moves per section 4.3.
3. Every transfer's callback carries `(invoice_id, attempt_id, op_type)` as recorded at send time. A callback changes state only if all four match: the invoice id, `attempt_id == active_attempt_id`, `op_type` equals the stored `op_type`, and the status is the expected in-flight status (`Settling` for `Settle`, `Refunding` for `Refund`). Otherwise it is ignored and an event is logged.
4. `retry_with_collateral` increments `attempt_counter` and clears `active_attempt_id`, which invalidates every earlier callback. It leaves `op_type`, `op_recipient` and `op_amount` untouched, because the invoice stays in a recovered status that will be restarted with the same record.
   `close_as_sent` increments `attempt_counter`, which invalidates every earlier callback, and, because it always moves the invoice to `Paid` or `Refunded`, it clears both `active_attempt_id` and the operation record in the same call. Whenever an invoice reaches `Paid` or `Refunded`, by callback success or by `close_as_sent`, both are cleared.
5. Callback success: `Settle` gives `Paid`, `Refund` gives `Refunded`. `active_attempt_id` and the operation record are cleared (the invoice is terminal).
6. Callback confirms an ordinary failure of an attempt started from `PaymentReceived`: the operation record is cleared, `active_attempt_id` is cleared and the status is `PaymentReceived`. The next settlement or refund decision receives a fresh attempt id.
7. Callback confirms a failure of a restart: the status returns to the same recovered status, `active_attempt_id` is cleared and the operation record is kept.
8. `attempt_counter` never decreases, never resets and never repeats, so no old callback can match a newer attempt, including across several recoveries and restarts.

## 7. Treasury registration
The school admin registers the treasury with USDC from their own wallet (`storage_deposit` with the treasury as the account and `registration_only`; the amount is read live from the token's `storage_balance_bounds`; the reported minimum is `1250000000000000000000` yoctoNEAR, which is 0.00125 NEAR). The registry only verifies with `storage_balance_of` and never holds that deposit.

| Case | Result |
|---|---|
| Already registered | Registration step skipped, or the token refunds the whole deposit to the caller. Verification passes |
| Insufficient deposit | The token rejects the call and NEAR returns the attached amount. Nothing changes |
| Registration fails | The treasury stays unregistered, `register_school` fails verification, its deposit for the registry's own storage is returned |
| Excess deposit | The token refunds the excess to the caller, who is the admin and not the registry |
| Unregistered between registration and approval | `approve_school` re-verifies and does not activate |
| Unregistered later | A settlement transfer fails, the callback confirms, the invoice returns to `PaymentReceived`, funds stay safe and refundable |

`register_school` keeps the record only if the verification callback returns a registered balance. `approve_school` re-verifies and sets `Active` in its callback. There is no other route to `Active`. `queue_treasury_change`, `apply_treasury_change` and `set_platform_treasury` verify too. The registry account itself must be registered with USDC once after deployment (health check).

## 8. Platform fees
- Parents pay exactly the invoice amount. The fee is deducted from the school's share: `fee = floor(A * fee_bps / 10000)`, computed once at payment acceptance and stored in the snapshot. Default 1%, cap 5%.
- Fees enter `FA` only on a successful settlement (or `close_as_sent` of a settlement) and leave it only through `withdraw_fees` and collateral debit.
- `withdraw_fees(w)` (owner): requires `w <= FA`. `FA -= w`, `FW += w`, a stored withdrawal record, `ft_transfer` to the platform treasury, callback removes the record first (replay does nothing) and applies success or failure per section 4.3.
- A stuck withdrawal can only be closed with `finalize_withdrawal_as_sent`. There is no restore, because restoring could overstate `FA`.
- Fee withdrawals and collateral are funded from `FA` only. They never touch `H`, `SI`, `RI` or `SF`.
- The platform treasury is a separate dedicated account (name pending), verified as USDC-registered, and `withdraw_fees` is disabled until it is set.

## 9. Stuck-operation recovery

### 9.1 Principles
A NEAR contract cannot read the outcome of an earlier transaction, and the pooled balance cannot prove it. The contract therefore never tries to learn it. It makes ignorance safe:
1. Freeze by default. A `Settling` or `Refunding` item with no callback stays frozen indefinitely and its amount stays in `SI` or `RI`. No timeout releases it.
2. Any action that could cause a second payout is paid for with platform fees (`FA`), never with school funds.
3. The operation type, recipient and amount are pinned. Recovery cannot change them.
4. Recovery methods are ledger-only operations in one receipt. They read no balance and use no surplus.
5. Unidentifiable surplus is locked forever. Nothing can claim it.

### 9.2 Prevention
- A start is rejected, with no state change, unless the caller attached enough gas for the transfer plus the callback.
- The callback is tiny, with no cross-contract calls and no panics. Reserved callback gas is at least 3 times the measured worst case.
- A start is refused if the registry's free NEAR balance (above its storage requirement) is below a reserve.
- The callback receipt is created together with the transfer. It can fail but not be dropped.

### 9.3 What the owner can do with a frozen or recovered item

| Item state | `close_as_sent` | `retry_with_collateral` | Restart |
|---|---|---|---|
| Frozen `Settling` | `Paid`, no payout | `SettlementRecovered`, needs `FA >= net` | none until recovered |
| Frozen `Refunding` | `Refunded`, no payout | `RefundRecovered`, needs `FA >= A` | none until recovered |
| `SettlementRecovered` | `Paid`, no payout | not available | `restart_settlement` to `Settling` |
| `RefundRecovered` | `Refunded`, no payout | not available | `restart_refund` to `Refunding` |
| Frozen withdrawal | `finalize_withdrawal_as_sent` | not available | not available |

Absolute restrictions:
- `SettlementRecovered` exits only through `restart_settlement` or `close_as_sent`. `RefundRecovered` exits only through `restart_refund` or `close_as_sent`.
- A recovered refund never pays a school treasury, and a recovered settlement never refunds the payer, because `op_recipient` and `op_amount` come from the pinned record and no method takes either as an argument.
- Neither recovered status can return to `PaymentReceived`, accept a payment, be cancelled, or switch type.
- `close_as_sent` is the only exit that ends an operation without a callback. It ends in `Paid` or `Refunded` and clears `active_attempt_id` and the operation record.
- Payer, school, treasury, gross amount, fee rate, fee amount and net amount never change.
- A later change of the school's treasury, admin or fee rate does not affect a recovered or restarted operation.

### 9.4 Rules and limits
- Waits: `retry_with_collateral` and `close_as_sent` of a frozen item need 10 minutes after `operation_started_at`. Each restart needs 10 minutes after `recovered_at`.
- `retry_with_collateral` requires: `allow_retry` true, owner caller, frozen `Settling` or `Refunding`, `recovery_count < 2`, `FA >= collateral`, and `lifetime_collateral + collateral <= max_lifetime_collateral`. It then applies section 4.3, sets `recovered_at`, increments `recovery_count` and `attempt_counter`, and adds the collateral to `lifetime_collateral`.
- Collateral is never returned and `lifetime_collateral` never decreases. The 1,000 USDC lifetime limit is global.
- At most 2 collateral-backed recoveries per invoice. A third stuck attempt can only be closed as sent or remain frozen.
- A restarted operation that gets stuck again is frozen again with the same pinned record and the same two choices, within the same limits.
- With `allow_retry = false` (intended for mainnet), `retry_with_collateral` is rejected and frozen items can only be closed or stay frozen.

### 9.5 Residual risks
- A wrong `close_as_sent` leaves one school or payer unpaid and locks the stranded amount. Other schools are not touched. Control: runbook (explorer receipt check, recipient balance before and after, evidence note in the event).
- A collateral-backed restart after a transfer that really left costs the platform up to one payout per recovery, at most 2 per invoice and 1,000 USDC in total over the contract's life.
- Both are deliberate trade-offs: liveness for one invoice against the safety of every other school's funds.

## 10. Storage
`1250000000000000000000` yoctoNEAR equals 0.00125 NEAR (1 NEAR = 10^24 yoctoNEAR). That is the token's registration minimum, read live, paid once per account to the token. NEAR charges 10^19 yoctoNEAR per stored byte. School and invoice records are charged at their measured size (from `env::storage_usage()` in tests, roughly a few thousandths of a NEAR each as an estimate) against the school's prepaid storage balance. The registry keeps enough NEAR for its own storage and refuses new operations when its free balance is below the reserve.

## 11. Owner verification
Before deployment, `mouseng20.testnet` proves control by signing in through the app's signed-message check, which also confirms the signing key is a full-access key. The contract is initialized with that account as owner only after this succeeds. The owner cannot be a school administrator, so the v3 demo school uses a different account. Testnet accepts a single key. Mainnet requires a multisig owner, decided separately.

## 12. Automatic settlement service (after integration tests pass)
Not built now. A dedicated settler account holds only NEAR for gas. It uses a function-call key restricted to `settle_invoice` on v3 with a small allowance, kept only in the server environment. It looks only at invoices in `PaymentReceived`, retries with back-off, makes at most one attempt per invoice per few minutes, and never touches recovered or frozen items. It cannot change who is paid or how much. The payer's Finish payment button remains as fallback.

## 13. Tests required before deployment

Notation for accounting tests: whole USDC units, fee 1%, common setup from section 4.4 (I1 `A=100`, I2 `A=200`, `FA=300`, `B=600`). At every step of every accounting test assert S1, S3, S5, S6 and S7, and S2 when idle.

### 13.1 Lifecycle and snapshots
| ID | Test | Expected |
|---|---|---|
| A1 | A refunded invoice cannot accept another payment (required 1). Refund I1 to `Refunded`, then send an exact payment to I1 | `ft_on_transfer` returns the full amount, the token refunds the payer, status stays `Refunded`, ledger and snapshot unchanged |
| A2 | A new invoice can be created for a later payment (required 2). After A1 the school creates I1b with a new id, then reuses I1's id | I1b created and accepts the payment. Creating again with I1's id is rejected, and also with the id of any `Paid`, `Cancelled` or `Refunded` invoice |
| A3 | Snapshots cannot be overwritten (required 3). After acceptance run every method in every status, plus treasury change, admin transfer, fee-rate change and full recovery cycles | `payer`, `treasury`, gross, `fee_bps`, `fee_amount`, `net_amount` and `paid_at` never change. No method writes them again |
| A4 | `Paid` and `Cancelled` and `Refunded` reject payments | All three return the full amount |
| A5 | Ordinary failure | Settlement or refund fails, callback confirms: record cleared, `active_attempt_id` cleared, status `PaymentReceived`, ledger restored, the next start gets a fresh attempt id, either operation can be chosen |
| A6 | Operation record timing | After acceptance no `op_type`. After a refund start `op_type=Refund`, recipient = payer snapshot, amount = gross. After a confirmed failure the record is cleared. After a settlement start `op_type=Settle`, recipient = treasury snapshot, amount = net |
| A7 | Statuses and transitions | Every transition not listed in section 2 is rejected from every status for every role |

### 13.2 Recovered operations
| ID | Test | Expected |
|---|---|---|
| B1 | A recovered refund cannot settle to the school (required 4). Reach `RefundRecovered` (E4 step 2). As anyone, owner, school admin and payer call `settle_invoice`, `restart_settlement`, `cancel_invoice`, and send a payment | All rejected. School treasury balance unchanged. `H`, `FA`, `RI` unchanged |
| B2 | A recovered settlement cannot refund the payer (required 5). Reach `SettlementRecovered` (E1 stage 3). Call `refund_payment`, `restart_refund`, `cancel_invoice`, send a payment, as every role | All rejected. Payer balance unchanged |
| B3 | A restarted refund pays only the original payer (required 6). From `RefundRecovered` call `restart_refund` at 9 minutes and at 10 minutes, after the school changed treasury, transferred admin and the owner changed the fee rate, and with extra recipient arguments | 9 minutes rejected. At 10 minutes: `Refunding`, `ft_transfer` goes to the payer snapshot for the gross amount only. Extra arguments rejected. Success ends `Refunded`. No payout to any other account |
| B4 | A restarted settlement pays only the original treasury (required 7). Same conditions on `SettlementRecovered` | `Settling`, `ft_transfer` goes to the treasury snapshot for `net_amount` only, with the original fee. Success ends `Paid` |
| B5 | Absolute exits | From `SettlementRecovered` only `restart_settlement` and `close_as_sent` succeed. From `RefundRecovered` only `restart_refund` and `close_as_sent`. No sequence by any role returns either to `PaymentReceived` or switches operation type |
| B6 | Failed restart (E5) | Returns to the same recovered status, record kept, `recovery_count` and `lifetime` unchanged |
| B7 | Restart stuck again | Frozen with the same record. `close_as_sent` and `retry_with_collateral` are available again within the limits |
| B8 | `close_as_sent` from each state | Frozen settlement to `Paid`, frozen refund to `Refunded`, `SettlementRecovered` to `Paid`, `RefundRecovered` to `Refunded`, ledger exactly per section 4.3. In every case `attempt_counter` increases by exactly 1, `active_attempt_id` and the operation record are cleared, the payment snapshot is unchanged, and every earlier callback is ignored afterwards |

### 13.3 Callbacks and the attempt counter
| ID | Test | Expected |
|---|---|---|
| C1 | Old callbacks cannot interfere after close, recovery or restart (required 8). Deliver every earlier callback after `close_as_sent`, after `retry_with_collateral`, after each restart | All ignored. Ledger, status, record and counters unchanged. An event is logged |
| C2 | The attempt counter never decreases or repeats (required 9). Random sequences of starts, failures, closes, recoveries and restarts, 500 steps | After each event the counter is strictly greater than before for exactly the events listed in section 3, and never changes otherwise. No value is ever repeated |
| C3 | A callback needs all four matches | Vary one at a time: wrong invoice id, wrong attempt id, wrong operation type, wrong status. Each ignored. Only the exact match applies |
| C4 | Duplicate and replayed callbacks | A success callback delivered twice applies once |
| C5 | Callback never delivered (E1 stage 2) | Invoice frozen, cannot be settled, refunded or cancelled, S1 holds |

### 13.4 Limits and surplus
| ID | Test | Expected |
|---|---|---|
| D1 | Two recoveries per invoice is the maximum (required 10). Cycle: settle, drop, retry, restart, drop, retry, restart, drop, third retry | Third retry rejected (`recovery_count = 2`). Only `close_as_sent` or frozen remain (E3) |
| D2 | 1,000 USDC lifetime limit cannot be exceeded (required 11). Commit collateral up to 999 USDC, then try 1 more (accepted, total 1,000), then 1 unit more | Last rejected. `lifetime_collateral <= 1,000` always |
| D3 | Collateral cannot be replenished or reclaimed (required 12). After recoveries, run restart successes, closes, withdrawals, payments and every method as every role | `lifetime_collateral` never decreases. `FA` increases only through a successful-settlement fee credit (including `close_as_sent` of a settlement) or restoration after a confirmed failed fee withdrawal, and never from a collateral return, surplus or any other source. The cap is permanently consumed |
| D4 | No method withdraws unidentified surplus (required 13). Create surplus: a stray 50 USDC transfer without a call, a wrong `close_as_sent`, an unneeded retry. Then call every method with every role and with very large amounts, including `withdraw_fees` | After every call `B >= L_min` holds, and `B >= H + FA` holds whenever nothing is in flight (`SI = RI = FW = 0`). `withdraw_fees(w)` succeeds only for `w <= FA` and rejects any larger amount, including amounts that equal or exceed the surplus. `FA` increases only through (a) the fee credit of a successful settlement, including the fee credit of `close_as_sent` of a settlement (frozen or `SettlementRecovered`), and (b) restoration after a confirmed failed fee withdrawal. It never increases from unidentified surplus (the stray transfer, the wrong close and the unneeded retry above) or from any other source. The contract ABI has no reclaim, sweep or surplus method (checked against the method list), so the unidentified surplus cannot be withdrawn by anyone |
| D5 | Collateral needs `FA` | With `FA < collateral` (E6' case) the retry is rejected and the item stays frozen. `H` unchanged |
| D6 | `allow_retry = false` | `retry_with_collateral` rejected. `close_as_sent` works |
| D7 | Waits | `retry_with_collateral` and `close_as_sent` at 9 minutes rejected, at 10 accepted. Restart at 9 minutes rejected, at 10 accepted |
| D8 | Only the owner recovers | School admins, payers and anyone else are rejected for `close_as_sent`, `retry_with_collateral`, `finalize_withdrawal_as_sent` |
| D9 | No other school's funds finance a recovery or withdrawal | Make `FA` too small while `H` is large: recovery and withdrawal rejected, `H` unchanged. Run E6 and assert school payouts never exceed their own invoices |

### 13.5 Accounting scenarios (each checks every row of the transition table)
| ID | Scenario |
|---|---|
| ACC1 | E1 settlement recovery, original payout left |
| ACC2 | E2 settlement recovery, original payout did not leave |
| ACC3 | E3 repeated settlement recovery |
| ACC4 | E4 refund recovery |
| ACC5 | Repeated refund recovery: refund, drop, retry, restart, drop, retry, restart, success. `recovery_count = 2`, `lifetime = 200`, payer paid 3 times at most |
| ACC6 | E5 failed restart callbacks, settlement and refund |
| ACC7 | A restarted operation becoming stuck again (B7) |
| ACC8 | E6 interleaved operations across two schools, with a fee withdrawal while payments are in flight, callbacks in every order |
| ACC9 | E7 lifetime collateral cap |
| ACC10 | Random run (required 14): 3 schools, many invoices, 300 steps of payments, settlements, refunds, failures, dropped callbacks, recoveries, restarts, closes, withdrawals, pauses. After every step S1, S3, S5, S6 hold, each school's recorded funds are still covered by `B >= L_min`, `recovery_count <= 2`, `lifetime <= 1,000`. When idle S2 holds |

### 13.6 Permissions, registration, payments and application
- Registration and treasury: every case in section 7, school never `Active` without verification, one school per admin, owner cannot be a school admin.
- Approval, suspension, two-step admin transfer, 24-hour treasury change with re-verification and unchanged existing snapshots.
- Cross-school: every method called by the admin of another school is rejected.
- Pause: blocks payments, new invoices, settlement, restart of settlement and withdrawals. Refunds, refund restarts, cancellations and recovery still work.
- Payments: exact amount accepted, under and over payment refunded in full, wrong token rejected, unknown invoice refunded, suspended school refunded, caps (1,000 per invoice, 5,000 at risk).
- Fees: rounding at 1 unit, at 5% and at zero. A rate change affects only new invoices.
- Prevention: too little gas and too little free NEAR are rejected with no state change. Measured callback gas times 3 is at most the reserve.
- Storage: invoice creation charges the measured amount, fails when the balance is too low, unused balance can be withdrawn.
- Two payments for one invoice at the same moment, on testnet, before sign-off.
- Application: school A cannot read, export, cancel or refund school B's invoices. The public invoice endpoint exposes only that invoice. A v2 link created earlier still loads and pays through v2, a v3 link through v3. A `Refunded` invoice shows its refunded state and prompts for a new invoice. CSV figures match the chain for mixed v2 and v3 invoices.

## 14. Security

What a shared registry means: funds of different schools share one USDC balance between "payment received" and "settled" or "refunded". A serious bug in payment, settlement, refund, recovery or fee code could affect every school's in-flight money and the accrued fees. Money already settled sits in school treasuries and is not affected. Because v3 is not upgradeable, a bug cannot be patched in place; the response is to pause, refund and redeploy.
Controls: pause switch (refunds stay possible), invoice and at-risk caps, per-invoice and lifetime recovery limits, freeze by default, no surplus claim method, solvency view and monitoring, owner multisig on mainnet, owner separate from school admins, independent audit before mainnet, testnet first.

| Risk | Handling |
|---|---|
| Double payout of one invoice | Status changes before sending, attempt ids, pinned operation record, exclusive exits, collateral from `FA` only |
| Late or repeated callback | All four callback matches, monotonic attempt counter |
| Refund turned into a settlement or the reverse | Separate recovered statuses, pinned `op_type`, recipient and amount, no arguments |
| Invoice reused after refund | `Refunded` is terminal, only `Pending` accepts payments, ids never reused |
| Fake school impersonation | Owner approval |
| Admin key stolen | 24-hour treasury delay, owner can suspend, snapshots protect in-flight payments |
| Owner key stolen | Owner can approve schools, set fees under the cap, pause, withdraw fees up to `FA`, recover under limits. It cannot move school funds. Multisig on mainnet |
| Surplus mistaken for platform money | No reclaim method exists. Surplus is locked |
| Treasury unregistered later | Settlement fails safely, refundable |
| Storage spam | Prepaid per-school storage balance |
| Cross-school data access in the app | School comes from the signed session, never from request parameters |
| Same invoice paid by two parents at once | `Pending`-only acceptance and exact amount. Needs the real test |

## 15. Migration and application changes

Migration (v2 and v3 together):
- A payment link is only an invoice id and does not change. The database gets `contract_id` per invoice (existing rows `v2.studentfee.testnet`) and `school_id` (null for v2). A `schools` table holds v3 schools. v2 invoices belong to a built-in legacy school for `mouseng20.testnet`.
- `/pay/<id>` resolves the invoice to its contract and version. The pay page uses that contract for `ft_transfer_call` and for settlement.
- One adapter per version, each providing read, create, cancel, settle and refund with that version's argument shapes and statuses. v2 keeps its six statuses and its own refund behavior. v3 uses nine. Pages talk to the adapter.
- New invoices go to v3 only. The legacy school can still cancel, settle and refund existing v2 invoices. v2 charges no platform fee. v2 is read and called, never modified.

Backend and database: `schools` table, `school_id` and `contract_id` on invoices, per-school scoping on every query, account-to-school resolution at sign-in, owner endpoints, fee, net and snapshot fields cached from chain.

Dashboard and application requirements:
- School registration with treasury check, awaiting-approval state, treasury and admin change screens with the 24-hour countdown, storage top-up.
- Invoice form and API reject amounts above 1,000 USDC.
- All nine v3 statuses kept internally. Parents see `SettlementRecovered`, `RefundRecovered`, `Settling` and `Refunding` as Processing. School admins and the owner see recovered statuses as "Needs restart" with the matching button (restart settlement or restart refund, never the other). `Refunded` shows as Refunded, and its page tells the parent to ask the school for a new invoice. The school dashboard offers Create new invoice for a refunded student.
- Owner console: all buckets, `L_min`, `L_max`, money at risk against 5,000 USDC, `lifetime_collateral` against 1,000 USDC with a clear note that it never recovers, per-invoice recovery counts, frozen items with `close_as_sent` and `retry_with_collateral`, fee withdrawal (disabled until the platform treasury is set), pause.
- CSV columns: Invoice ID, Student ID, Student name, Term, Fee items, Gross, Platform fee, Net, Due date, Status, Paid at (UTC), Paid by, Payment reference, Settlement or refund reference, Contract version.

USDC integration: same token. The v3 registry account is registered with USDC once. Every treasury and the platform treasury must be registered. Payments for new invoices go to v3, for old invoices to v2.

## 16. Open items
1. **Dedicated platform fee treasury account name: pending. Not invented here.** It must be created and registered with USDC before `set_platform_treasury`.
2. Your approval of this complete specification. After that, your NEAR developer implements and deploys v3 to a new testnet account, and I review it against this document before touching the application. `v2.studentfee.testnet` stays untouched.

Mainnet: not configured here. Every limit above is a testnet value and must be reviewed before any mainnet use.
