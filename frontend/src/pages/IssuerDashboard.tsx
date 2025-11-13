import { useEffect, useState } from 'react'
import { ConnectWalletCard } from '../components/ConnectWalletCard'
import type { WalletSession } from '../hooks/useWalletSession'

interface IssuerDashboardProps {
  auth: WalletSession
}

export function IssuerDashboard({ auth }: IssuerDashboardProps) {
  const [showComingSoon, setShowComingSoon] = useState(true)

  useEffect(() => {
    // Placeholder for future issuer data fetching
    const timer = window.setTimeout(() => setShowComingSoon(false), 0)
    return () => window.clearTimeout(timer)
  }, [])

  if (!auth.account) {
    return <ConnectWalletCard auth={auth} />
  }

  return (
    <div className="issuer-dashboard">
      <header className="portal-header">
        <span className="role-chip role-chip--issuer">Issuer Portal</span>
        <h1>Credential Issuance</h1>
        <p>
          Review supporting evidence submitted by citizens, validate authenticity, and mint
          verifiable credentials anchored to the Polygon blockchain.
        </p>
      </header>

      <section className="issuer-section">
        {showComingSoon ? (
          <div className="issuer-placeholder">
            <h2>Dashboard coming soon</h2>
            <p>
              The issuer experience will surface pending credential requests, document verification
              actions, and issuance pipelines. Stay tuned!
            </p>
          </div>
        ) : (
          <div className="issuer-placeholder">
            <h2>Dashboard coming soon</h2>
            <p>
              The issuer experience will surface pending credential requests, document verification
              actions, and issuance pipelines. Stay tuned!
            </p>
          </div>
        )}
      </section>
    </div>
  )
}


