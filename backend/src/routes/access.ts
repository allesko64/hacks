import { Router } from 'express'
import { getDbConnection, getAgent } from '../agent'
import {
  ensureCitizen,
  mapAccessRequestRow,
  normalizeAddress,
  toNullishJSON,
  parseJSONField
} from '../utils/db'
import { emitEvent } from '../events/bus'

const router = Router()

function notesToObject(existing: any): Record<string, any> {
  const parsed = parseJSONField<Record<string, any>>(existing, null)
  if (parsed && typeof parsed === 'object') {
    return { ...parsed }
  }
  return {}
}

function serializeNotes(obj: Record<string, any> | null) {
  if (!obj || !Object.keys(obj).length) return null
  return JSON.stringify(obj)
}

function extractPrimaryClaim(condition: any): string | null {
  if (!condition || typeof condition !== 'object') return null
  if (typeof condition.claim === 'string' && condition.claim.trim()) {
    return condition.claim
  }
  if (Array.isArray(condition.all)) {
    for (const entry of condition.all) {
      const found = extractPrimaryClaim(entry)
      if (found) return found
    }
  }
  if (Array.isArray(condition.any)) {
    for (const entry of condition.any) {
      const found = extractPrimaryClaim(entry)
      if (found) return found
    }
  }
  return null
}

function describeCondition(condition: any): string {
  if (!condition) return 'no condition provided'
  if (typeof condition === 'string') return condition
  if (Array.isArray(condition.all)) {
    return `ALL[${condition.all.map((entry: any) => describeCondition(entry)).join(' & ')}]`
  }
  if (Array.isArray(condition.any)) {
    return `ANY[${condition.any.map((entry: any) => describeCondition(entry)).join(' | ')}]`
  }
  const claim = condition.claim ? `${condition.claim} ` : ''
  const op = condition.op ?? condition.operator ?? '=='
  const expected = condition.value ?? condition.expected
  return `${claim}${op} ${expected}`
}

type EvaluationResult = {
  pass: boolean
  reason: string
  values: Record<string, any>
}

function evaluateScalar(value: any, condition: any): { pass: boolean; reason: string } {
  if (condition === null || condition === undefined) {
    return { pass: false, reason: 'Missing comparison operator' }
  }

  if (typeof condition === 'string') {
    const pass = String(value) === condition
    return {
      pass,
      reason: pass
        ? `Value "${value}" equals "${condition}"`
        : `Value "${value}" does not equal "${condition}"`
    }
  }

  const op = condition.op ?? condition.operator ?? 'equals'
  const expected = condition.value ?? condition.expected

  const toNumber = (input: any) => {
    const num = Number(input)
    return Number.isNaN(num) ? null : num
  }

  switch (op) {
    case '>=': {
      const actual = toNumber(value)
      const exp = toNumber(expected)
      if (actual === null || exp === null) {
        return { pass: false, reason: 'Non-numeric comparison for >= operator' }
      }
      const pass = actual >= exp
      return {
        pass,
        reason: pass
          ? `Value ${actual} is ≥ ${exp}`
          : `Value ${actual} is < ${exp}`
      }
    }
    case '>': {
      const actual = toNumber(value)
      const exp = toNumber(expected)
      if (actual === null || exp === null) {
        return { pass: false, reason: 'Non-numeric comparison for > operator' }
      }
      const pass = actual > exp
      return {
        pass,
        reason: pass ? `Value ${actual} is > ${exp}` : `Value ${actual} is ≤ ${exp}`
      }
    }
    case '<=': {
      const actual = toNumber(value)
      const exp = toNumber(expected)
      if (actual === null || exp === null) {
        return { pass: false, reason: 'Non-numeric comparison for <= operator' }
      }
      const pass = actual <= exp
      return {
        pass,
        reason: pass
          ? `Value ${actual} is ≤ ${exp}`
          : `Value ${actual} is > ${exp}`
      }
    }
    case '<': {
      const actual = toNumber(value)
      const exp = toNumber(expected)
      if (actual === null || exp === null) {
        return { pass: false, reason: 'Non-numeric comparison for < operator' }
      }
      const pass = actual < exp
      return {
        pass,
        reason: pass ? `Value ${actual} is < ${exp}` : `Value ${actual} is ≥ ${exp}`
      }
    }
    case 'contains':
    case 'includes': {
      if (!Array.isArray(value) && typeof value !== 'string') {
        return { pass: false, reason: 'Value is not list-like for contains/includes check' }
      }
      const pass = Array.isArray(value)
        ? value.includes(expected)
        : String(value).includes(String(expected))
      return {
        pass,
        reason: pass
          ? `Value contains "${expected}"`
          : `Value does not contain "${expected}"`
      }
    }
    case 'startsWith': {
      const actual = String(value ?? '')
      const prefix = String(expected ?? '')
      const pass = actual.startsWith(prefix)
      return {
        pass,
        reason: pass
          ? `Value starts with "${prefix}"`
          : `Value does not start with "${prefix}"`
      }
    }
    case 'endsWith': {
      const actual = String(value ?? '')
      const suffix = String(expected ?? '')
      const pass = actual.endsWith(suffix)
      return {
        pass,
        reason: pass
          ? `Value ends with "${suffix}"`
          : `Value does not end with "${suffix}"`
      }
    }
    case 'equals':
    case '==':
    case '===':
    default: {
      const pass = value === expected
      return {
        pass,
        reason: pass
          ? `Value "${value}" equals "${expected}"`
          : `Value "${value}" does not equal "${expected}"`
      }
    }
  }
}

function evaluateExpression(
  subject: Record<string, any>,
  expression: any,
  fallbackClaim: string | null
): EvaluationResult {
  if (expression === null || expression === undefined) {
    return { pass: false, reason: 'Missing condition', values: {} }
  }

  if (typeof expression === 'string') {
    if (!fallbackClaim) {
      return { pass: false, reason: 'No claim specified for condition', values: {} }
    }
    const value = subject?.[fallbackClaim]
    if (value === undefined) {
      return {
        pass: false,
        reason: `Claim "${fallbackClaim}" not present in credential`,
        values: {}
      }
    }
    const scalar = evaluateScalar(value, { op: 'equals', value: expression })
    return {
      pass: scalar.pass,
      reason: `${fallbackClaim}: ${scalar.reason}`,
      values: { [fallbackClaim]: value }
    }
  }

  if (Array.isArray(expression.all)) {
    let aggregateReason: string[] = []
    let aggregateValues: Record<string, any> = {}
    const results = expression.all.map((entry: any) =>
      evaluateExpression(subject, entry, entry?.claim ?? fallbackClaim)
    )
    for (const result of results) {
      aggregateReason.push(result.reason)
      aggregateValues = { ...aggregateValues, ...result.values }
    }
    const pass = results.every((result) => result.pass)
    return {
      pass,
      reason: pass
        ? `All conditions satisfied: ${aggregateReason.join(' | ')}`
        : `Some conditions failed: ${aggregateReason.join(' | ')}`,
      values: aggregateValues
    }
  }

  if (Array.isArray(expression.any)) {
    let aggregateReason: string[] = []
    let aggregateValues: Record<string, any> = {}
    const results = expression.any.map((entry: any) =>
      evaluateExpression(subject, entry, entry?.claim ?? fallbackClaim)
    )
    for (const result of results) {
      aggregateReason.push(result.reason)
      aggregateValues = { ...aggregateValues, ...result.values }
    }
    const pass = results.some((result) => result.pass)
    return {
      pass,
      reason: pass
        ? `At least one condition satisfied: ${aggregateReason.join(' | ')}`
        : `No conditions satisfied: ${aggregateReason.join(' | ')}`,
      values: aggregateValues
    }
  }

  const claimKey = expression.claim ?? fallbackClaim
  if (!claimKey) {
    return { pass: false, reason: 'No claim specified for condition', values: {} }
  }

  const value = subject?.[claimKey]
  if (value === undefined) {
    return {
      pass: false,
      reason: `Claim "${claimKey}" not present in credential`,
      values: {}
    }
  }

  const scalar = evaluateScalar(value, expression)
  return {
    pass: scalar.pass,
    reason: `${claimKey}: ${scalar.reason}`,
    values: { [claimKey]: value }
  }
}

router.post('/request', async (req, res) => {
  const {
    citizenWallet,
    verifierWallet,
    claim,
    condition,
    policy,
    notes: initialNoteMessage
  } = req.body ?? {}

  if (!citizenWallet || typeof citizenWallet !== 'string') {
    return res.status(400).json({ ok: false, error: 'citizenWallet required' })
  }

  if (!verifierWallet || typeof verifierWallet !== 'string') {
    return res.status(400).json({ ok: false, error: 'verifierWallet required' })
  }

  if (!condition) {
    return res.status(400).json({ ok: false, error: 'condition required' })
  }

  const normalizedCitizen = normalizeAddress(citizenWallet)
  const normalizedVerifier = normalizeAddress(verifierWallet)
  const now = Date.now()

  try {
    const db = await getDbConnection()
    await ensureCitizen(db, normalizedCitizen)

    const conditionObject = typeof condition === 'string' ? null : condition
    const conditionPayload =
      typeof condition === 'string' ? condition : JSON.stringify(condition)

    let primaryClaim: string | null =
      typeof claim === 'string' && claim.trim() ? claim : null

    if (!primaryClaim) {
      primaryClaim = extractPrimaryClaim(conditionObject)
    }

    if (!primaryClaim) {
      return res
        .status(400)
        .json({ ok: false, error: 'Unable to determine claim for access request' })
    }

    let policyInfo: Record<string, any> | undefined
    if (policy && typeof policy === 'object') {
      const id = policy.id ? String(policy.id) : undefined
      const label = policy.label ? String(policy.label) : undefined
      const description =
        policy.description !== undefined ? String(policy.description) : undefined

      if (id || label) {
        policyInfo = { id, label, description }
      }
    }

    const baseNotes: Record<string, any> = {
      timeline: [{ state: 'requested', at: now }]
    }

    if (policyInfo) {
      baseNotes.policy = policyInfo
    }

    if (typeof initialNoteMessage === 'string' && initialNoteMessage.trim()) {
      baseNotes.initialMessage = initialNoteMessage.trim()
    }

    await db.query(
      `INSERT INTO access_requests (citizen_wallet, verifier_wallet, claim, condition, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedCitizen,
        normalizedVerifier,
        primaryClaim,
        conditionPayload,
        'requested',
        serializeNotes(baseNotes),
        now
      ]
    )

    const rows = await db.query(`SELECT * FROM access_requests WHERE id = last_insert_rowid()`)
    const requestRecord = mapAccessRequestRow(rows[0])
    emitEvent('access_request.created', requestRecord)
    return res.json({
      ok: true,
      request: requestRecord
    })
  } catch (err: any) {
    console.error('Access request creation error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to create access request' })
  }
})

router.get('/', async (req, res) => {
  const citizenWallet =
    typeof req.query.citizenWallet === 'string' ? normalizeAddress(req.query.citizenWallet) : null
  const verifierWallet =
    typeof req.query.verifierWallet === 'string' ? normalizeAddress(req.query.verifierWallet) : null
  const status = typeof req.query.status === 'string' ? req.query.status : null

  if (!citizenWallet && !verifierWallet) {
    return res.status(400).json({ ok: false, error: 'citizenWallet or verifierWallet required' })
  }

  try {
    const db = await getDbConnection()
    const clauses: string[] = []
    const params: any[] = []

    if (citizenWallet) {
      clauses.push('citizen_wallet = ?')
      params.push(citizenWallet)
    }

    if (verifierWallet) {
      clauses.push('verifier_wallet = ?')
      params.push(verifierWallet)
    }

    if (status) {
      clauses.push('status = ?')
      params.push(status)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = await db.query(
      `SELECT * FROM access_requests ${where} ORDER BY created_at DESC`,
      params
    )

    return res.json({
      ok: true,
      items: rows.map(mapAccessRequestRow)
    })
  } catch (err: any) {
    console.error('Access request list error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to list access requests' })
  }
})

router.post('/:id/respond', async (req, res) => {
  const { id } = req.params
  const { responsePayload, status } = req.body ?? {}

  if (!responsePayload) {
    return res.status(400).json({ ok: false, error: 'responsePayload required' })
  }

  const nextStatus = typeof status === 'string' ? status : 'responded'
  const now = Date.now()

  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM access_requests WHERE id = ?`, [id])
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'access request not found' })
    }

    const notesObj = notesToObject(rows[0].notes)
    notesObj.response = {
      submittedAt: now
    }
    const timeline = Array.isArray(notesObj.timeline) ? notesObj.timeline : []
    timeline.push({ state: nextStatus, at: now })
    notesObj.timeline = timeline

    await db.query(
      `UPDATE access_requests
       SET response_payload = ?, status = ?, responded_at = ?, updated_at = ?, notes = ?
       WHERE id = ?`,
      [toNullishJSON(responsePayload), nextStatus, now, now, serializeNotes(notesObj), id]
    )

    const updated = await db.query(`SELECT * FROM access_requests WHERE id = ?`, [id])
    const requestRecord = mapAccessRequestRow(updated[0])
    emitEvent('access_request.updated', requestRecord)
    return res.json({
      ok: true,
      request: requestRecord
    })
  } catch (err: any) {
    console.error('Access request response error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to record response' })
  }
})

router.post('/:id/challenge', async (req, res) => {
  const { id } = req.params
  const { notes } = req.body ?? {}
  const now = Date.now()

  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM access_requests WHERE id = ?`, [id])
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'access request not found' })
    }

    const notesObj = notesToObject(rows[0].notes)
    notesObj.challenge = {
      message: notes ?? null,
      issuedAt: now
    }
    const timeline = Array.isArray(notesObj.timeline) ? notesObj.timeline : []
    timeline.push({ state: 'challenge_sent', at: now })
    notesObj.timeline = timeline

    await db.query(
      `UPDATE access_requests
       SET status = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      ['challenge_sent', serializeNotes(notesObj), now, id]
    )

    const updated = await db.query(`SELECT * FROM access_requests WHERE id = ?`, [id])
    const requestRecord = mapAccessRequestRow(updated[0])
    emitEvent('access_request.updated', requestRecord)
    return res.json({ ok: true, request: requestRecord })
  } catch (err: any) {
    console.error('Access challenge error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to send challenge' })
  }
})

router.post('/:id/evaluate', async (req, res) => {
  const { id } = req.params
  const { result, reason } = req.body ?? {}

  const normalizedResult =
    typeof result === 'string'
      ? result === 'granted'
        ? 'granted'
        : result === 'denied'
        ? 'denied'
        : null
      : null

  if (typeof result === 'string' && !normalizedResult) {
    return res.status(400).json({ ok: false, error: 'result must be granted or denied' })
  }

  const now = Date.now()

  try {
    const db = await getDbConnection()
    const rows = await db.query(`SELECT * FROM access_requests WHERE id = ?`, [id])
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'access request not found' })
    }

    const requestRow = rows[0]
    const notesObj = notesToObject(requestRow.notes)

    let condition: any = requestRow.condition
    if (typeof condition === 'string') {
      try {
        condition = JSON.parse(condition)
      } catch {
        // keep as raw string
      }
    }

    const responsePayload = parseJSONField<any>(requestRow.response_payload, null)

    if (!responsePayload) {
      return res.status(400).json({ ok: false, error: 'No citizen response available' })
    }

    let vcJwt: string | null = responsePayload.vcJwt ?? null

    if (!vcJwt && responsePayload.credentialId) {
      const credentialRows = await db.query(
        `SELECT vc_jwt FROM credentials WHERE id = ?`,
        [responsePayload.credentialId]
      )
      if (credentialRows.length) {
        vcJwt = credentialRows[0].vc_jwt
      }
    }

    if (!vcJwt) {
      return res.status(400).json({ ok: false, error: 'No verifiable credential supplied in response' })
    }

    const agent = await getAgent()
    const verification = await agent.verifyCredential({ credential: vcJwt })
    if (!verification?.verified) {
      notesObj.evaluation = {
        status: 'denied',
        reason: 'Credential verification failed',
        evaluatedAt: now
      }
      const timeline = Array.isArray(notesObj.timeline) ? notesObj.timeline : []
      timeline.push({ state: 'denied', at: now })
      notesObj.timeline = timeline

      await db.query(
        `UPDATE access_requests
         SET status = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        ['denied', serializeNotes(notesObj), now, id]
      )

      const updated = await db.query(`SELECT * FROM access_requests WHERE id = ?`, [id])
      return res.json({ ok: true, request: mapAccessRequestRow(updated[0]) })
    }

    const decoded = await agent.decodeJWT({ jwt: vcJwt })
    const credentialSubject =
      decoded?.payload?.vc?.credentialSubject ?? decoded?.payload?.credentialSubject ?? {}

    const evaluation = evaluateExpression(
      credentialSubject,
      condition,
      requestRow.claim ?? null
    )

    const evaluationStatus = normalizedResult ?? (evaluation.pass ? 'granted' : 'denied')
    const finalReason = reason ?? evaluation.reason

    notesObj.evaluation = {
      status: evaluationStatus,
      reason: finalReason,
      evaluatedAt: now,
      claimValues: evaluation.values,
      condition: describeCondition(condition)
    }
    const timeline = Array.isArray(notesObj.timeline) ? notesObj.timeline : []
    timeline.push({ state: evaluationStatus, at: now })
    notesObj.timeline = timeline

    await db.query(
      `UPDATE access_requests
       SET status = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [evaluationStatus, serializeNotes(notesObj), now, id]
    )

    const updated = await db.query(`SELECT * FROM access_requests WHERE id = ?`, [id])
    const requestRecord = mapAccessRequestRow(updated[0])
    emitEvent('access_request.updated', requestRecord)
    return res.json({ ok: true, request: requestRecord })
  } catch (err: any) {
    console.error('Access evaluation error:', err)
    return res.status(500).json({ ok: false, error: err?.message ?? 'failed to update access status' })
  }
})

export default router

