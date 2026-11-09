// Ordered, append-only database migrations. Never edit an applied migration: add a new one.

export interface Migration {
  id: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_initial_schema',
    sql: `
      CREATE TABLE invoices (
        id TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
        contract_id TEXT NOT NULL,
        contract_version TEXT NOT NULL DEFAULT 'v2',
        student_name TEXT NOT NULL,
        student_id TEXT NOT NULL DEFAULT '',
        term TEXT NOT NULL,
        amount_base TEXT NOT NULL CHECK (amount_base ~ '^[0-9]+$'),
        due_date_ms BIGINT NOT NULL,
        line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
        note TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        payment_tx TEXT,
        settlement_tx TEXT
      );
      CREATE INDEX invoices_created_idx ON invoices (created_at DESC);
      CREATE INDEX invoices_contract_idx ON invoices (contract_id, contract_version);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE challenges (
        nonce TEXT PRIMARY KEY,
        expires_at BIGINT NOT NULL
      );
      CREATE INDEX challenges_expiry_idx ON challenges (expires_at);

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        expires_at BIGINT NOT NULL
      );
      CREATE INDEX sessions_expiry_idx ON sessions (expires_at);
    `,
  },
]
