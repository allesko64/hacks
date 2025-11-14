import { Router } from 'express'
import { randomBytes } from 'crypto'
import { verifyMessage } from 'ethers'
import { getDbConnection } from '../agent'

const router = Router()

const NONCE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function createNonce() {
  return randomBytes(16).toString('hex')
}

function normalize(address: string) {
  return address.toLowerCase()
}

router.post('/nonce', async (req, res) => {
  const { address } = req.body ?? {}

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ ok: false, error: 'address required' })
  }

  try {
    const db = await getDbConnection()
    const nonce = createNonce()
    const expiresAt = Date.now() + NONCE_TTL_MS
    const key = normalize(address)

    await db.query(
      `INSERT INTO login_nonces (wallet_address, nonce, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(wallet_address) DO UPDATE SET
         nonce = excluded.nonce,
         expires_at = excluded.expires_at`,
      [key, nonce, expiresAt]
    )

    return res.json({ ok: true, nonce })
  } catch (err: any) {
    console.error('Nonce generation error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'nonce persistence failed' })
  }
})

router.post('/verify', async (req, res) => {
  const { address, signature } = req.body ?? {}

  if (!address || typeof address !== 'string' || !signature || typeof signature !== 'string') {
    return res.status(400).json({ ok: false, error: 'address and signature required' })
  }

  const key = normalize(address)

  try {
    const db = await getDbConnection()

    const rows = (await db.query(
      `SELECT nonce, expires_at FROM login_nonces WHERE wallet_address = ?`,
      [key]
    )) as Array<{ nonce: string; expires_at: number }>

    if (!rows.length) {
      return res.status(400).json({ ok: false, error: 'nonce not found; request a new one' })
    }

    const record = rows[0]

    if (Date.now() > Number(record.expires_at)) {
      await db.query(`DELETE FROM login_nonces WHERE wallet_address = ?`, [key])
      return res.status(400).json({ ok: false, error: 'nonce expired; request a new one' })
    }

    const message = `PixelGenesis login nonce: ${record.nonce}`
    const recovered = verifyMessage(message, signature)

    if (normalize(recovered) !== key) {
      return res.status(401).json({ ok: false, error: 'signature mismatch' })
    }

    await db.query(`DELETE FROM login_nonces WHERE wallet_address = ?`, [key])

    const now = Date.now()

    await db.query(
      `INSERT INTO citizens (wallet_address, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(wallet_address) DO UPDATE SET
         updated_at = ?,
         last_login_at = ?`,
      [key, now, now, now, now, now]
    )

    // TODO: issue a JWT or session token. For now we echo success.
    return res.json({
      ok: true,
      message: 'Wallet verified',
      address: recovered,
      token: null
    })
  } catch (err: any) {
    console.error('Signature verification error:', err)
    return res.status(400).json({ ok: false, error: err?.message ?? 'Invalid signature' })
  }
})

export default router
