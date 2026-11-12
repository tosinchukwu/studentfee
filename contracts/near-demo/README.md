# Public StudentFee Demo Contract

A separate NEAR Testnet contract for public demo invoice creation. It does not replace or modify `v2.studentfee.testnet`.

## Safety boundaries
- Testnet only; never use real funds.
- Anyone may create an invoice, but must attach at least 0.01 NEAR for storage.
- Each creator may have at most 50 unpaid invoices.
- Invoice amounts are limited to 0.01–100 USDC (6 decimals).
- Payments are accepted only in the configured testnet USDC.
- Settlement transfers the invoice amount to the configured demo treasury.
- This contract is not independently audited and is for hackathon demonstration only.

## Build and deploy
Build with the project's pinned NEAR toolchain and deploy to a dedicated demo contract account. Initialize with the already-approved StudentFee Testnet treasury and the configured NEAR Testnet USDC token:

- Treasury: `bd73e625f18d762274625333c5200aae67d0ec65d09797b27118a06c24dc6669`
- USDC token: `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`

After initialization, call `register_usdc_storage` with the USDC token's required storage deposit (currently verify the token's live `storage_balance_bounds` before attaching funds). This registers the Demo contract as a USDC receiver. The deployer must authorize deployment and initialization in a NEAR wallet. The existing school treasury is reused only as the destination for this Testnet demo contract's settled USDC; the existing v2 contract and its records are unchanged.

Do not deploy this contract over `v2.studentfee.testnet`. Before public use, register the demo contract as a USDC storage recipient and verify create → pay → settle → Paid on Testnet.
