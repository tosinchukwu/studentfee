# NEAR Multi-school v3 implementation status

Last updated: 2026-11-10

## Scope and isolation

The v3 Rust package lives at `contracts/near-v3`. It is a separate contract from the deployed `v2.studentfee.testnet`. It has no migration path and does not read or write v2 state. The application continues to create and route invoices through v2.

## Implemented in the current working branch

- New NEAR SDK 5.5.0 contract package with independent storage namespaces.
- Platform owner and USDC token are constructor parameters; the platform fee treasury starts unset.
- One school per administrator, separate/unique school treasury indexing, treasury registration checks, owner approval, suspension and reactivation.
- Two-step school administrator transfer and 24-hour delayed treasury change with a second registration check at apply time; one pending change per school and stale callback guards.
- Single-flight school reactivation and platform-treasury verification, with stale-callback rejection and owner cancellation after a timeout.
- Explicit role separation: platform owner, school admins, school treasuries and platform-fee treasury cannot overlap; role changes re-check the indexes.
- Prepaid school storage deposits, measured registration/invoice storage charges, aggregate prepaid-liability tracking, replay-safe storage withdrawals and a free-NEAR reserve check that subtracts locked storage and prepaid liabilities.
- Globally unique 32-character lowercase-hex invoice IDs; IDs remain reserved after cancellation, payment or refund.
- Exact-amount USDC payment acceptance for active schools only, with payer/treasury/fee snapshots.
- 1,000 USDC invoice cap, 5,000 USDC at-risk cap, 1% default fee and 5% maximum fee.
- Separate settlement and refund transfers, asynchronous callbacks and monotonic attempt IDs.
- Nine-state v3 lifecycle, recovered settlement/refund paths, owner-only collateral recovery and close-as-sent.
- Platform fee accounting, verified platform treasury, fee withdrawals and stuck-withdrawal finalization.
- Pause controls, accounting bucket views, school/invoice views and per-school invoice indexing.
- 49 passing Rust unit tests on the current branch. The latest GitHub Actions run executed the suite twice (normal and `--locked`): 49 passed, 0 failed. Coverage includes payment snapshots, settlement/refund success and failure, terminal statuses, two-recovery limits, stale/duplicate callbacks, school isolation, payment and collateral caps, fee-withdrawal recovery, measured storage registration/refunds, storage-withdrawal replay, role separation (including pending-registration owner conflicts), reserve/gas guards, treasury/reactivation callback races, and two-school ledger interleaving.
- Committed `Cargo.lock`; CI reruns tests and WebAssembly compilation with `--locked`.

## Latest CI artifact and remaining deployment blockers

Latest verified run on commit `d926978cbabc190f8a56ed66d6e834241fc50c52` (2026-11-10): NEAR v3 Rust tests passed (49/49, including locked rerun), optimized WebAssembly build and ABI generation passed, and frontend TypeScript typecheck plus production build passed. Optimized WASM: `contracts/near-v3/target/near/studentfee_registry_v3.wasm`, 289,112 bytes (289.1 KB), SHA-256 `d21a11297d237cab986d6600785453d7c3fd18a0ec798825bb3d70e1b392a9a3`. CI artifact `near-v3-optimized-wasm-and-abi` was uploaded (artifact ID `13799583034`).

## Not complete; deployment is blocked

The current code is an implementation draft, not a deployment-ready release. Before a testnet deployment:

1. Complete the remaining acceptance suite in `docs/multi-school-final-spec.md`, especially the 300-step, three-school randomized accounting scenario (ACC10), the separate 500-step attempt-counter sequence (C2), any uncovered recovery/refund matrix cases, and two simultaneous payments on testnet.
2. Measure worst-case transfer/callback gas on testnet and tune the provisional 70 Tgas call minimum, 15 Tgas FT calls, 25 Tgas callbacks and 0.1 NEAR free-balance floor. These are guardrails, not measured deployment parameters.
3. Complete the storage accounting review and expand failure/replay coverage across every callback path; current unit coverage is broad but not a substitute for the full acceptance matrix.
4. Generate and review the final ABI and optimized WASM; record the artifact hash.
5. Verify the platform owner's full-access identity through the app's signed-message flow. Do not infer ownership from an account name.
6. Create and confirm a dedicated platform-fee treasury account, register it with USDC, and verify its account ID. It is intentionally not guessed or configured in code.
7. Confirm a demo school administrator account distinct from the platform owner and create/USDC-register the school's treasury.
8. Review account-key controls so the deployed contract account cannot be upgraded after launch while authorized owner methods remain usable.
9. Run contract-level testnet payment/refund/recovery tests and app-level tenant-isolation tests before enabling the Multi-school option.

No v3 contract has been deployed. No mainnet deployment is authorized. Do not change, redeploy, migrate, or route existing invoices away from `v2.studentfee.testnet`.
