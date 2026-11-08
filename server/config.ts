// arc-studio-allow-onchain-literal
// Server settings. Every value can be overridden with an environment variable.
// Defaults point at the deployed NEAR Testnet contract from the project's integration notes.

export const config = {
  port: Number(process.env.API_PORT ?? 8787),
  network: 'testnet',
  rpcUrl: process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.near.org',
  contractId: process.env.CONTRACT_ID ?? 'v2.studentfee.testnet',
  usdcId: process.env.USDC_TOKEN_ID ?? '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
  adminAccount: process.env.ADMIN_ACCOUNT ?? 'mouseng20.testnet',
  treasury: process.env.TREASURY_ACCOUNT ?? 'bd73e625f18d762274625333c5200aae67d0ec65d09797b27118a06c24dc6669',
  explorerUrl: 'https://testnet.nearblocks.io',
  dbPath: process.env.DB_PATH ?? 'data/school-fees.sqlite',
  defaultSchoolName: process.env.SCHOOL_NAME ?? 'School Fee Office',
  sessionHours: 12,
}

export type Config = typeof config
