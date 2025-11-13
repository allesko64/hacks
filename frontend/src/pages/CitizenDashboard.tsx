import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../lib/api'
import { ACCESS_POLICIES, type AccessPolicy } from '../config/accessPolicies'
import type { CitizenProfile } from '../types/citizen'
import type { WalletSession } from '../hooks/useWalletSession'
import type {
  CredentialRecord,
  DocumentRecord,
  AccessRequestRecord,
  AccessNotes
} from '../types/records'

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

const NATIONALITY_OPTIONS = [
  { value: 'indian', label: 'Indian' },
  { value: 'foreign', label: 'Foreign' }
] as const

const VACCINATION_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' }
] as const

const COLLEGE_STATUS_OPTIONS = [
  { value: 'enrolled', label: 'Currently enrolled' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'not_enrolled', label: 'Not enrolled' }
] as const

type NationalityOption = (typeof NATIONALITY_OPTIONS)[number]['value']
type VaccinationOption = (typeof VACCINATION_OPTIONS)[number]['value']
type CollegeStatusOption = (typeof COLLEGE_STATUS_OPTIONS)[number]['value']

const NATIONALITY_SET = new Set<NationalityOption>(NATIONALITY_OPTIONS.map((option) => option.value))
const VACCINATION_SET = new Set<VaccinationOption>(VACCINATION_OPTIONS.map((option) => option.value))

const formatNationality = (value: string | null | undefined) => {
  if (!value) return 'Not provided'
  const option = NATIONALITY_OPTIONS.find((item) => item.value === value)
  return option ? option.label : value
}

const formatVaccination = (value: string | null | undefined) => {
  if (!value) return 'Not provided'
  const option = VACCINATION_OPTIONS.find((item) => item.value === value)
  return option ? option.label : value
}

const formatCollegeStatus = (value: string | null | undefined) => {
  if (!value) return 'Not provided'
  switch (value) {
    case 'enrolled':
      return 'Currently enrolled'
    case 'graduated':
      return 'Graduated'
    case 'not_enrolled':
      return 'Not enrolled'
    default:
      return value
  }
}

type NationalityChoice = '' | NationalityOption
type VaccinationChoice = '' | VaccinationOption
type CollegeStatusChoice = '' | CollegeStatusOption

type ProfileFormState = {
  fullName: string
  displayName: string
  address: string
  dateOfBirth: string
  nationality: NationalityChoice
  vaccinationStatus: VaccinationChoice
  collegeName: string
  collegeStatus: CollegeStatusChoice
}

interface CitizenDashboardProps {
  auth: WalletSession
}

export function CitizenDashboard({ auth }: CitizenDashboardProps) {
  const { account, did, profile, refreshProfile } = auth
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [credentials, setCredentials] = useState<CredentialRecord[]>([])
  const [selectedClaims, setSelectedClaims] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [accessRequests, setAccessRequests] = useState<AccessRequestRecord[]>([])
  const [responseSelection, setResponseSelection] = useState<Record<number, string>>({})
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    fullName: '',
    displayName: '',
    address: '',
    dateOfBirth: '',
    nationality: '',
    vaccinationStatus: '',
    collegeName: '',
    collegeStatus: ''
  })
  const [profileSaving, setProfileSaving] = useState(false)

  useEffect(() => {
    if (!account) return
    const wallet = account

    async function bootstrap() {
      try {
        const [docsRes, credsRes, accessRes] = await Promise.all([
          api.listDocuments(wallet),
          api.listCredentials(wallet),
          api.listAccessRequests({ citizenWallet: wallet })
        ])
        setDocuments(docsRes.items ?? [])
        setCredentials(credsRes.items ?? [])
        setAccessRequests(accessRes.items ?? [])
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

  const challengeRequests = useMemo(
    () => accessRequests.filter((request) => request.status === 'challenge_sent'),
    [accessRequests]
  )

  const resolveNotes = (request: AccessRequestRecord): AccessNotes | null =>
    request.notes && typeof request.notes === 'object'
      ? (request.notes as AccessNotes)
      : null

  const recentRequests = useMemo(
    () => accessRequests.slice(0, 4),
    [accessRequests]
  )

  const latestCredential = credentials[0]

  if (!account) {
    return null
  }

  const emptyProfile: CitizenProfile = {
    walletAddress: account,
    did,
    displayName: null,
    email: null,
    role: null,
    fullName: null,
    address: null,
    dateOfBirth: null,
    nationality: null,
    vaccinationStatus: null,
    collegeName: null,
    collegeStatus: null,
    createdAt: null,
    updatedAt: null,
    lastLoginAt: null,
    roles: [],
    documentSummary: [],
    credentialSummary: []
  }

  const citizenProfile: CitizenProfile = profile ?? emptyProfile

  useEffect(() => {
    if (!profile) {
      setProfileForm({
        fullName: '',
        displayName: '',
        address: '',
        dateOfBirth: '',
        nationality: '',
        vaccinationStatus: '',
        collegeName: '',
        collegeStatus: ''
      })
      return
    }

    const normalizedNationality = (profile.nationality ?? '').toLowerCase()
    const normalizedVaccination = (profile.vaccinationStatus ?? '').toLowerCase()
    const normalizedCollegeStatus = (profile.collegeStatus ?? '').toLowerCase()
    let formNationality: NationalityChoice = ''
    let formVaccination: VaccinationChoice = ''
    let formCollegeStatus: CollegeStatusChoice = ''

    if (normalizedNationality) {
      const candidate = normalizedNationality as NationalityOption
      if (NATIONALITY_SET.has(candidate)) {
        formNationality = candidate
      }
    }

    if (normalizedVaccination) {
      const candidate = normalizedVaccination as VaccinationOption
      if (VACCINATION_SET.has(candidate)) {
        formVaccination = candidate
      }
    }

    if (normalizedCollegeStatus) {
      const candidate = normalizedCollegeStatus as CollegeStatusOption
      if (COLLEGE_STATUS_OPTIONS.find((option) => option.value === candidate)) {
        formCollegeStatus = candidate
      }
    }

    setProfileForm({
      fullName: profile.fullName ?? '',
      displayName: profile.displayName ?? '',
      address: profile.address ?? '',
      dateOfBirth: profile.dateOfBirth ?? '',
      nationality: formNationality,
      vaccinationStatus: formVaccination,
      collegeName: profile.collegeName ?? '',
      collegeStatus: formCollegeStatus
    })
  }, [profile])

  const isProfileDirty = useMemo(() => {
    if (!profile) {
      return (
        profileForm.fullName.trim().length > 0 ||
        profileForm.displayName.trim().length > 0 ||
        profileForm.address.trim().length > 0 ||
        profileForm.dateOfBirth.trim().length > 0 ||
        profileForm.nationality.trim().length > 0 ||
        profileForm.vaccinationStatus.trim().length > 0 ||
        profileForm.collegeName.trim().length > 0 ||
        profileForm.collegeStatus.trim().length > 0
      )
    }

    return (
      profileForm.fullName !== (profile.fullName ?? '') ||
      profileForm.displayName !== (profile.displayName ?? '') ||
      profileForm.address !== (profile.address ?? '') ||
      profileForm.dateOfBirth !== (profile.dateOfBirth ?? '') ||
      profileForm.nationality !== (profile.nationality ?? '') ||
      profileForm.vaccinationStatus !== (profile.vaccinationStatus ?? '') ||
      profileForm.collegeName !== (profile.collegeName ?? '') ||
      profileForm.collegeStatus !== (profile.collegeStatus ?? '')
    )
  }, [profileForm, profile])

  function toggleClaim(id: string) {
    setSelectedClaims((current) =>
      current.includes(id) ? current.filter((claim) => claim !== id) : [...current, id]
    )
  }

  function handleProfileFieldChange<K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K]
  ) {
    setProfileForm((prev) => ({
      ...prev,
      [key]: value
    }))
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account || !isProfileDirty) return

    setProfileSaving(true)
    setMessage(null)

    try {
      await api.updateCitizen(account, {
        displayName: profileForm.displayName || null,
        fullName: profileForm.fullName || null,
        address: profileForm.address || null,
        dateOfBirth: profileForm.dateOfBirth || null,
        nationality: profileForm.nationality || null,
        vaccinationStatus: profileForm.vaccinationStatus || null,
        collegeName: profileForm.collegeName || null,
        collegeStatus: profileForm.collegeStatus || null
      })

      await refreshProfile()
      setMessage({ type: 'success', text: 'Profile details updated.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setProfileSaving(false)
    }
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

  async function handleAccessRequest(policy: AccessPolicy) {
    if (!account) return
    setSubmitting(true)
    setMessage(null)
    try {
      const response = await api.requestAccess({
        citizenWallet: account,
        verifierWallet: policy.verifierWallet,
        claim: policy.claim,
        condition: policy.condition,
        policy: {
          id: policy.id,
          label: policy.label,
          description: policy.description
        }
      })
      setAccessRequests((prev) => [response.request, ...prev])
      setMessage({ type: 'success', text: 'Access request sent to verifier.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  function updateResponseSelection(requestId: number, credentialId: string) {
    setResponseSelection((prev) => ({ ...prev, [requestId]: credentialId }))
  }

  async function handleRespondToChallenge(request: AccessRequestRecord) {
    const selectedCredentialId = responseSelection[request.id]
    if (!selectedCredentialId) {
      setMessage({ type: 'error', text: 'Select a credential before responding.' })
      return
    }

    const credential = credentials.find(
      (item) => item.id === Number(selectedCredentialId)
    )

    if (!credential) {
      setMessage({ type: 'error', text: 'Credential not found.' })
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const payload = {
        responsePayload: {
          credentialId: credential.id,
          credentialType: credential.type,
          vcJwt: credential.vcJwt
        },
        status: 'responded'
      }

      const response = await api.respondAccess(request.id, payload)
      setAccessRequests((prev) =>
        prev.map((item) => (item.id === response.request.id ? response.request : item))
      )
      setMessage({ type: 'success', text: 'Response submitted to verifier.' })
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
          <div className="portal-header">
            <span className="role-chip role-chip--citizen">Citizen Portal</span>
            <h1>Identity & Credentials</h1>
          </div>
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
          {citizenProfile.fullName && (
            <div>
              <span>Full name</span>
              <strong>{citizenProfile.fullName}</strong>
            </div>
          )}
          {citizenProfile.dateOfBirth && (
            <div>
              <span>Date of birth</span>
              <strong>
                {new Date(citizenProfile.dateOfBirth).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </strong>
            </div>
          )}
          <div>
            <span>Nationality</span>
            <strong>{formatNationality(citizenProfile.nationality)}</strong>
          </div>
          <div>
            <span>Vaccination status</span>
            <strong>{formatVaccination(citizenProfile.vaccinationStatus)}</strong>
          </div>
          <div>
            <span>College</span>
            <strong>{citizenProfile.collegeName ?? 'Not provided'}</strong>
          </div>
          <div>
            <span>College status</span>
            <strong>{formatCollegeStatus(citizenProfile.collegeStatus)}</strong>
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
            <h2>Personal profile</h2>
            <p className="citizen-card__hint">
              Provide basic information once. Issuers and verifiers will reference these details when
              they evaluate your credentials.
            </p>

            <form className="profile-form" onSubmit={handleProfileSubmit}>
              <div className="profile-grid">
                <label>
                  Full name
                  <input
                    value={profileForm.fullName}
                    onChange={(event) => handleProfileFieldChange('fullName', event.target.value)}
                    placeholder="e.g. Aarav Verma"
                  />
                </label>

                <label>
                  Display name
                  <input
                    value={profileForm.displayName}
                    onChange={(event) =>
                      handleProfileFieldChange('displayName', event.target.value)
                    }
                    placeholder="Public badge name"
                  />
                </label>

                <label>
                  Date of birth
                  <input
                    type="date"
                    value={profileForm.dateOfBirth}
                    onChange={(event) =>
                      handleProfileFieldChange('dateOfBirth', event.target.value)
                    }
                  />
                </label>

                <label>
                  Nationality
                  <select
                    value={profileForm.nationality}
                    onChange={(event) =>
                      handleProfileFieldChange(
                        'nationality',
                        event.target.value as NationalityChoice
                      )
                    }
                  >
                    <option value="">Select nationality…</option>
                    {NATIONALITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  College status
                  <select
                    value={profileForm.collegeStatus}
                    onChange={(event) =>
                      handleProfileFieldChange(
                        'collegeStatus',
                        event.target.value as CollegeStatusChoice
                      )
                    }
                  >
                    <option value="">Select status…</option>
                    {COLLEGE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  College name
                  <input
                    value={profileForm.collegeName}
                    onChange={(event) =>
                      handleProfileFieldChange('collegeName', event.target.value)
                    }
                    placeholder="University or institute"
                  />
                </label>
              </div>

              <label>
                Residential address
                <textarea
                  rows={3}
                  value={profileForm.address}
                  onChange={(event) => handleProfileFieldChange('address', event.target.value)}
                  placeholder="Street, city, region"
                />
              </label>

              <label>
                Vaccination status
                <select
                  value={profileForm.vaccinationStatus}
                  onChange={(event) =>
                    handleProfileFieldChange(
                      'vaccinationStatus',
                      event.target.value as VaccinationChoice
                    )
                  }
                >
                  <option value="">Select status…</option>
                  {VACCINATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="profile-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={profileSaving || !isProfileDirty}
                >
                  {profileSaving ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </form>
          </section>

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
            <h2>Request access</h2>
            <p className="citizen-card__hint">
              Pick a verifier and claim. They will ask for proof before granting access.
            </p>

            <div className="citizen-access-grid">
              {ACCESS_POLICIES.map((policy) => (
                <article key={policy.id} className="access-policy-card">
                  <header>
                    <h3>{policy.label}</h3>
                    <p>{policy.description}</p>
                  </header>
                  <div className="access-policy-meta">
                    <code>{policy.verifierWallet}</code>
                  </div>
                  <button
                    className="btn-outline"
                    disabled={submitting}
                    onClick={() => handleAccessRequest(policy)}
                  >
                    {submitting ? 'Sending…' : 'Request access'}
                  </button>
                </article>
              ))}
            </div>
            <div className="access-history">
              <h3>Recent access requests</h3>
              {recentRequests.length ? (
                <ul>
                  {recentRequests.map((item) => {
                    const notes = resolveNotes(item)
                    const policy = notes?.policy
                    const label = policy?.label ?? `Claim: ${item.claim}`
                    const description = policy?.description
                    const evaluationReason = notes?.evaluation?.reason
                    return (
                      <li key={item.id}>
                        <div>
                          <strong>{label}</strong>
                          <span className={`status status-${item.status.replace(/\s+/g, '_')}`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="access-history__details">
                          <code>{item.verifierWallet}</code>
                          {description && (
                            <span className="access-history__note">{description}</span>
                          )}
                          {evaluationReason && (
                            <span className="access-history__note">
                              Decision: {evaluationReason}
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p>No access requests yet.</p>
              )}
            </div>
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
              <h2>Verifier challenges</h2>
              <span className="badge">{challengeRequests.length}</span>
            </header>

            {challengeRequests.length ? (
              <div className="challenge-list">
                {challengeRequests.map((request) => {
                  const conditionPreview = JSON.stringify(request.condition ?? {}, null, 2)
                  const notes = resolveNotes(request)
                  const policy = notes?.policy
                  const title = policy?.label ?? request.claim
                  const description = policy?.description
                  const challengeNote =
                    notes?.challenge?.message ?? 'The verifier has requested additional proof.'
                  const selectedCredentialId = responseSelection[request.id] ?? ''
                  return (
                    <div key={request.id} className="challenge-item">
                      <div className="challenge-header">
                        <div>
                          <strong>{title}</strong>
                          <code>{request.verifierWallet}</code>
                        </div>
                        <span className="status status-challenge_sent">challenge</span>
                      </div>

                      {description && (
                        <p className="challenge-note">{description}</p>
                      )}

                      {challengeNote && (
                        <p className="challenge-note">{challengeNote}</p>
                      )}

                      <details>
                        <summary>Condition details</summary>
                        <pre className="citizen-code">{conditionPreview}</pre>
                      </details>

                      <label className="challenge-select">
                        Credential to share
                        <select
                          value={selectedCredentialId}
                          onChange={(event) =>
                            updateResponseSelection(request.id, event.target.value)
                          }
                        >
                          <option value="">Select a credential…</option>
                          {credentials.map((credential) => (
                            <option key={credential.id} value={credential.id}>
                              {credential.type ?? 'VerifiableCredential'} (#{credential.id})
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="challenge-actions">
                        <button
                          className="btn-primary"
                          onClick={() => handleRespondToChallenge(request)}
                          disabled={submitting}
                        >
                          {submitting ? 'Sending…' : 'Send proof'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p>No active challenges from verifiers.</p>
            )}
          </section>

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

