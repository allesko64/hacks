import { Router } from 'express'
import { getDbConnection } from '../agent'
import { emitEvent } from '../events/bus'
import {
  ensureCitizen,
  mapAccessRequestRow,
  normalizeAddress,
  parseJSONField,
  toNullishJSON,
  upsertProfileSnapshot
} from '../utils/db'

const router = Router()

router.post('/reset', async (_req, res) => {
  try {
    const db = await getDbConnection()
    await db.query('BEGIN')
    await db.query(`DELETE FROM access_requests`)
    await db.query(`DELETE FROM credential_requests`)
    await db.query(`DELETE FROM credential_events`)
    await db.query(`DELETE FROM credentials`)
    await db.query(`DELETE FROM document_verifications`)
    await db.query(`DELETE FROM documents`)
    await db.query(`DELETE FROM citizen_roles`)
    await db.query(`DELETE FROM login_nonces`)
    await db.query(`DELETE FROM citizens`)
    await db.query(`DELETE FROM sqlite_sequence WHERE name IN (
      'access_requests',
      'credential_requests',
      'credential_events',
      'credentials',
      'document_verifications',
      'documents'
    )`)
    await db.query('COMMIT')

    emitEvent('system.reset', { scope: 'citizen-data' })

    return res.json({ ok: true })
  } catch (err: any) {
    try {
      const db = await getDbConnection()
      await db.query('ROLLBACK')
    } catch {
      // ignore rollback errors
    }
    console.error('Admin reset error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to reset data' })
  }
})

router.post('/seed', async (req, res) => {
  const body = req.body ?? {}
  const explicitWallet =
    typeof body.walletAddress === 'string' && body.walletAddress.trim().length
      ? body.walletAddress.trim()
      : null
  const fallbackWallet =
    typeof process.env.DEMO_WALLET_ADDRESS === 'string' && process.env.DEMO_WALLET_ADDRESS.trim().length
      ? process.env.DEMO_WALLET_ADDRESS.trim()
      : null

  if (!explicitWallet && !fallbackWallet) {
    return res.status(400).json({
      ok: false,
      error: 'walletAddress required (or configure DEMO_WALLET_ADDRESS env variable)'
    })
  }

  const walletAddress = normalizeAddress(explicitWallet ?? fallbackWallet!)
  const now = Date.now()

  try {
    const db = await getDbConnection()
    await db.query('BEGIN')
    await ensureCitizen(db, walletAddress)

    await db.query(
      `UPDATE citizens
       SET display_name = ?, full_name = ?, address = ?, date_of_birth = ?, nationality = ?, vaccination_status = ?,
           college_name = ?, college_status = ?, did = ?, updated_at = ?, last_login_at = ?
       WHERE wallet_address = ?`,
      [
        'Demo Citizen',
        'Demo Citizen',
        '123 Pixel Street, Bengaluru',
        '1995-01-01',
        'indian',
        'yes',
        'PixelGenesis Institute',
        'enrolled',
        `did:ethr:${walletAddress}`,
        now,
        now,
        walletAddress
      ]
    )

    const updatedCitizenRows = await db.query(`SELECT * FROM citizens WHERE wallet_address = ?`, [
      walletAddress
    ])
    let documentId: number | null = null
    if (updatedCitizenRows.length) {
      await upsertProfileSnapshot(db, updatedCitizenRows[0])
      const docRows = await db.query(
        `SELECT id FROM documents WHERE wallet_address = ? AND type = ? ORDER BY uploaded_at DESC LIMIT 1`,
        [walletAddress, 'profile_snapshot']
      )
      documentId = docRows.length ? Number(docRows[0].id) : null
    }

    await db.query(`DELETE FROM credentials WHERE wallet_address = ? AND type = ?`, [
      walletAddress,
      'profile_snapshot_vc'
    ])
    await db.query(
      `INSERT INTO credentials (wallet_address, document_id, type, vc_jwt, issuer_wallet, verification_status,
         anchored_tx_hash, anchored_chain_id, anchored_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        walletAddress,
        documentId,
        'profile_snapshot_vc',
        'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.demo-pixelgenesis-vc',
        walletAddress,
        'verified',
        '0xseededvcanchortx',
        'sepolia',
        now,
        now
      ]
    )

    const credentialRows = await db.query(`SELECT * FROM credentials WHERE id = last_insert_rowid()`)
    const credentialId =
      credentialRows.length && credentialRows[0].id !== undefined
        ? Number(credentialRows[0].id)
        : null

    if (credentialId) {
      await db.query(
        `INSERT INTO credential_events (credential_id, event_type, payload, created_at)
         VALUES (?, ?, ?, ?)`,
        [credentialId, 'seeded', toNullishJSON({ reason: 'demo-seed' }), now]
      )
    }

    await db.query(`DELETE FROM credential_requests WHERE wallet_address = ?`, [walletAddress])
    await db.query(
      `INSERT INTO credential_requests (wallet_address, requested_claims, status, issuer_wallet, verifier_wallet, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        walletAddress,
        JSON.stringify(['profile_snapshot']),
        'pending',
        null,
        null,
        toNullishJSON({
          summary: updatedCitizenRows.length ? updatedCitizenRows[0] : null,
          description: 'Please review the latest profile snapshot before issuing the credential.'
        }),
        now,
        now
      ]
    )

    await db.query(`DELETE FROM access_requests WHERE verifier_wallet = ?`, [walletAddress])

    const requestCondition = toNullishJSON({ claim: 'age', op: '>=', value: 21 })
    await db.query(
      `INSERT INTO access_requests (citizen_wallet, verifier_wallet, claim, condition, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        walletAddress,
        walletAddress,
        'age',
        requestCondition,
        'requested',
        toNullishJSON({
          policy: {
            id: 'demo-age-gate',
            label: 'Demo Lounge Entry',
            description: 'Auto-seeded request: verify age ≥ 21.'
          },
          timeline: [{ state: 'requested', at: now }]
        }),
        now,
        now
      ]
    )

    const seededRows = await db.query(
      `SELECT * FROM access_requests WHERE id = last_insert_rowid()`
    )
    const seededRequest = seededRows.length ? mapAccessRequestRow(seededRows[0]) : null

    await db.query('COMMIT')

    if (seededRequest) {
      emitEvent('access_request.created', seededRequest)
    }

    emitEvent('system.seeded', {
      wallet: walletAddress,
      accessRequest: seededRequest,
      message: 'Demo data seeded. Start the flow in the citizen portal.'
    })

    return res.json({ ok: true, wallet: walletAddress })
  } catch (err: any) {
    try {
      const db = await getDbConnection()
      await db.query('ROLLBACK')
    } catch {
      // ignore rollback errors
    }
    console.error('Admin seed error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to seed data' })
  }
})

export default router



