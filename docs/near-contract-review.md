# Review of your uploaded `lib.txt` (Rust, NEAR)

Reviewed by reading only. It has not been compiled or run. Fix every "Must fix" item before deploying.

## Must fix

1. **Double refund in `on_transfer_complete`.**
   The method calls the internal refund helper and also returns the amount. The USDC token already refunds whatever `ft_on_transfer` returns, so a failed or rejected payment is refunded twice. The second refund is taken from whatever USDC the contract holds, which could be someone else's funds. Remove every call to the refund helper, delete the helper, and just return the amount in those branches.

2. **Two parents can pay the same invoice at the same time, and the second one loses money.**
   `ft_on_transfer` checks that the invoice is Pending, but the invoice only becomes Paid later, in the callback. If two payments arrive before the first callback, both pass the check and both are forwarded to the treasury. The second callback then finds the invoice already Paid and tries to refund, but the USDC is already with the treasury, so the second parent is not refunded.
   Fix: add a fourth status, `Processing`. In `ft_on_transfer`, set the invoice to `Processing` and save it before starting the transfer to the treasury. In the callback, set it to `Paid` on success. On failure, set it back to `Pending` and return the amount. Cancelling already requires Pending, so a payment in progress can't be cancelled. The "not Pending" branch in the callback then only exists as a safety net and should also just return the amount.

3. **The fee contract itself must be registered with the USDC token.**
   When a parent calls `ft_transfer_call`, the USDC briefly lands on your fee contract. The token rejects that transfer if the contract has no storage registration with USDC. Right now `register_treasury` registers only the treasury, so every payment would fail. Add a way to register the contract itself too, either inside the same admin-only setup method (two storage deposits) or as a one-time `storage_deposit` call from the admin with the contract as the account. The app's "Activate payments" step will check both registrations.

4. **Deploy and initialize in the same step.**
   `new` can be called by anyone until it has run once. If you deploy and then initialize in a second transaction, someone could initialize it first with their own admin. Deploy with `new` as the init function in the same transaction.

5. **Check that the callback reads a successful, empty `ft_transfer` result correctly.**
   `ft_transfer` returns nothing. Confirm with a test (sandbox or testnet) that the callback's `Result<(), PromiseError>` reads that as success. If it reads it as an error, every payment would be refunded. The safest approach is to read the promise result status directly and treat "successful" as success whatever the payload.

## Should fix

6. **`register_treasury` has no checks and reports success too early.**
   It logs `treasury_registered` before the token confirms anything, and the call result is never awaited. It also accepts a zero deposit, which the token rejects. Require a deposit above zero. Emit the event from a callback only when the registration succeeded. Any extra NEAR the token refunds goes back to the contract, not to the admin, so either tell the admin to attach only the minimum (about 0.00125 NEAR) or refund the excess to the admin in a callback.

7. **Validate `invoice_id`.**
   The ID is written straight into JSON log strings. A quote or backslash would produce broken events and break the backend's parsing. Require exactly 32 lowercase hex characters in `create_invoice`, the same format the app generates.

8. **Struct and enum derives may not compile.**
   The `schemars::JsonSchema` and `BorshSchema` derives only work if `schemars` is a dependency and `near-sdk` has its `abi` feature on. Use near-sdk's own serializer attribute on the enum and structs (borsh and json), as the contract macro expects, instead of manual derives plus schema attributes.

9. **`LookupMap` from `near_sdk::collections` is deprecated** in recent near-sdk. It works, but the `store` collections are the current choice. Only change this if you want to remove build warnings.

10. **Contract balance.** Each invoice adds storage that the contract's NEAR balance must cover. Keep a few testnet NEAR on the contract account. The contract also needs at least 1 yoctoNEAR free for each `ft_transfer`.

## Alignment with the web app

- **Statuses in the JSON:** `Pending`, `Processing`, `Paid`, `Cancelled`. The app shows `Processing` as "Payment in progress".
- **Amounts:** `amount` comes back as a string in USDC's smallest unit. The app displays 6 decimals, so `25000000` is 25.00 USDC. Confirm the testnet token really uses 6 decimals.
- **Dates:** `due_date` is stored as the app sends it. The app sends Unix milliseconds. `paid_at` is `env::block_timestamp()`, which is in nanoseconds, so the app divides by 1,000,000.
- **Invoice ID:** 32 lowercase hex characters, generated by the backend and used both in the public link and as the `msg` of the payment.
- **Payment call:** the parent's wallet calls `ft_transfer_call` on USDC with receiver = contract, the invoice amount, `msg` = invoice ID, 1 yoctoNEAR, and 100 Tgas. Your 30 + 20 Tgas inner budget needs that headroom.
- **Transaction reference:** the transaction hash of the parent's `ft_transfer_call`. The backend checks it against the chain and against `get_invoice` before it shows Paid.
- **Events:** the app reads `invoice_created`, `invoice_paid` and `invoice_cancelled` from the `EVENT_JSON:` logs.
- **Setup checks in the admin dashboard:** `get_config` matches the expected admin, treasury and token. Both the contract and the treasury must show as registered with USDC.

## Tests to run before you send me the account ID

Treasury and contract registration, exact payment, underpayment, overpayment, unknown invoice, paying a Paid or Cancelled invoice, two simultaneous payments for one invoice (the second must be refunded in full), a forced treasury failure (invoice returns to Pending and the payer is refunded once), non-admin create, cancel and register, and a second call to `new`.
