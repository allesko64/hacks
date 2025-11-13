import { useState, type ReactNode } from 'react'
import './App.css'
import { ConnectWalletCard } from './components/ConnectWalletCard'
import { CitizenDashboard } from './pages/CitizenDashboard'
import { VerifierDashboard } from './pages/VerifierDashboard'
import { IssuerDashboard } from './pages/IssuerDashboard'
import { RoleLanding } from './pages/RoleLanding'
import { useWalletSession } from './hooks/useWalletSession'

type PortalRole = 'landing' | 'citizen' | 'issuer' | 'verifier'

const ROLE_LABELS: Record<Exclude<PortalRole, 'landing'>, string> = {
  citizen: 'Citizen Portal',
  issuer: 'Issuer Portal',
  verifier: 'Verifier Portal'
}

function App() {
  const citizenSession = useWalletSession()
  const issuerSession = useWalletSession()
  const verifierSession = useWalletSession()
  const sessionMap = {
    citizen: citizenSession,
    issuer: issuerSession,
    verifier: verifierSession
  }

  const [role, setRole] = useState<PortalRole>('landing')

  let content: ReactNode = null
  switch (role) {
    case 'landing':
      content = <RoleLanding onSelect={setRole} sessions={sessionMap} />
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
        <ConnectWalletCard auth={issuerSession} />
      )
      break
    case 'verifier':
      content = verifierSession.account ? (
        <VerifierDashboard auth={verifierSession} />
      ) : (
        <ConnectWalletCard auth={verifierSession} />
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
