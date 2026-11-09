I have completed my review of the v3 specification. Rather than continue making individual corrections, I want us to settle the architecture now.

Please treat the following as my definitive design decisions and update the entire v3 specification accordingly.

Do not implement, modify code, or deploy anything yet. Return the complete corrected specification for my final review.

1. Invoice reuse and payment snapshots

A successfully refunded invoice must never accept another payment.

Please introduce a terminal "Refunded" status.

The lifecycle should be:

- "Pending" → "PaymentReceived" → "Settling" → "Paid".
- "Pending" → "PaymentReceived" → "Refunding" → "Refunded".
- An ordinary failed settlement or refund, confirmed by its callback, returns to "PaymentReceived".
- A recovered settlement follows only the settlement recovery path.
- A recovered refund follows only the refund recovery path.

"ft_on_transfer" must accept payments only for invoices in "Pending".

A "Refunded", "Paid" or "Cancelled" invoice cannot be reused. If another payment is required, the school creates a new invoice with a new ID.

The original payment snapshot is immutable for the entire lifetime of that invoice.

This removes the ambiguity around replacing the payer, payment amount and other snapshot fields after a successful refund.

2. Remove reclaim_surplus

Remove "reclaim_surplus", its maintenance-mode requirements, its balance-reading procedure and all tests that depend on it.

Reason: the contract holds USDC in a pooled balance. It cannot reliably identify the source of individual surplus amounts. Even if the total balance is above the recorded liabilities, that does not prove that the surplus belongs to the platform rather than a school whose invoice was incorrectly closed.

I prefer permanently locking unidentifiable surplus rather than risking school funds.

Consequently:

- Collateral committed through "retry_with_collateral" is not replenished.
- "unreconciled_collateral" becomes a monotonically increasing lifetime counter.
- The global maximum remains 1,000 USDC for testnet.
- Every collateral-backed recovery must satisfy both the available "FA" requirement and the lifetime collateral cap.
- The per-invoice limit remains two collateral-backed recoveries.
- No method may withdraw or reclaim stranded surplus.

Please update the accounting invariants and tests to reflect this conservative approach.

3. Separate the attempt counter from the operation record

Please redesign these fields clearly.

Use an invoice-level "attempt_counter" that:

- Only increases.
- Is never reset or reused.
- Increments for every new transfer attempt.
- Also increments when a frozen operation is closed or recovered, invalidating any earlier callback.

Keep a separate operation record containing:

- "op_type"
- "op_recipient"
- "op_amount"
- The current active attempt ID, where applicable.

The operation type, recipient and amount remain pinned throughout a frozen or recovered operation.

A restart must use the same operation type, recipient and amount but receive a new attempt ID.

A callback may change state only when its invoice ID, attempt ID, operation type and expected status all match.

When an ordinary failure callback confirms that a transfer did not execute, clear the operation record and return the invoice to "PaymentReceived". The next settlement or refund decision receives a fresh attempt ID.

Please ensure that "close_as_sent" and "retry_with_collateral" invalidate old callbacks without changing the original operation type or recipient.

4. Recovery rules

Keep the separate recovery states:

- "SettlementRecovered"
- "RefundRecovered"

The restrictions must remain absolute:

- "SettlementRecovered" can exit only through "restart_settlement" or "close_as_sent".
- "RefundRecovered" can exit only through "restart_refund" or "close_as_sent".
- A recovered refund must never pay a school treasury.
- A recovered settlement must never refund the original payer.
- Neither recovered state can return to "PaymentReceived".
- Neither recovered state can accept another payment.
- The original payer, school, treasury, gross amount, fee rate, fee amount and net amount remain unchanged.

Keep these testnet settings:

- Maximum two collateral-backed recoveries per invoice.
- Maximum 1,000 USDC lifetime collateral commitment globally.
- Ten-minute wait before each recovery.
- Ten-minute wait before each restart.
- "allow_retry = true" on testnet.
- "allow_retry = false" for intended mainnet use.

A third stuck attempt after two collateral-backed recoveries can only be closed as sent or remain frozen.

5. Accounting and safety

Please recalculate every ledger transition after these changes.

In particular, verify:

- Settlement recovery.
- Refund recovery.
- Repeated settlement recovery.
- Repeated refund recovery.
- Failed restart callbacks.
- A restarted operation becoming stuck again.
- Interleaved operations across multiple schools.
- Platform fee withdrawals while school payments are in flight.
- The lifetime collateral cap.
- The absence of any surplus-reclamation method.

The contract must never use another school's recorded funds to finance a recovery or platform fee withdrawal.

6. Required additional tests

Please add tests proving:

1. A successfully refunded invoice cannot accept another payment.
2. A new invoice can be created for a subsequent payment.
3. Original payment snapshots cannot be overwritten.
4. A recovered refund cannot settle to the school.
5. A recovered settlement cannot refund the payer.
6. A restarted refund pays only the original payer.
7. A restarted settlement pays only the original treasury.
8. Old callbacks cannot interfere after close, recovery or restart.
9. The attempt counter never decreases or repeats.
10. Two recoveries per invoice is the maximum.
11. The 1,000 USDC lifetime collateral limit cannot be exceeded.
12. Collateral cannot be replenished or reclaimed.
13. No method can withdraw unidentified surplus.
14. All accounting invariants hold across multiple schools and repeated recovery cycles.

Please also update every affected status table, method table, data model, accounting example and application integration requirement.

7. Decisions that remain unchanged

- Platform owner: "mouseng20.testnet", after signed-message ownership verification.
- Owner cannot be a school administrator.
- The v3 demo school must use a different administrator.
- Default platform fee: 1%.
- Maximum platform fee: 5%.
- Maximum invoice: 1,000 USDC.
- Maximum money at risk: 5,000 USDC.
- Dedicated platform fee treasury must be a separate account.
- Automatic settlement is built only after successful testnet integration tests.
- v3 is non-upgradeable.
- Existing "v2.studentfee.testnet" must remain completely untouched.

The dedicated platform fee treasury account name is still pending. Do not invent one.

Final instruction

Return one complete, internally consistent v3 specification incorporating all these decisions.

Do not implement or deploy anything. I will review the complete document before giving approval.