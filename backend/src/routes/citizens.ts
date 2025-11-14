import { Router } from 'express'
import { getDbConnection } from '../agent'
import { ensureCitizen, normalizeAddress, upsertProfileSnapshot } from '../utils/db'

const router = Router()

const ALLOWED_NATIONALITIES = new Set(['indian', 'foreign'])
const ALLOWED_VACCINATION_STATUS = new Set(['yes', 'no'])
const ALLOWED_COLLEGE_STATUS = new Set(['enrolled', 'graduated', 'not_enrolled'])

function normalizeChoice(
  value: unknown,
  allowed: Set<string>,
  fieldName: string
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const normalized = value.toString().trim().toLowerCase()
  if (!normalized.length) return null
  if (!allowed.has(normalized)) {
    throw new Error(
      `${fieldName} must be one of: ${Array.from(allowed)
        .map((item) => `"${item}"`)
        .join(', ')}`
    )
  }
  return normalized
}

function normalizeDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.toString().trim()
  if (!trimmed.length) return null
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!isoDateRegex.test(trimmed)) {
    throw new Error('dateOfBirth must be in YYYY-MM-DD format')
  }
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) {
    throw new Error('dateOfBirth is not a valid date')
  }
  return trimmed
}

router.get('/:walletAddress', async (req, res) => {
  const walletAddress = normalizeAddress(req.params.walletAddress)
  try {
    const db = await getDbConnection()
    const citizens = await db.query(`SELECT * FROM citizens WHERE wallet_address = ?`, [walletAddress])

    if (!citizens.length) {
      return res.status(404).json({ ok: false, error: 'citizen not found' })
    }

    const roles = await db.query(`SELECT role, assigned_at FROM citizen_roles WHERE wallet_address = ?`, [
      walletAddress
    ])

    const documents = await db.query(
      `SELECT status, COUNT(*) as count FROM documents WHERE wallet_address = ? GROUP BY status`,
      [walletAddress]
    )

    const credentials = await db.query(
      `SELECT verification_status, COUNT(*) as count FROM credentials WHERE wallet_address = ? GROUP BY verification_status`,
      [walletAddress]
    )

    return res.json({
      ok: true,
      citizen: {
        walletAddress,
        did: citizens[0].did,
        displayName: citizens[0].display_name,
        email: citizens[0].email,
        role: citizens[0].role,
        fullName: citizens[0].full_name,
        address: citizens[0].address,
        dateOfBirth: citizens[0].date_of_birth,
        nationality: citizens[0].nationality,
        vaccinationStatus: citizens[0].vaccination_status,
        collegeName: citizens[0].college_name,
        collegeStatus: citizens[0].college_status,
        createdAt: Number(citizens[0].created_at),
        updatedAt: Number(citizens[0].updated_at),
        lastLoginAt: citizens[0].last_login_at ? Number(citizens[0].last_login_at) : null,
        roles: roles.map((roleRow: any) => ({
          role: roleRow.role,
          assignedAt: Number(roleRow.assigned_at)
        })),
        documentSummary: documents.map((row: any) => ({
          status: row.status,
          count: Number(row.count)
        })),
        credentialSummary: credentials.map((row: any) => ({
          status: row.verification_status ?? 'unknown',
          count: Number(row.count)
        }))
      }
    })
  } catch (err: any) {
    console.error('Citizen fetch error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to fetch citizen' })
  }
})

router.patch('/:walletAddress', async (req, res) => {
  const walletAddress = normalizeAddress(req.params.walletAddress)
  const {
    did,
    displayName,
    email,
    role,
    fullName,
    address,
    dateOfBirth,
    nationality,
    vaccinationStatus,
    collegeName,
    collegeStatus
  } = req.body ?? {}
  const now = Date.now()

  try {
    const db = await getDbConnection()
    await ensureCitizen(db, walletAddress)

    let normalizedNationality: string | null | undefined
    let normalizedVaccination: string | null | undefined
    let normalizedDob: string | null | undefined
    let normalizedCollegeStatus: string | null | undefined

    try {
      normalizedNationality = normalizeChoice(nationality, ALLOWED_NATIONALITIES, 'nationality')
      normalizedVaccination = normalizeChoice(
        vaccinationStatus,
        ALLOWED_VACCINATION_STATUS,
        'vaccinationStatus'
      )
      normalizedDob = normalizeDate(dateOfBirth)
      normalizedCollegeStatus = normalizeChoice(
        collegeStatus,
        ALLOWED_COLLEGE_STATUS,
        'collegeStatus'
      )
    } catch (validationError: any) {
      return res.status(400).json({ ok: false, error: validationError.message })
    }

    const updateParts: string[] = []
    const parameters: any[] = []

    if (did !== undefined) {
      updateParts.push('did = ?')
      parameters.push(did ?? null)
    }

    if (displayName !== undefined) {
      updateParts.push('display_name = ?')
      parameters.push(displayName ?? null)
    }

    if (email !== undefined) {
      updateParts.push('email = ?')
      parameters.push(email ?? null)
    }

    if (role !== undefined) {
      updateParts.push('role = ?')
      parameters.push(role ?? null)
    }

    if (fullName !== undefined) {
      updateParts.push('full_name = ?')
      parameters.push(fullName ?? null)
    }

    if (address !== undefined) {
      updateParts.push('address = ?')
      parameters.push(address ?? null)
    }

    if (normalizedDob !== undefined) {
      updateParts.push('date_of_birth = ?')
      parameters.push(normalizedDob)
    }

    if (normalizedNationality !== undefined) {
      updateParts.push('nationality = ?')
      parameters.push(normalizedNationality)
    }

    if (normalizedVaccination !== undefined) {
      updateParts.push('vaccination_status = ?')
      parameters.push(normalizedVaccination)
    }

    if (collegeName !== undefined) {
      updateParts.push('college_name = ?')
      parameters.push(collegeName ?? null)
    }

    if (normalizedCollegeStatus !== undefined) {
      updateParts.push('college_status = ?')
      parameters.push(normalizedCollegeStatus)
    }

    updateParts.push('updated_at = ?')
    parameters.push(now)
    parameters.push(walletAddress)

    await db.query(
      `UPDATE citizens SET ${updateParts.join(', ')} WHERE wallet_address = ?`,
      parameters
    )

    const updated = await db.query(`SELECT * FROM citizens WHERE wallet_address = ?`, [walletAddress])
    if (updated.length) {
      await upsertProfileSnapshot(db, updated[0])
    }

    return res.json({
      ok: true,
      citizen: {
        walletAddress,
        did: updated[0].did,
        displayName: updated[0].display_name,
        email: updated[0].email,
        role: updated[0].role,
        fullName: updated[0].full_name,
        address: updated[0].address,
        dateOfBirth: updated[0].date_of_birth,
        nationality: updated[0].nationality,
        vaccinationStatus: updated[0].vaccination_status,
        collegeName: updated[0].college_name,
        collegeStatus: updated[0].college_status,
        createdAt: Number(updated[0].created_at),
        updatedAt: Number(updated[0].updated_at),
        lastLoginAt: updated[0].last_login_at ? Number(updated[0].last_login_at) : null
      }
    })
  } catch (err: any) {
    console.error('Citizen update error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to update citizen' })
  }
})

router.post('/:walletAddress/roles', async (req, res) => {
  const walletAddress = normalizeAddress(req.params.walletAddress)
  const { role } = req.body ?? {}

  if (!role || typeof role !== 'string') {
    return res.status(400).json({ ok: false, error: 'role required' })
  }

  const now = Date.now()

  try {
    const db = await getDbConnection()
    await ensureCitizen(db, walletAddress)

    await db.query(
      `INSERT INTO citizen_roles (wallet_address, role, assigned_at)
       VALUES (?, ?, ?)
       ON CONFLICT(wallet_address, role) DO UPDATE SET assigned_at = excluded.assigned_at`,
      [walletAddress, role, now]
    )

    return res.json({ ok: true })
  } catch (err: any) {
    console.error('Citizen role assign error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to assign role' })
  }
})

router.delete('/:walletAddress/roles/:role', async (req, res) => {
  const walletAddress = normalizeAddress(req.params.walletAddress)
  const role = req.params.role

  try {
    const db = await getDbConnection()
    await db.query(`DELETE FROM citizen_roles WHERE wallet_address = ? AND role = ?`, [walletAddress, role])

    return res.json({ ok: true })
  } catch (err: any) {
    console.error('Citizen role delete error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to remove role' })
  }
})

export default router

