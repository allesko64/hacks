import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WalletSession } from '../hooks/useWalletSession'
import { api } from '../lib/api'
import type { CredentialRequestRecord } from '../types/records'

interface IssuerDashboardProps {
  auth: WalletSession
}

type BannerState = { variant: 'info' | 'success' | 'error'; text: string } | null

const truncate = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

const parseRequestNotes = (
  notes: CredentialRequestRecord['notes']
): Record<string, unknown> | null => {
  if (!notes) return null
  if (typeof notes === 'object') return notes as Record<string, unknown>
  try {
    return JSON.parse(notes) as Record<string, unknown>
  } catch {
    return { text: notes }
  }
}

export function IssuerDashboard({ auth }: IssuerDashboardProps) {
  const issuerWallet = auth.account ? auth.account.toLowerCase() : null
  const [requests, setRequests] = useState<CredentialRequestRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [banner, setBanner] = useState<BannerState>(null)

  const fetchRequests = useCallback(async () => {
    if (!issuerWallet) return
    setLoading(true)
    setError(null)
    try {
      const response = await api.listCredentialRequests()
      const items = response.items ?? []
      const relevant = items.filter((item) => {
        if (!item.issuerWallet) return true
        return item.issuerWallet?.toLowerCase() === issuerWallet
      })
      setRequests(relevant)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [issuerWallet])

  useEffect(() => {
    if (!issuerWallet) return
    fetchRequests()
    const intervalId = window.setInterval(() => {
      void fetchRequests()
    }, 15000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [issuerWallet, fetchRequests])

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests]
  )

  const completedRequests = useMemo(
    () => requests.filter((request) => request.status !== 'pending'),
    [requests]
  )

  const handleUpdateStatus = useCallback(
    async (request: CredentialRequestRecord, status: 'approved' | 'rejected') => {
      if (!issuerWallet) return
      setProcessingId(request.id)
      setError(null)
      setBanner(null)
      try {
        await api.updateCredentialRequestStatus(request.id, {
          status,
          issuerWallet
        })
        setBanner({
          variant: status === 'approved' ? 'success' : 'info',
          text: status === 'approved'
            ? 'Credential request approved.'
            : 'Credential request rejected.'
        })
        await fetchRequests()
      } catch (err: any) {
        setError(err.message)
      } finally {
        setProcessingId(null)
      }
    },
    [issuerWallet, fetchRequests]
  )

  const handleViewSnapshot = useCallback(async (walletAddress: string) => {
    try {
      const documents = await api.listDocuments(walletAddress)
      const snapshot = documents.items?.find((doc) => doc.type === 'profile_snapshot')
      if (snapshot?.storageUri) {
        window.open(snapshot.storageUri, '_blank', 'noopener')
      } else {
        setBanner({
          variant: 'error',
          text: 'No saved profile snapshot found for this citizen.'
        })
      }
    } catch (err: any) {
      setBanner({
        variant: 'error',
        text: err?.message ?? 'Failed to load citizen documents.'
      })
    }
  }, [])

  if (!issuerWallet) {
    return (
      <div className="issuer-dashboard">
        <header className="portal-header">
          <span className="role-chip role-chip--issuer">Issuer Portal</span>
          <h1>Credential Issuance</h1>
        </header>
        <p className="issuer-placeholder">
          Configure the verifier wallet on the landing page to auto-connect the issuer portal.
        </p>
      </div>
    )
  }

  return (
    <div className="issuer-dashboard">
      <header className="portal-header">
        <span className="role-chip role-chip--issuer">Issuer Portal</span>
        <h1>Credential Issuance</h1>
        <p>
          Review pending credential requests, inspect citizen proof, and record your decision. Use
          the verifier portal to challenge selective disclosure when needed.
        </p>
      </header>

      {banner && <div className={`citizen-banner ${banner.variant}`}>{banner.text}</div>}
      {error && <div className="citizen-banner error">{error}</div>}

      <section className="issuer-section">
        <header className="issuer-section__header">
          <h2>Pending credential requests</h2>
          <span className="badge">{pendingRequests.length}</span>
        </header>
        {loading && requests.length === 0 ? (
          <p>Loading requests…</p>
        ) : pendingRequests.length === 0 ? (
          <p>No pending credential requests. Encourage the citizen to request one from their portal.</p>
        ) : (
          <div className="issuer-grid">
        {pendingRequests.map((request) => {
              const requestedClaims = request.requestedClaims.join(', ') || 'Profile snapshot'
              const submittedAt = request.createdAt
                ? new Date(request.createdAt).toLocaleString()
                : 'Unknown'
              const parsedNotes = parseRequestNotes(request.notes)
              const noteText =
                typeof request.notes === 'string'
                  ? request.notes
                  : (parsedNotes?.description as string | undefined)
              return (
                <article key={request.id} className="issuer-card">
                  <div className="issuer-card__header">
                    <strong>{requestedClaims}</strong>
                    <code>{truncate(request.walletAddress)}</code>
                  </div>
                  <p className="issuer-card__meta">
                    Submitted {submittedAt}
                    {noteText ? ` · ${noteText}` : ''}
                  </p>
                  <div className="issuer-card__actions">
                    <button
                      className="btn-secondary"
                      onClick={() => void handleViewSnapshot(request.walletAddress)}
                      disabled={processingId === request.id}
                    >
                      View snapshot
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => void handleUpdateStatus(request, 'approved')}
                      disabled={processingId === request.id}
                    >
                      {processingId === request.id ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      className="btn-outline danger"
                      onClick={() => void handleUpdateStatus(request, 'rejected')}
                      disabled={processingId === request.id}
                    >
                      {processingId === request.id ? 'Processing…' : 'Reject'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="issuer-section">
        <header className="issuer-section__header">
          <h2>Completed decisions</h2>
          <span className="badge">{completedRequests.length}</span>
        </header>
        {completedRequests.length === 0 ? (
          <p>No completed credential decisions yet.</p>
        ) : (
          <div className="issuer-grid">
            {completedRequests.map((request) => {
              const requestedClaims = request.requestedClaims.join(', ') || 'Profile snapshot'
              const decidedAt = request.updatedAt
                ? new Date(request.updatedAt).toLocaleString()
                : 'Unknown'
              const parsedNotes = parseRequestNotes(request.notes)
              const reason =
                (parsedNotes?.reason as string | undefined) ??
                (typeof request.notes === 'string' ? request.notes : undefined)
              return (
                <article key={request.id} className="issuer-card issuer-card--completed">
                  <div className="issuer-card__header">
                    <strong>{requestedClaims}</strong>
                    <span className={`status status-${request.status}`}>{request.status}</span>
                  </div>
                  <p className="issuer-card__meta">
                    Citizen: <code>{truncate(request.walletAddress)}</code> · Decided {decidedAt}
                  </p>
                  {reason && <p className="issuer-card__note">{reason}</p>}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

