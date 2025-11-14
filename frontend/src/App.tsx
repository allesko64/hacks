import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import './App.css'
import { ConnectWalletCard } from './components/ConnectWalletCard'
import { CitizenDashboard } from './pages/CitizenDashboard'
import { VerifierDashboard } from './pages/VerifierDashboard'
import { IssuerDashboard } from './pages/IssuerDashboard'
import { RoleLanding } from './pages/RoleLanding'
import { useWalletSession } from './hooks/useWalletSession'
import { useStaticWalletSession } from './hooks/useStaticWalletSession'
import { DEMO_VERIFIER_WALLET } from './config/accessPolicies'

type PortalRole = 'landing' | 'citizen' | 'issuer' | 'verifier'

const ROLE_LABELS: Record<Exclude<PortalRole, 'landing'>, string> = {
  citizen: 'Citizen Portal',
  issuer: 'Issuer Portal',
  verifier: 'Verifier Portal'
}

function parseRoleParam(value: string | null): PortalRole {
  if (!value) return 'landing'
  if (value === 'citizen' || value === 'issuer' || value === 'verifier') {
    return value
  }
  return 'landing'
}

function App() {
  const [verifierWalletOverride, setVerifierWalletOverride] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return DEMO_VERIFIER_WALLET
    }
    const stored = window.localStorage.getItem('pixelgenesis:verifierWallet')
    return stored ?? DEMO_VERIFIER_WALLET ?? null
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (verifierWalletOverride) {
      window.localStorage.setItem('pixelgenesis:verifierWallet', verifierWalletOverride)
    } else {
      window.localStorage.removeItem('pixelgenesis:verifierWallet')
    }
  }, [verifierWalletOverride])

  const handleVerifierWalletUpdate = useCallback((wallet: string | null) => {
    setVerifierWalletOverride(wallet ? wallet.toLowerCase() : null)
  }, [])

  const citizenSession = useWalletSession()
  const issuerSession = useStaticWalletSession(verifierWalletOverride)
  const verifierSession = useStaticWalletSession(verifierWalletOverride)
  const sessionMap = useMemo(
    () => ({
    citizen: citizenSession,
    issuer: issuerSession,
    verifier: verifierSession
    }),
    [citizenSession, issuerSession, verifierSession]
  )

  const [role, setRole] = useState<PortalRole>(() =>
    typeof window !== 'undefined'
      ? parseRoleParam(new URLSearchParams(window.location.search).get('role'))
      : 'landing'
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (role === 'landing') {
      if (!params.has('role')) return
      params.delete('role')
    } else {
      params.set('role', role)
    }
    const queryString = params.toString()
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  }, [role])

  let content: ReactNode = null
  switch (role) {
    case 'landing':
      content = (
        <RoleLanding
          onSelect={setRole}
          sessions={sessionMap}
          verifierWallet={verifierWalletOverride}
          onConfigureVerifierWallet={handleVerifierWalletUpdate}
        />
      )
      break
    case 'citizen':
      content = citizenSession.account ? (
        <CitizenDashboard auth={citizenSession} />
      ) : (
        <ConnectWalletCard auth={citizenSession} />
      )
      break
    case 'issuer':
      content = issuerSession.account ? (
        <IssuerDashboard auth={issuerSession} />
      ) : (
        <div className="auto-session-placeholder">
          <h2>Issuer Portal</h2>
          <p>
            Configure <code>VITE_DEMO_VERIFIER_WALLET</code> to auto-connect the issuer portal without
            MetaMask.
          </p>
        </div>
      )
      break
    case 'verifier':
      content = verifierSession.account ? (
        <VerifierDashboard auth={verifierSession} />
      ) : (
        <div className="auto-session-placeholder">
          <h2>Verifier Portal</h2>
          <p>
            Configure <code>VITE_DEMO_VERIFIER_WALLET</code> to auto-connect the verifier portal without
            MetaMask.
          </p>
        </div>
      )
      break
    default:
      content = null
  }

  const showRoleHeader = role !== 'landing'
  const activeRoleLabel =
    role !== 'landing' ? ROLE_LABELS[role as Exclude<PortalRole, 'landing'>] : null
  const activeSession =
    role !== 'landing' ? sessionMap[role as Exclude<PortalRole, 'landing'>] : null

  return (
    <div className={`app-shell role-${role}`}>
      {showRoleHeader && (
        <header className="role-header">
          <div className="role-header__group">
            <button className="role-home" onClick={() => setRole('landing')}>
              ← Change Portal
            </button>
            {activeRoleLabel && (
              <span className={`role-chip role-chip--${role}`}>{activeRoleLabel}</span>
            )}
          </div>
          {activeSession?.account && (
            <code className="role-account" title="Connected wallet">
              {activeSession.account}
            </code>
          )}
        </header>
      )}
      {content}
    </div>
  )
}

export default App
