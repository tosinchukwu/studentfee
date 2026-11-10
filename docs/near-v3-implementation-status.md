# NEAR Multi-school v3 implementation status

Last updated: 2026-11-10

## Scope and isolation

The v3 Rust package lives at `contracts/near-v3`. It is a separate contract from the deployed `v2.studentfee.testnet`. It has no migration path and does not read or write v2 state. The application continues to create and route invoices through v2.

## Implemented in the current working branch

- New NEAR SDK 5.5.0 contract package with independent storage namespaces.
- Platform owner and USDC token are constructor parameters; the platform fee treasury starts unset.
- One school per administrator, separate/unique school treasury indexing, treasury registration checks, owner approval, suspension and reactivation.
- Two-step school administrator transfer and 24-hour delayed treasury change with a second registration check at apply time.
- Prepaid school storage deposits and per-invoice measured storage charges.
- Globally unique 32-character lowercase-hex invoice IDs; IDs remain reserved after cancellation, payment or refund.
- Exact-amount USDC payment acceptance for active schools only, with payer/treasury/fee snapshots.
- 1,000 USDC invoice cap, 5,000 USDC at-risk cap, 1% default fee and 5% maximum fee.
- Separate settlement and refund transfers, asynchronous callbacks and monotonic attempt IDs.
- Nine-state v3 lifecycle, recovered settlement/refund paths, owner-only collateral recovery and close-as-sent.
- Platform fee accounting, verified platform treasury, fee withdrawals and stuck-withdrawal finalization.
- Pause controls, accounting bucket views, school/invoice views and per-school invoice indexing.
- Rust unit tests for snapshots, successful/failed settlement, refund terminality, recovery, stale callbacks, school isolation, payment caps and fee-withdrawal recovery.

## Not complete; deployment is blocked

The current code is an implementation draft, not a deployment-ready release. Before a testnet deployment:

1. Complete the full acceptance suite in `docs/multi-school-final-spec.md`, including randomized accounting invariants, repeated recovery, registration races, two simultaneous payments, every permissions matrix, and all callback replay cases.
2. Add and verify the NEAR free-balance reserve check and measure worst-case transfer/callback gas. The current gas constants are provisional, not measured.
3. Finish storage accounting and failure-path review, including registration refund and storage-withdrawal callbacks.
4. Generate and review the final ABI and optimized WASM; record the artifact hash.
5. Verify the platform owner's full-access identity through the app's signed-message flow. Do not infer ownership from an account name.
6. Create and confirm a dedicated platform-fee treasury account, register it with USDC, and verify its account ID. It is intentionally not guessed or configured in code.
7. Confirm a demo school administrator account distinct from the platform owner and create/USDC-register the school's treasury.
8. Review account-key controls so the deployed contract account cannot be upgraded after launch while authorized owner methods remain usable.
9. Run contract-level testnet payment/refund/recovery tests and app-level tenant-isolation tests before enabling the Multi-school option.

No v3 contract has been deployed. No mainnet deployment is authorized. Do not change, redeploy, migrate, or route existing invoices away from `v2.studentfee.testnet`.
