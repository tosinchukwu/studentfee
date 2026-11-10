# StudentFee Registry v3 (NEAR Testnet)

This is a new, isolated NEAR contract package. It does not replace, upgrade, or share state with `v2.studentfee.testnet`.

## Status

Implementation is in progress. This package is **not deployable or approved for deployment yet**. The full v3 specification is in `docs/multi-school-final-spec.md`.

## Fixed testnet design limits

- USDC has 6 decimals.
- Default platform fee: 100 bps; maximum: 500 bps.
- Maximum invoice: 1,000 USDC.
- Maximum in-flight/held money at risk: 5,000 USDC.
- Recovery collateral: at most 2 attempts per invoice and 1,000 USDC lifetime.
- Treasury change delay: 24 hours.
- Frozen-operation and restart delay: 10 minutes.
- Platform fee treasury starts unset; fee withdrawals remain disabled until verified.

## Build and tests

Use Rust 1.86.0 and NEAR SDK 5.5.0 (the same pinned SDK generation as the existing registry ABI).

```sh
cd contracts/near-v3
cargo test
cargo build --release --target wasm32-unknown-unknown
```

The WASM build command is a compile check only. Deployment must use a separately reviewed artifact and a new dedicated testnet account after owner identity, account IDs, USDC registration, and the complete acceptance suite are verified.

## Non-negotiable boundaries

- Never deploy this package to `v2.studentfee.testnet`.
- Never add private keys, seed phrases, or `.env` files.
- Do not configure a platform treasury using an invented account.
- Do not enable the app's v3 invoice adapter until contract tests, deployment verification, and cross-school authorization tests pass.
