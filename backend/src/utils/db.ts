import { Connection } from 'typeorm'
import { Buffer } from 'buffer'

export function normalizeAddress(address: string) {
  return address.toLowerCase()
}

export async function ensureCitizen(db: Connection, walletAddress: string) {
  const now = Date.now()
  await db.query(
    `INSERT INTO citizens (wallet_address, created_at, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(wallet_address) DO UPDATE SET
       updated_at = ?`,
    [walletAddress, now, now, now]
  )
}

export function toNullishJSON(value: unknown) {
  if (value === undefined || value === null) return null
  return JSON.stringify(value)
}

export function parseJSONField<T>(value: any, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function mapDocumentRow(row: any) {
  if (!row) return null
  return {
    id: Number(row.id),
    walletAddress: row.wallet_address,
    type: row.type,
    storageUri: row.storage_uri,
    ipfsCid: row.ipfs_cid,
    status: row.status,
    metadata: parseJSONField(row.metadata, null),
    uploadedAt: row.uploaded_at ? Number(row.uploaded_at) : null,
    reviewedAt: row.reviewed_at ? Number(row.reviewed_at) : null
  }
}

export function mapCredentialRow(row: any) {
  if (!row) return null
  return {
    id: Number(row.id),
    walletAddress: row.wallet_address,
    documentId: row.document_id !== null && row.document_id !== undefined ? Number(row.document_id) : null,
    type: row.type,
    issuerWallet: row.issuer_wallet,
    verificationStatus: row.verification_status,
    anchoredTxHash: row.anchored_tx_hash,
    anchoredChainId: row.anchored_chain_id,
    anchoredAt: row.anchored_at ? Number(row.anchored_at) : null,
    revokedAt: row.revoked_at ? Number(row.revoked_at) : null,
    createdAt: row.created_at ? Number(row.created_at) : null,
    vcJwt: row.vc_jwt
  }
}

export function mapRequestRow(row: any) {
  if (!row) return null
  return {
    id: Number(row.id),
    walletAddress: row.wallet_address,
    requestedClaims: parseJSONField<string[]>(row.requested_claims, []),
    status: row.status,
    issuerWallet: row.issuer_wallet,
    verifierWallet: row.verifier_wallet,
    notes: row.notes,
    createdAt: row.created_at ? Number(row.created_at) : null,
    updatedAt: row.updated_at ? Number(row.updated_at) : null
  }
}

export function mapVerificationRow(row: any) {
  if (!row) return null
  return {
    id: Number(row.id),
    documentId: Number(row.document_id),
    verifierWallet: row.verifier_wallet,
    decision: row.decision,
    notes: row.notes,
    createdAt: row.created_at ? Number(row.created_at) : null
  }
}

export function mapAccessRequestRow(row: any) {
  if (!row) return null
  const parsedNotes = parseJSONField<Record<string, unknown>>(row.notes, null)
  const fallbackNotes =
    typeof row.notes === 'string' && !parsedNotes ? row.notes : null
  return {
    id: Number(row.id),
    citizenWallet: row.citizen_wallet,
    verifierWallet: row.verifier_wallet,
    claim: row.claim,
    condition: parseJSONField(row.condition, null),
    status: row.status,
    notes: parsedNotes ?? fallbackNotes,
    responsePayload: parseJSONField(row.response_payload, null),
    createdAt: row.created_at ? Number(row.created_at) : null,
    updatedAt: row.updated_at ? Number(row.updated_at) : null,
    respondedAt: row.responded_at ? Number(row.responded_at) : null
  }
}

function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1
  }
  return age
}

export async function upsertProfileSnapshot(db: Connection, citizenRow: any) {
  if (!citizenRow) return

  const walletAddress = citizenRow.wallet_address
  const summary = {
    walletAddress,
    did: citizenRow.did,
    fullName: citizenRow.full_name,
    displayName: citizenRow.display_name,
    nationality: citizenRow.nationality,
    vaccinationStatus: citizenRow.vaccination_status,
    collegeName: citizenRow.college_name,
    collegeStatus: citizenRow.college_status,
    address: citizenRow.address,
    dateOfBirth: citizenRow.date_of_birth,
    age: calculateAge(citizenRow.date_of_birth),
    updatedAt: new Date().toISOString()
  }

  const now = Date.now()
  const summaryJson = JSON.stringify(summary, null, 2)
  const storageUri = `data:application/json;base64,${Buffer.from(summaryJson, 'utf-8').toString('base64')}`
  const metadata = toNullishJSON({
    summary,
    filename: 'profile-snapshot.json',
    description: 'Latest saved profile information.',
    source: 'profile_snapshot'
  })

  const existingRows = await db.query(
    `SELECT id FROM documents WHERE wallet_address = ? AND type = ? ORDER BY uploaded_at DESC LIMIT 1`,
    [walletAddress, 'profile_snapshot']
  )

  if (existingRows.length) {
    const docId = existingRows[0].id
    await db.query(
      `UPDATE documents
       SET metadata = ?, storage_uri = ?, status = ?, reviewed_at = ?, uploaded_at = ?
       WHERE id = ?`,
      [metadata, storageUri, 'verified', now, now, docId]
    )
  } else {
    await db.query(
      `INSERT INTO documents (wallet_address, type, storage_uri, ipfs_cid, status, metadata, uploaded_at, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [walletAddress, 'profile_snapshot', storageUri, null, 'verified', metadata, now, now]
    )
  }
}

