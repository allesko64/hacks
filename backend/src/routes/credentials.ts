import { Router } from 'express'
import { getDbConnection } from '../agent'
import {
  ensureCitizen,
  mapCredentialRow,
  normalizeAddress,
  parseJSONField,
  toNullishJSON
} from '../utils/db'

const router = Router()

router.get('/', async (req, res) => {
  const wallet = typeof req.query.walletAddress === 'string' ? normalizeAddress(req.query.walletAddress) : null
  const documentId = typeof req.query.documentId === 'string' ? Number(req.query.documentId) : null
  const status = typeof req.query.status === 'string' ? req.query.status : null

  try {
    const db = await getDbConnection()
    const clauses: string[] = []
    const params: any[] = []

    if (wallet) {
      clauses.push('wallet_address = ?')
      params.push(wallet)
    }

    if (documentId) {
      clauses.push('document_id = ?')
      params.push(documentId)
    }

    if (status) {
      clauses.push('verification_status = ?')
      params.push(status)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = await db.query(`SELECT * FROM credentials ${where} ORDER BY created_at DESC`, params)

    return res.json({
      ok: true,
      items: rows.map(mapCredentialRow)
    })
  } catch (err: any) {
    console.error('Credential list error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to list credentials' })
  }
})

router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM credentials WHERE id = ?`, [id])
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'credential not found' })
    }

    const events = await db.query(
      `SELECT * FROM credential_events WHERE credential_id = ? ORDER BY created_at DESC`,
      [id]
    )

    return res.json({
      ok: true,
      credential: mapCredentialRow(rows[0]),
      events: events.map((row: any) => ({
        id: Number(row.id),
        credentialId: Number(row.credential_id),
        eventType: row.event_type,
        payload: parseJSONField(row.payload, null),
        createdAt: row.created_at ? Number(row.created_at) : null
      }))
    })
  } catch (err: any) {
    console.error('Credential fetch error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to fetch credential' })
  }
})

router.post('/issue', async (req, res) => {
  const {
    walletAddress,
    documentId,
    type,
    vcJwt,
    issuerWallet,
    verificationStatus,
    anchoredTxHash,
    anchoredChainId,
    anchoredAt
  } = req.body ?? {}

  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({ ok: false, error: 'walletAddress required' })
  }

  if (!vcJwt || typeof vcJwt !== 'string') {
    return res.status(400).json({ ok: false, error: 'vcJwt required' })
  }

  const normalizedWallet = normalizeAddress(walletAddress)
  const normalizedIssuer = issuerWallet ? normalizeAddress(issuerWallet) : null
  const now = Date.now()

  try {
    const db = await getDbConnection()
    await ensureCitizen(db, normalizedWallet)

    await db.query(
      `INSERT INTO credentials (wallet_address, document_id, type, vc_jwt, issuer_wallet,
         verification_status, anchored_tx_hash, anchored_chain_id, anchored_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedWallet,
        documentId ?? null,
        type ?? null,
        vcJwt,
        normalizedIssuer ?? null,
        verificationStatus ?? 'issued',
        anchoredTxHash ?? null,
        anchoredChainId ?? null,
        anchoredAt ?? null,
        now
      ]
    )

    const rows = await db.query(`SELECT * FROM credentials WHERE id = last_insert_rowid()`)
    const credential = mapCredentialRow(rows[0])

    await db.query(
      `INSERT INTO credential_events (credential_id, event_type, payload, created_at)
       VALUES (?, ?, ?, ?)`,
      [credential?.id, 'issued', toNullishJSON(req.body), now]
    )

    if (documentId && verificationStatus === 'verified') {
      await db.query(`UPDATE documents SET status = 'verified', reviewed_at = COALESCE(reviewed_at, ?) WHERE id = ?`, [
        now,
        documentId
      ])
    }

    return res.json({
      ok: true,
      credential
    })
  } catch (err: any) {
    console.error('Credential issue error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to store credential' })
  }
})

router.patch('/:id/status', async (req, res) => {
  const { id } = req.params
  const { status, anchoredTxHash, anchoredChainId, anchoredAt, revokedAt } = req.body ?? {}

  if (!status || typeof status !== 'string') {
    return res.status(400).json({ ok: false, error: 'status required' })
  }

  const now = Date.now()

  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM credentials WHERE id = ?`, [id])

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'credential not found' })
    }

    await db.query(
      `UPDATE credentials
       SET verification_status = ?,
           anchored_tx_hash = COALESCE(?, anchored_tx_hash),
           anchored_chain_id = COALESCE(?, anchored_chain_id),
           anchored_at = COALESCE(?, anchored_at),
           revoked_at = COALESCE(?, revoked_at)
       WHERE id = ?`,
      [status, anchoredTxHash ?? null, anchoredChainId ?? null, anchoredAt ?? null, revokedAt ?? null, id]
    )

    await db.query(
      `INSERT INTO credential_events (credential_id, event_type, payload, created_at)
       VALUES (?, ?, ?, ?)`,
      [id, status, toNullishJSON(req.body), now]
    )

    const updated = await db.query(`SELECT * FROM credentials WHERE id = ?`, [id])
    return res.json({
      ok: true,
      credential: mapCredentialRow(updated[0])
    })
  } catch (err: any) {
    console.error('Credential status update error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to update credential' })
  }
})

router.post('/:id/events', async (req, res) => {
  const { id } = req.params
  const { eventType, payload } = req.body ?? {}

  if (!eventType || typeof eventType !== 'string') {
    return res.status(400).json({ ok: false, error: 'eventType required' })
  }

  const now = Date.now()

  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM credentials WHERE id = ?`, [id])
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'credential not found' })
    }

    await db.query(
      `INSERT INTO credential_events (credential_id, event_type, payload, created_at)
       VALUES (?, ?, ?, ?)`,
      [id, eventType, toNullishJSON(payload), now]
    )

    return res.json({
      ok: true
    })
  } catch (err: any) {
    console.error('Credential event error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to store credential event' })
  }
})

export default router

