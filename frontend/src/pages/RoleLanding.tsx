import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { WalletSession } from '../hooks/useWalletSession'
import { api } from '../lib/api'
import { DEMO_VERIFIER_WALLET } from '../config/accessPolicies'

type PortalRole = 'citizen' | 'issuer' | 'verifier'

interface RoleLandingProps {
  onSelect: (role: PortalRole) => void
  sessions: Record<PortalRole, WalletSession>
  verifierWallet: string | null
  onConfigureVerifierWallet: (wallet: string | null) => void
}

const ROLE_CARDS: Array<{
  role: PortalRole
  title: string
  description: string
  actions: string[]
}> = [
  {
    role: 'citizen',
    title: 'Citizen Portal',
    description:
      'Manage your decentralized identity, upload documents, request credentials, and answer verifier challenges with selective disclosure.',
    actions: ['Enter personal details', 'Upload supporting documents', 'Respond to access requests']
  },
  {
    role: 'issuer',
    title: 'Issuer Portal',
    description:
      'Review submitted evidence, approve or reject credential requests, and mint verifiable credentials for citizens.',
    actions: ['Verify uploaded documents', 'Issue and revoke credentials', 'Monitor request pipeline']
  },
  {
    role: 'verifier',
    title: 'Verifier Portal',
    description:
      'Challenge citizens for specific claims, verify cryptographic proofs on submissions, and grant or deny access instantly.',
    actions: ['View incoming access locks', 'Send targeted challenges', 'Auto-validate proofs']
  }
]

const truncateAccount = (account: string) => `${account.slice(0, 6)}…${account.slice(-4)}`

export const RoleLanding: FC<RoleLandingProps> = ({
  onSelect,
  sessions,
  verifierWallet,
  onConfigureVerifierWallet
}) => {
  const [resetting, setResetting] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [walletDraft, setWalletDraft] = useState(verifierWallet ?? '')

  useEffect(() => {
    setWalletDraft(verifierWallet ?? '')
  }, [verifierWallet])

  const effectiveVerifierWallet = useMemo(
    () => verifierWallet ?? DEMO_VERIFIER_WALLET ?? null,
    [verifierWallet]
  )


  async function handleReset() {
    setStatusMessage(null)
    setResetting(true)
    try {
      await api.resetCitizenData()
      setStatusMessage({ type: 'success', text: 'Citizen data wiped successfully.' })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message ?? 'Failed to reset citizen data.' })
    } finally {
      setResetting(false)
    }
  }

  async function handleSeed() {
    setStatusMessage(null)
    setSeeding(true)
    try {
      const response = await api.seedDemoData(
        effectiveVerifierWallet ? { walletAddress: effectiveVerifierWallet } : undefined
      )
      setStatusMessage({
        type: 'success',
        text: `Demo data loaded for wallet ${response.wallet}.`
      })
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message ?? 'Failed to load demo data.'
      })
    } finally {
      setSeeding(false)
    }
  }

  const walletInputDisabled = resetting || seeding

  async function handleWalletApply(seedAfterSave: boolean) {
    const trimmed = walletDraft.trim()
    if (!trimmed.length) {
      onConfigureVerifierWallet(null)
      setStatusMessage({
        type: 'success',
        text: 'Verifier wallet cleared. Connect MetaMask on the portal to monitor requests.'
      })
      return
    }

    const walletRegex = /^0x[a-fA-F0-9]{40}$/
    if (!walletRegex.test(trimmed)) {
      setStatusMessage({
        type: 'error',
        text: 'Verifier wallet must be a valid 0x-prefixed address.'
      })
      return
    }

    const normalized = trimmed.toLowerCase()
    onConfigureVerifierWallet(normalized)
    if (!seedAfterSave) {
      setStatusMessage({
        type: 'success',
        text: `Verifier portal configured for ${normalized}.`
      })
      return
    }

    setSeeding(true)
    setStatusMessage(null)
    try {
      const response = await api.seedDemoData({ walletAddress: normalized })
      setStatusMessage({
        type: 'success',
        text: `Verifier portal configured and sample data loaded for ${response.wallet}.`
      })
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message ?? 'Failed to seed demo data for the specified wallet.'
      })
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="role-landing">
      <header className="role-landing__header">
        <h1>PixelGenesis Control Center</h1>
        <p>
          Choose the workspace you want to operate in. You can switch portals at any time without
          disconnecting your wallet.
        </p>
        <div className="role-landing__actions">
          <button className="btn-outline danger" onClick={handleReset} disabled={resetting || seeding}>
            {resetting ? 'Resetting…' : 'Reset demo data'}
          </button>
          <button className="btn-primary" onClick={handleSeed} disabled={seeding || resetting}>
            {seeding ? 'Seeding…' : 'Load sample data'}
          </button>
          {statusMessage && (
            <span className={`role-landing__notice role-landing__notice--${statusMessage.type}`}>
              {statusMessage.text}
            </span>
          )}
        </div>
        <div className="role-landing__config">
          <label>
            Verifier demo wallet
            <div className="role-landing__config-row">
              <input
                value={walletDraft}
                onChange={(event) => setWalletDraft(event.target.value)}
                placeholder="0x... address"
                disabled={walletInputDisabled}
              />
              <button
                className="btn-primary"
                type="button"
                onClick={() => void handleWalletApply(false)}
                disabled={walletInputDisabled}
              >
                Apply
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void handleWalletApply(true)}
                disabled={walletInputDisabled}
              >
                Apply & Seed
              </button>
            </div>
          </label>
          <p className="role-landing__hint">
            Current verifier wallet:{' '}
            {effectiveVerifierWallet ? <code>{effectiveVerifierWallet}</code> : 'Not configured'}
          </p>
          {DEMO_VERIFIER_WALLET && (
            <p className="role-landing__hint">
              Default from <code>VITE_DEMO_VERIFIER_WALLET</code>: <code>{DEMO_VERIFIER_WALLET}</code>
            </p>
          )}
        </div>
        <section className="role-landing__guide">
          <h2>Demo checklist</h2>
          <ol>
            <li>Apply a verifier wallet and click <strong>Apply &amp; Seed</strong>.</li>
            <li>Open <code>?role=citizen</code>, connect MetaMask, request access or credentials.</li>
            <li>Open <code>?role=verifier</code> to challenge and evaluate in real time.</li>
            <li>Use <code>?role=issuer</code> to approve or reject pending credential requests.</li>
          </ol>
        </section>
      </header>

      <div className="portal-grid">
        {ROLE_CARDS.map((card) => (
          <article key={card.role} className="portal-card">
            <header>
              <span className={`role-chip role-chip--${card.role}`}>{card.title}</span>
              <p>{card.description}</p>
            </header>

            <div className="portal-status">
              {sessions[card.role].account ? (
                <span className="portal-status__connected">
                  Connected: <code>{truncateAccount(sessions[card.role].account!)}</code>
                </span>
              ) : (
                <span className="portal-status__disconnected">Not connected</span>
              )}
            </div>

            <ul>
              {card.actions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <button className="btn-primary" onClick={() => onSelect(card.role)}>
              Enter {card.title}
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}


