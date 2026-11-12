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
Build with the project's pinned NEAR toolchain and deploy to a dedicated demo contract account. Initialize with a dedicated demo treasury and the NEAR Testnet USDC account. The deployer must authorize deployment and initialization in a NEAR wallet.

Do not deploy this contract over `v2.studentfee.testnet`. Before public use, register the demo contract as a USDC storage recipient and verify create → pay → settle → Paid on Testnet.
