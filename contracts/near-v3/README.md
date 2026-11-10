# StudentFee Registry v3 (NEAR Testnet)

This is a new, isolated NEAR contract package. It does not replace, upgrade, or share state with `v2.studentfee.testnet`.

## Status

Implementation is in progress. This package is **not deployable or approved for deployment yet**. The full v3 specification is in `docs/multi-school-final-spec.md`. Dependencies are pinned by the committed `Cargo.lock`.

## Fixed testnet design limits

- USDC has 6 decimals.
- Default platform fee: 100 bps; maximum: 500 bps.
- Maximum invoice: 1,000 USDC.
- Maximum in-flight/held money at risk: 5,000 USDC.
- Recovery collateral: at most 2 attempts per invoice and 1,000 USDC lifetime.
- Treasury change delay: 24 hours.
- Frozen-operation and restart delay: 10 minutes.
- Platform fee treasury starts unset; fee withdrawals remain disabled until verified.
- Owner, school administrators, school treasuries and platform treasury are separate roles; treasury accounts cannot register as school administrators or become owner.
- A single pending treasury change is allowed per school; asynchronous callbacks are checked against the queued treasury state.
- A 0.1 NEAR free-balance floor and 70 Tgas call minimum are enforced before contract-initiated asynchronous calls. Both are provisional until testnet gas measurements are completed.
- School reactivation and platform-treasury verification use single-flight pending states, stale-callback guards and owner cancellation after a timeout.
- The reserve calculation subtracts both storage-locked NEAR and outstanding prepaid school-storage liabilities.

## Build and tests

Use NEAR SDK 5.5.0 and a current stable Rust toolchain. The contract's minimum supported Rust version is 1.86; the optimized CI build uses the pinned `cargo-near` 0.22.0 release.

```sh
cd contracts/near-v3
cargo test --locked
cargo near build non-reproducible-wasm --locked
```

The `cargo near` command produces an optimized WASM and ABI, but this non-reproducible build is still a review artifact, not authorization to deploy. A deployment candidate must have its artifact hash recorded and independently reviewed, then be deployed to a new dedicated testnet account only after owner identity, account IDs, USDC registration, gas/storage measurements, and the complete acceptance suite are verified.

## Non-negotiable boundaries

- Never deploy this package to `v2.studentfee.testnet`.
- Never add private keys, seed phrases, or `.env` files.
- Do not configure a platform treasury using an invented account.
- Do not enable the app's v3 invoice adapter until contract tests, deployment verification, and cross-school authorization tests pass.
