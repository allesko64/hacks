import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, API_BASE } from '../lib/api'
import { ConnectWalletCard } from '../components/ConnectWalletCard'
import type { WalletSession } from '../hooks/useWalletSession'
import type { AccessNotes, AccessRequestRecord } from '../types/records'

interface VerifierDashboardProps {
  auth: WalletSession
}

type ChallengeMap = Record<number, string>
type ReasonMap = Record<number, string>

interface ResponsePayloadMeta {
  credentialId?: number
  credentialType?: string
  vcJwt?: string
  [key: string]: unknown
}

const conditionPreview = (request: AccessRequestRecord) =>
  JSON.stringify(request.condition ?? {}, null, 2)

const getNotesObject = (notes: AccessRequestRecord['notes']): AccessNotes | null =>
  notes && typeof notes === 'object' ? (notes as AccessNotes) : null

type BannerState = { variant: 'info' | 'success' | 'error'; text: string } | null

export function VerifierDashboard({ auth }: VerifierDashboardProps) {
  const [requests, setRequests] = useState<AccessRequestRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [challengeNotes, setChallengeNotes] = useState<ChallengeMap>({})
  const [evaluationNotes, setEvaluationNotes] = useState<ReasonMap>({})
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [statusBanner, setStatusBanner] = useState<BannerState>(null)

  const verifierWallet = auth.account ? auth.account.toLowerCase() : null

  useEffect(() => {
    if (!statusBanner && requests.length) {
      setStatusBanner({
        variant: 'info',
        text: 'Select a pending access lock to send a challenge.'
      })
    }
  }, [requests, statusBanner])

  const upsertRequest = useCallback((next: AccessRequestRecord) => {
    setRequests((prev) => {
      const index = prev.findIndex((item) => item.id === next.id)
      if (index === -1) {
        return [next, ...prev]
      }
      const updated = [...prev]
      updated[index] = next
      return updated
    })
  }, [])

  const refreshRequests = useCallback(async () => {
    if (!verifierWallet) return
    setLoading(true)
    setError(null)
    try {
      const response = await api.listAccessRequests({ verifierWallet })
      setRequests(response.items ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [verifierWallet])

  useEffect(() => {
    if (!verifierWallet) return
    refreshRequests()
    const intervalId = window.setInterval(() => {
      void refreshRequests()
    }, 15000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [verifierWallet, refreshRequests])

  useEffect(() => {
    if (!verifierWallet) return
    const source = new EventSource(`${API_BASE}/events`)

    const handleAccessEvent: EventListener = (event) => {
      const message = event as MessageEvent<string>
      if (!message.data) return
      try {
        const parsed = JSON.parse(message.data) as {
          payload?: AccessRequestRecord
          message?: string
        }
        const record = parsed?.payload
        const normalized = record?.verifierWallet ? record.verifierWallet.toLowerCase() : null
        if (!record || normalized !== verifierWallet) return
        upsertRequest({ ...record, verifierWallet: normalized })
        if (parsed?.message) {
          setStatusBanner({ variant: 'info', text: parsed.message })
        }
      } catch {
        // ignore malformed payloads
      }
    }

    const handleReset: EventListener = () => {
      setRequests([])
      void refreshRequests()
    }

    const handleSeeded: EventListener = (event) => {
      const message = event as MessageEvent<string>
      if (!message.data) {
        void refreshRequests()
        return
      }
      try {
        const parsed = JSON.parse(message.data) as {
          payload?: { wallet?: string; accessRequest?: AccessRequestRecord }
          message?: string
        }
        if (parsed?.payload?.wallet && parsed.payload.wallet.toLowerCase() !== verifierWallet) {
          return
        }
        if (parsed?.message) {
          setStatusBanner({ variant: 'info', text: parsed.message })
        }
        if (parsed?.payload?.accessRequest) {
          const seeded = parsed.payload.accessRequest
          upsertRequest({
            ...seeded,
            verifierWallet: seeded.verifierWallet.toLowerCase()
          })
          setStatusBanner({
            variant: 'info',
            text: 'Demo access request seeded. Ready to evaluate.'
          })
        }
      } catch {
        // ignore parsing errors
      }
      void refreshRequests()
    }

    const handleError: EventListener = () => {
      // EventSource retries automatically; suppress console noise.
    }

    source.addEventListener('access_request.created', handleAccessEvent)
    source.addEventListener('access_request.updated', handleAccessEvent)
    source.addEventListener('system.reset', handleReset)
    source.addEventListener('system.seeded', handleSeeded)
    source.addEventListener('error', handleError)

    return () => {
      source.removeEventListener('access_request.created', handleAccessEvent)
      source.removeEventListener('access_request.updated', handleAccessEvent)
      source.removeEventListener('system.reset', handleReset)
      source.removeEventListener('system.seeded', handleSeeded)
      source.removeEventListener('error', handleError)
      source.close()
    }
  }, [verifierWallet, upsertRequest, refreshRequests])

  const requestedLocks = useMemo(
    () => requests.filter((request) => request.status === 'requested'),
    [requests]
  )

  const awaitingProof = useMemo(
    () => requests.filter((request) => request.status === 'challenge_sent'),
    [requests]
  )

  const awaitingEvaluation = useMemo(
    () => requests.filter((request) => request.status === 'responded'),
    [requests]
  )

  const completed = useMemo(
    () => requests.filter((request) => ['granted', 'denied'].includes(request.status)),
    [requests]
  )

  const handleSendChallenge = async (request: AccessRequestRecord) => {
    const notes = getNotesObject(request.notes)
    const policy = notes?.policy
    const defaultMessage =
      challengeNotes[request.id]?.trim() ||
      policy?.description ||
      `Please provide proof for "${policy?.label ?? request.claim}".`
    setProcessingId(request.id)
    setError(null)
    try {
      await api.challengeAccess(request.id, { notes: defaultMessage })
      await refreshRequests()
      setChallengeNotes((prev) => ({ ...prev, [request.id]: '' }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleEvaluate = async (
    request: AccessRequestRecord,
    result?: 'granted' | 'denied'
  ) => {
    const reason = evaluationNotes[request.id]?.trim() || undefined
    setProcessingId(request.id)
    setError(null)
    try {
      await api.evaluateAccess(request.id, {
        result,
        reason
      })
      await refreshRequests()
      setEvaluationNotes((prev) => ({ ...prev, [request.id]: '' }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcessingId(null)
    }
  }

  if (!verifierWallet) {
    return <ConnectWalletCard auth={auth} />
  }

  return (
    <div className="verifier-dashboard">
      <header className="portal-header">
        <span className="role-chip role-chip--verifier">Verifier Portal</span>
        <h1>Challenge & Verify</h1>
        <p>
          Review citizen access requests, send targeted challenges, and let Veramo validate proofs
          automatically.
        </p>
      </header>

      {statusBanner && (
        <div className={`citizen-banner ${statusBanner.variant}`}>
          {statusBanner.text}
        </div>
      )}

      {error && <div className="citizen-banner error">{error}</div>}

      <section className="verifier-section">
        <header>
          <h2>Incoming access locks</h2>
          <span className="badge">{requestedLocks.length}</span>
        </header>
        {requestedLocks.length === 0 ? (
          <p>No pending locks requesting verification.</p>
        ) : (
          <div className="verifier-grid">
            {requestedLocks.map((request) => {
              const notes = getNotesObject(request.notes)
              const policy = notes?.policy
              const label = policy?.label ?? `Claim: ${request.claim}`
              const description = policy?.description
              return (
                <article key={request.id} className="verifier-card">
                  <div className="verifier-card__header">
                    <strong>{label}</strong>
                    <code>{request.citizenWallet}</code>
                  </div>
                  {description && <p className="challenge-note">{description}</p>}
                  <details>
                    <summary>Condition</summary>
                    <pre className="citizen-code">{conditionPreview(request)}</pre>
                  </details>
                  <label className="challenge-select">
                    Challenge message
                    <textarea
                      rows={2}
                      placeholder={
                        policy?.description || 'Explain what proof you need from the citizen'
                      }
                      value={challengeNotes[request.id] ?? ''}
                      onChange={(event) =>
                        setChallengeNotes((prev) => ({
                          ...prev,
                          [request.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                  <button
                    className="btn-primary"
                    onClick={() => handleSendChallenge(request)}
                    disabled={processingId === request.id}
                  >
                    {processingId === request.id ? 'Sending…' : 'Send challenge'}
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="verifier-section">
        <header>
          <h2>Waiting on citizen proof</h2>
          <span className="badge">{awaitingProof.length}</span>
        </header>
        {awaitingProof.length === 0 ? (
          <p>No outstanding challenges. Citizens will appear here once you send a request.</p>
        ) : (
          <div className="verifier-grid">
            {awaitingProof.map((request) => {
              const notes = getNotesObject(request.notes)
              const policy = notes?.policy
              const label = policy?.label ?? `Claim: ${request.claim}`
              return (
                <article key={request.id} className="verifier-card">
                  <div className="verifier-card__header">
                    <strong>{label}</strong>
                    <span className="status status-challenge_sent">waiting</span>
                  </div>
                  {policy?.description && (
                    <p className="challenge-note">{policy.description}</p>
                  )}
                  <p className="challenge-note">
                    {notes?.challenge?.message ??
                      'You have sent a challenge. Waiting for citizen response…'}
                  </p>
                  <small>
                    Citizen: <code>{request.citizenWallet}</code>
                  </small>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="verifier-section">
        <header>
          <h2>Proofs awaiting evaluation</h2>
          <span className="badge">{awaitingEvaluation.length}</span>
        </header>
        {awaitingEvaluation.length === 0 ? (
          <p>No proofs to evaluate right now.</p>
        ) : (
          <div className="verifier-grid">
            {awaitingEvaluation.map((request) => {
              const notes = getNotesObject(request.notes)
              const policy = notes?.policy
              const label = policy?.label ?? `Claim: ${request.claim}`
              const description = policy?.description
              const responsePayload: ResponsePayloadMeta | null =
                request.responsePayload && typeof request.responsePayload === 'object'
                  ? (request.responsePayload as ResponsePayloadMeta)
                  : null
              return (
                <article key={request.id} className="verifier-card">
                  <div className="verifier-card__header">
                    <strong>{label}</strong>
                    <span className="status status-responded">proof received</span>
                  </div>
                  {description && (
                    <p className="challenge-note">{description}</p>
                  )}
                  <details>
                    <summary>Condition</summary>
                    <pre className="citizen-code">{conditionPreview(request)}</pre>
                  </details>
                  {typeof responsePayload?.credentialId === 'number' && (
                    <p className="challenge-note">
                      Credential #{responsePayload.credentialId} provided (
                      {responsePayload.credentialType ?? 'VerifiableCredential'})
                    </p>
                  )}
                  {notes?.response && (
                    <p className="challenge-note">
                      Response submitted at{' '}
                      {new Date(notes.response.submittedAt).toLocaleString()}
                    </p>
                  )}
                  {notes?.evaluation?.claimValues && (
                    <details>
                      <summary>Claim values</summary>
                      <pre className="citizen-code">
                        {JSON.stringify(notes.evaluation.claimValues, null, 2)}
                      </pre>
                    </details>
                  )}
                  <label className="challenge-select">
                    Evaluation note (optional)
                    <textarea
                      rows={2}
                      placeholder="Include any manual reasoning"
                      value={evaluationNotes[request.id] ?? ''}
                      onChange={(event) =>
                        setEvaluationNotes((prev) => ({
                          ...prev,
                          [request.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                  <div className="challenge-actions">
                    <button
                      className="btn-primary"
                      onClick={() => handleEvaluate(request)}
                      disabled={processingId === request.id}
                    >
                      {processingId === request.id ? 'Evaluating…' : 'Auto-evaluate'}
                    </button>
                    <button
                      className="btn-outline strong"
                      onClick={() => handleEvaluate(request, 'granted')}
                      disabled={processingId === request.id}
                    >
                      Grant manually
                    </button>
                    <button
                      className="btn-outline danger"
                      onClick={() => handleEvaluate(request, 'denied')}
                      disabled={processingId === request.id}
                    >
                      Deny manually
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="verifier-section">
        <header>
          <h2>Audit log</h2>
          <span className="badge">{completed.length}</span>
        </header>
        {completed.length === 0 ? (
          <p>No completed decisions yet.</p>
        ) : (
          <div className="verifier-grid">
            {completed.map((request) => {
              const notes = getNotesObject(request.notes)
              const policy = notes?.policy
              const label = policy?.label ?? `Claim: ${request.claim}`
              const description = policy?.description
              return (
                <article key={request.id} className="verifier-card">
                  <div className="verifier-card__header">
                    <strong>{label}</strong>
                    <span className={`status status-${request.status}`}>{request.status}</span>
                  </div>
                  {description && (
                    <p className="challenge-note">{description}</p>
                  )}
                  <p className="challenge-note">
                    {notes?.evaluation?.reason ?? 'No evaluation notes recorded.'}
                  </p>
                  {notes?.evaluation?.claimValues && (
                    <details>
                      <summary>Verified values</summary>
                      <pre className="citizen-code">
                        {JSON.stringify(notes.evaluation.claimValues, null, 2)}
                      </pre>
                    </details>
                  )}
                  <small>
                    Citizen: <code>{request.citizenWallet}</code>
                  </small>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <div className="verifier-footer">
        <button className="btn-outline" onClick={refreshRequests} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </div>
    </div>
  )
}


