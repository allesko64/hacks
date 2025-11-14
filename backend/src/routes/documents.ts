import { Router } from 'express'
import { getDbConnection } from '../agent'
import { ensureCitizen, mapDocumentRow, mapVerificationRow, normalizeAddress, toNullishJSON } from '../utils/db'

const router = Router()

router.get('/', async (req, res) => {
  const wallet = typeof req.query.walletAddress === 'string' ? normalizeAddress(req.query.walletAddress) : null
  const status = typeof req.query.status === 'string' ? req.query.status : null

  try {
    const db = await getDbConnection()
    const conditions: string[] = []
    const params: any[] = []

    if (wallet) {
      conditions.push('wallet_address = ?')
      params.push(wallet)
    }

    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await db.query(`SELECT * FROM documents ${where} ORDER BY uploaded_at DESC`, params)

    return res.json({
      ok: true,
      items: rows.map(mapDocumentRow)
    })
  } catch (err: any) {
    console.error('Documents list error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to list documents' })
  }
})

router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM documents WHERE id = ?`, [id])
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'document not found' })
    }

    const history = await db.query(
      `SELECT * FROM document_verifications WHERE document_id = ? ORDER BY created_at DESC`,
      [id]
    )

    return res.json({
      ok: true,
      document: mapDocumentRow(rows[0]),
      verifications: history.map(mapVerificationRow)
    })
  } catch (err: any) {
    console.error('Document fetch error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to fetch document' })
  }
})

router.post('/upload', async (req, res) => {
  const { walletAddress, type, storageUri, ipfsCid, metadata, status } = req.body ?? {}

  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({ ok: false, error: 'walletAddress required' })
  }

  if (!type || typeof type !== 'string') {
    return res.status(400).json({ ok: false, error: 'type required' })
  }

  if (!storageUri || typeof storageUri !== 'string') {
    return res.status(400).json({ ok: false, error: 'storageUri required' })
  }

  const normalizedWallet = normalizeAddress(walletAddress)
  const now = Date.now()
  const docStatus = status && typeof status === 'string' ? status : 'uploaded'

  try {
    const db = await getDbConnection()
    await ensureCitizen(db, normalizedWallet)

    await db.query(
      `INSERT INTO documents (wallet_address, type, storage_uri, ipfs_cid, status, metadata, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [normalizedWallet, type, storageUri, ipfsCid ?? null, docStatus, toNullishJSON(metadata), now]
    )

    const rows = await db.query(`SELECT * FROM documents WHERE id = last_insert_rowid()`)
    return res.json({
      ok: true,
      document: mapDocumentRow(rows[0])
    })
  } catch (err: any) {
    console.error('Document upload error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to store document' })
  }
})

router.patch('/:id/status', async (req, res) => {
  const { id } = req.params
  const { status, verifierWallet, notes } = req.body ?? {}

  if (!status || typeof status !== 'string') {
    return res.status(400).json({ ok: false, error: 'status required' })
  }

  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM documents WHERE id = ?`, [id])

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'document not found' })
    }

    const document = rows[0]
    const normalizedVerifier = verifierWallet ? normalizeAddress(verifierWallet) : null
    const now = Date.now()
    const reviewedAt =
      status === 'verified' || status === 'rejected' || status === 'under_review' ? now : document.reviewed_at

    await db.query(
      `UPDATE documents SET status = ?, reviewed_at = COALESCE(?, reviewed_at) WHERE id = ?`,
      [status, reviewedAt ?? null, id]
    )

    if (normalizedVerifier && (status === 'verified' || status === 'rejected')) {
      await db.query(
        `INSERT INTO document_verifications (document_id, verifier_wallet, decision, notes, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, normalizedVerifier, status, notes ?? null, now]
      )
    }

    const updated = await db.query(`SELECT * FROM documents WHERE id = ?`, [id])
    return res.json({
      ok: true,
      document: mapDocumentRow(updated[0])
    })
  } catch (err: any) {
    console.error('Document status update error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to update document status' })
  }
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const db = await getDbConnection()
    await db.query(`DELETE FROM documents WHERE id = ?`, [id])

    return res.json({
      ok: true
    })
  } catch (err: any) {
    console.error('Document delete error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to delete document' })
  }
})

router.get('/:id/verifications', async (req, res) => {
  const { id } = req.params
  try {
    const db = await getDbConnection()
    const rows = await db.query(
      `SELECT * FROM document_verifications WHERE document_id = ? ORDER BY created_at DESC`,
      [id]
    )

    return res.json({
      ok: true,
      items: rows.map(mapVerificationRow)
    })
  } catch (err: any) {
    console.error('Document verification list error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to list verifications' })
  }
})

export default router

