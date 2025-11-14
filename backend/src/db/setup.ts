import { Connection } from 'typeorm'

async function columnExists(db: Connection, table: string, column: string) {
  const rows = (await db.query(`PRAGMA table_info(${table})`)) as Array<{ name: string }>
  return rows.some((row) => row.name === column)
}

async function addColumnIfMissing(db: Connection, table: string, column: string, definition: string) {
  if (!(await columnExists(db, table, column))) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export async function ensureAuthTables(db: Connection) {
  // base citizen table (one row per wallet)
  await db.query(`
    CREATE TABLE IF NOT EXISTS citizens (
      wallet_address TEXT PRIMARY KEY,
      did TEXT,
      display_name TEXT,
      email TEXT,
      role TEXT,
      full_name TEXT,
      address TEXT,
      date_of_birth TEXT,
      nationality TEXT,
      vaccination_status TEXT,
      college_name TEXT,
      college_status TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER
    )
  `)

  // Migrate older schemas
  await addColumnIfMissing(db, 'citizens', 'display_name', 'TEXT')
  await addColumnIfMissing(db, 'citizens', 'email', 'TEXT')
  await addColumnIfMissing(db, 'citizens', 'role', 'TEXT')
  await addColumnIfMissing(db, 'citizens', 'full_name', 'TEXT')
  await addColumnIfMissing(db, 'citizens', 'address', 'TEXT')
  await addColumnIfMissing(db, 'citizens', 'date_of_birth', 'TEXT')
  await addColumnIfMissing(db, 'citizens', 'nationality', 'TEXT')
  await addColumnIfMissing(db, 'citizens', 'vaccination_status', 'TEXT')
  await addColumnIfMissing(db, 'citizens', 'college_name', 'TEXT')
  await addColumnIfMissing(db, 'citizens', 'college_status', 'TEXT')

  // optional multi-role table (Issuer/Citizen/Verifier assignments)
  await db.query(`
    CREATE TABLE IF NOT EXISTS citizen_roles (
      wallet_address TEXT NOT NULL,
      role TEXT NOT NULL,
      assigned_at INTEGER NOT NULL,
      PRIMARY KEY (wallet_address, role),
      FOREIGN KEY (wallet_address) REFERENCES citizens(wallet_address)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS login_nonces (
      wallet_address TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS credential_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      requested_claims TEXT NOT NULL,
      status TEXT NOT NULL,
      issuer_wallet TEXT,
      verifier_wallet TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      FOREIGN KEY (wallet_address) REFERENCES citizens(wallet_address)
    )
  `)

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_requests_wallet_status
      ON credential_requests(wallet_address, status)
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      type TEXT NOT NULL,
      storage_uri TEXT NOT NULL,
      ipfs_cid TEXT,
      status TEXT NOT NULL,
      metadata TEXT,
      uploaded_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      FOREIGN KEY (wallet_address) REFERENCES citizens(wallet_address)
    )
  `)

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_documents_wallet_status
      ON documents(wallet_address, status)
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS document_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      verifier_wallet TEXT NOT NULL,
      decision TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )
  `)

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_doc_verifications_document
      ON document_verifications(document_id)
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      document_id INTEGER,
      type TEXT,
      vc_jwt TEXT NOT NULL,
      issuer_wallet TEXT,
      verification_status TEXT,
      anchored_tx_hash TEXT,
      anchored_chain_id TEXT,
      anchored_at INTEGER,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (wallet_address) REFERENCES citizens(wallet_address),
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )
  `)

  await addColumnIfMissing(db, 'credentials', 'document_id', 'INTEGER')
  await addColumnIfMissing(db, 'credentials', 'type', 'TEXT')
  await addColumnIfMissing(db, 'credentials', 'issuer_wallet', 'TEXT')
  await addColumnIfMissing(db, 'credentials', 'verification_status', 'TEXT')
  await addColumnIfMissing(db, 'credentials', 'anchored_tx_hash', 'TEXT')
  await addColumnIfMissing(db, 'credentials', 'anchored_chain_id', 'TEXT')
  await addColumnIfMissing(db, 'credentials', 'anchored_at', 'INTEGER')
  await addColumnIfMissing(db, 'credentials', 'revoked_at', 'INTEGER')

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_credentials_wallet
      ON credentials(wallet_address)
  `)

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_credentials_document
      ON credentials(document_id)
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS credential_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credential_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (credential_id) REFERENCES credentials(id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_wallet TEXT NOT NULL,
      verifier_wallet TEXT NOT NULL,
      claim TEXT NOT NULL,
      condition TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      response_payload TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      responded_at INTEGER,
      FOREIGN KEY (citizen_wallet) REFERENCES citizens(wallet_address)
    )
  `)

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_access_requests_citizen
      ON access_requests(citizen_wallet, status)
  `)

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_access_requests_verifier
      ON access_requests(verifier_wallet, status)
  `)
}

