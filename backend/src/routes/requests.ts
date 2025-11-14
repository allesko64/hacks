import { Router } from 'express'
import { getDbConnection } from '../agent'
import { ensureCitizen, mapRequestRow, normalizeAddress } from '../utils/db'

const router = Router()

router.get('/', async (req, res) => {
  const wallet = typeof req.query.walletAddress === 'string' ? normalizeAddress(req.query.walletAddress) : null
  const status = typeof req.query.status === 'string' ? req.query.status : null

  try {
    const db = await getDbConnection()
    const clauses: string[] = []
    const params: any[] = []

    if (wallet) {
      clauses.push('wallet_address = ?')
      params.push(wallet)
    }

    if (status) {
      clauses.push('status = ?')
      params.push(status)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = await db.query(
      `SELECT * FROM credential_requests ${where} ORDER BY created_at DESC`,
      params
    )

    return res.json({
      ok: true,
      items: rows.map(mapRequestRow)
    })
  } catch (err: any) {
    console.error('Credential request list error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to list credential requests' })
  }
})

router.post('/', async (req, res) => {
  const { walletAddress, requestedClaims, notes } = req.body ?? {}

  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({ ok: false, error: 'walletAddress required' })
  }

  const claimsArray: string[] =
    Array.isArray(requestedClaims) && requestedClaims.every((c) => typeof c === 'string')
      ? requestedClaims
      : []

  if (!claimsArray.length) {
    return res.status(400).json({ ok: false, error: 'requestedClaims must include at least one value' })
  }

  const normalizedWallet = normalizeAddress(walletAddress)
  const now = Date.now()

  try {
    const db = await getDbConnection()
    await ensureCitizen(db, normalizedWallet)

    await db.query(
      `INSERT INTO credential_requests (wallet_address, requested_claims, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [normalizedWallet, JSON.stringify(claimsArray), 'pending', notes ?? null, now]
    )

    const rows = await db.query(`SELECT * FROM credential_requests WHERE id = last_insert_rowid()`)
    return res.json({
      ok: true,
      request: mapRequestRow(rows[0])
    })
  } catch (err: any) {
    console.error('Credential request creation error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to store credential request' })
  }
})

router.patch('/:id/status', async (req, res) => {
  const { id } = req.params
  const { status, issuerWallet, verifierWallet, notes } = req.body ?? {}

  if (!status || typeof status !== 'string') {
    return res.status(400).json({ ok: false, error: 'status required' })
  }

  const now = Date.now()

  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM credential_requests WHERE id = ?`, [id])

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'request not found' })
    }

    await db.query(
      `UPDATE credential_requests
       SET status = ?, issuer_wallet = COALESCE(?, issuer_wallet), verifier_wallet = COALESCE(?, verifier_wallet),
           notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
      [
        status,
        issuerWallet ? normalizeAddress(issuerWallet) : null,
        verifierWallet ? normalizeAddress(verifierWallet) : null,
        notes ?? null,
        now,
        id
      ]
    )

    const updated = await db.query(`SELECT * FROM credential_requests WHERE id = ?`, [id])
    return res.json({
      ok: true,
      request: mapRequestRow(updated[0])
    })
  } catch (err: any) {
    console.error('Credential request status error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to update credential request' })
  }
})

router.post('/:id/assign', async (req, res) => {
  const { id } = req.params
  const { issuerWallet, verifierWallet } = req.body ?? {}

  if (!issuerWallet && !verifierWallet) {
    return res.status(400).json({ ok: false, error: 'issuerWallet or verifierWallet required' })
  }

  const now = Date.now()

  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM credential_requests WHERE id = ?`, [id])

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'request not found' })
    }

    await db.query(
      `UPDATE credential_requests
       SET issuer_wallet = COALESCE(?, issuer_wallet),
           verifier_wallet = COALESCE(?, verifier_wallet),
           updated_at = ?
       WHERE id = ?`,
      [
        issuerWallet ? normalizeAddress(issuerWallet) : null,
        verifierWallet ? normalizeAddress(verifierWallet) : null,
        now,
        id
      ]
    )

    const updated = await db.query(`SELECT * FROM credential_requests WHERE id = ?`, [id])

    return res.json({
      ok: true,
      request: mapRequestRow(updated[0])
    })
  } catch (err: any) {
    console.error('Credential request assign error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to assign request' })
  }
})

router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM credential_requests WHERE id = ?`, [id])
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'request not found' })
    }

    return res.json({
      ok: true,
      request: mapRequestRow(rows[0])
    })
  } catch (err: any) {
    console.error('Credential request fetch error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to fetch credential request' })
  }
})

export default router

