import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../lib/api'
import type { CitizenProfile } from '../types/citizen'
import type { UseMetamaskAuth } from '../hooks/useMetamaskAuth'
import type { CredentialRecord, DocumentRecord } from '../types/records'

const CLAIM_OPTIONS = [
  { id: 'age', label: 'Age ≥ 18' },
  { id: 'name', label: 'Full Name' },
  { id: 'vaccination', label: 'COVID-19 Vaccination' }
] as const

const SAMPLE_CLAIM_DATA: Record<string, any> = {
  age: { age: 22, proof: 'government_id' },
  name: { name: 'Aarav Verma' },
  vaccination: { vaccination: 'COVID-19 Booster 2024' }
}

interface CitizenDashboardProps {
  auth: UseMetamaskAuth
}

export function CitizenDashboard({ auth }: CitizenDashboardProps) {
  const { account, did, profile, refreshProfile } = auth
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [credentials, setCredentials] = useState<CredentialRecord[]>([])
  const [selectedClaims, setSelectedClaims] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    if (!account) return
    const wallet = account

    async function bootstrap() {
      try {
        const [docsRes, credsRes] = await Promise.all([
          api.listDocuments(wallet),
          api.listCredentials(wallet)
        ])
        setDocuments(docsRes.items ?? [])
        setCredentials(credsRes.items ?? [])
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message })
      }
    }

    bootstrap()
  }, [account])

  const pendingDocuments = useMemo(
    () =>
      documents.filter((doc) => doc.status === 'uploaded' || doc.status === 'under_review'),
    [documents]
  )

  const verifiedDocuments = useMemo(
    () => documents.filter((doc) => doc.status === 'verified'),
    [documents]
  )

  const latestCredential = credentials[0]

  if (!account) {
    return null
  }

  const citizenProfile: CitizenProfile | null =
    profile ?? {
      walletAddress: account,
      did,
      displayName: null,
      email: null,
      role: null,
      createdAt: null,
      updatedAt: null,
      lastLoginAt: null,
      roles: [],
      documentSummary: [],
      credentialSummary: []
    }

  function toggleClaim(id: string) {
    setSelectedClaims((current) =>
      current.includes(id) ? current.filter((claim) => claim !== id) : [...current, id]
    )
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account) return
    const wallet = account

    const form = new FormData(event.currentTarget)
    const type = form.get('type')?.toString()
    const storageUri = form.get('storageUri')?.toString()

    if (!type || !storageUri) {
      setMessage({ type: 'error', text: 'Document type and storage URI are required.' })
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const payload = {
        walletAddress: wallet,
        type,
        storageUri,
        ipfsCid: form.get('ipfsCid')?.toString() || null,
        metadata: {
          filename: form.get('filename')?.toString() || undefined,
          description: form.get('description')?.toString() || undefined
        }
      }

      const response = await api.uploadDocument(payload)
      setDocuments((prev) => [response.document as DocumentRecord, ...prev])

      setMessage({ type: 'success', text: 'Document uploaded successfully.' })
      event.currentTarget.reset()
      await refreshProfile()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCredentialRequest() {
    if (!account || !selectedClaims.length) return
    const wallet = account

    setSubmitting(true)
    setMessage(null)

    try {
      await api.requestCredential({
        walletAddress: wallet,
        requestedClaims: selectedClaims,
        notes: 'Citizen dashboard request'
      })

      setMessage({
        type: 'success',
        text: 'Credential request sent to issuer.'
      })
      setSelectedClaims([])
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="citizen-dashboard">
      <header className="citizen-header">
        <div>
          <h1>Citizen Dashboard</h1>
          <p className="citizen-subtitle">Manage your identity artifacts and verification requests.</p>
        </div>
        <div className="citizen-id-panel">
          <div>
            <span>Wallet</span>
            <code>{account}</code>
          </div>
          <div>
            <span>DID</span>
            <code>{citizenProfile.did ?? `did:ethr:${account}`}</code>
          </div>
        </div>
      </header>

      {message && (
        <div className={`citizen-banner ${message.type === 'error' ? 'error' : 'success'}`}>
          {message.text}
        </div>
      )}

      <div className="citizen-grid">
        <div className="citizen-column">
          <section className="citizen-card">
            <h2>Upload supporting document</h2>
            <p className="citizen-card__hint">
              Store your documents on IPFS or any secure storage, then paste the URI here. Issuers will review and verify
              them before issuing credentials.
            </p>

            <form className="citizen-form" onSubmit={handleUpload}>
              <label>
                Document type
                <select name="type" defaultValue="" required>
                  <option value="" disabled>
                    Select type…
                  </option>
                  <option value="passport">Passport</option>
                  <option value="drivers_license">Driver&apos;s Licence</option>
                  <option value="vaccination">Vaccination Certificate</option>
                  <option value="utility_bill">Utility Bill</option>
                </select>
              </label>

              <label>
                Storage URI
                <input name="storageUri" placeholder="https://files.example.com/passport.pdf" required />
              </label>

              <label>
                IPFS CID (optional)
                <input name="ipfsCid" placeholder="bafy..." />
              </label>

              <label>
                File name (optional)
                <input name="filename" placeholder="passport.pdf" />
              </label>

              <label>
                Description (optional)
                <textarea name="description" rows={2} placeholder="Uploaded for proof of residence" />
              </label>

              <button type="submit" disabled={submitting}>
                {submitting ? 'Uploading…' : 'Upload Document'}
              </button>
            </form>
          </section>

          <section className="citizen-card">
            <h2>Request credential</h2>
            <p className="citizen-card__hint">Select the claims you want to prove. Issuer will respond with a VC.</p>

            <div className="claim-grid">
              {CLAIM_OPTIONS.map((claim) => (
                <label
                  key={claim.id}
                  className={`claim-item ${selectedClaims.includes(claim.id) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedClaims.includes(claim.id)}
                    onChange={() => toggleClaim(claim.id)}
                  />
                  <span>{claim.label}</span>
                </label>
              ))}
            </div>

            <button onClick={handleCredentialRequest} disabled={submitting || !selectedClaims.length}>
              {submitting ? 'Submitting…' : 'Request Credential'}
            </button>

            <details className="citizen-card__details">
              <summary>Requested claim template preview</summary>
              <pre className="citizen-code">
{JSON.stringify(
  selectedClaims.reduce<Record<string, unknown>>(
    (acc, id) => ({ ...acc, ...SAMPLE_CLAIM_DATA[id] }),
    {}
  ),
  null,
  2
)}
              </pre>
            </details>
          </section>
        </div>

        <div className="citizen-column">
          <section className="citizen-card">
            <header className="citizen-card__header">
              <h2>Documents awaiting verification</h2>
              <span className="badge">{pendingDocuments.length}</span>
            </header>
            {pendingDocuments.length ? (
              <ul className="document-list">
                {pendingDocuments.map((doc) => (
                  <li key={doc.id}>
                    <div>
                      <strong>{doc.type}</strong>
                      <span className={`status status-${doc.status}`}>{doc.status.replace('_', ' ')}</span>
                    </div>
                    <a href={doc.storageUri} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No documents pending review.</p>
            )}
          </section>

          <section className="citizen-card">
            <header className="citizen-card__header">
              <h2>Verified documents</h2>
              <span className="badge">{verifiedDocuments.length}</span>
            </header>
            {verifiedDocuments.length ? (
              <ul className="document-list">
                {verifiedDocuments.map((doc) => (
                  <li key={doc.id}>
                    <div>
                      <strong>{doc.type}</strong>
                      {doc.reviewedAt && (
                        <span className="timestamp">
                          Verified {new Date(doc.reviewedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <a href={doc.storageUri} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>You haven’t verified any documents yet.</p>
            )}
          </section>

          <section className="citizen-card">
            <header className="citizen-card__header">
              <h2>Latest credential</h2>
              <span className="badge">{credentials.length}</span>
            </header>
            {latestCredential ? (
              <div className="credential-card">
                <div className="credential-metadata">
                  <div>
                    <span>Type</span>
                    <strong>{latestCredential.type ?? 'VerifiableCredential'}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{latestCredential.verificationStatus ?? 'issued'}</strong>
                  </div>
                  {latestCredential.anchoredTxHash && (
                    <div>
                      <span>Anchored Tx</span>
                      <code>{latestCredential.anchoredTxHash}</code>
                    </div>
                  )}
                </div>
                <textarea readOnly value={latestCredential.vcJwt} rows={8} />
              </div>
            ) : (
              <p>No credentials issued yet. Upload documents and request one to get started.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

