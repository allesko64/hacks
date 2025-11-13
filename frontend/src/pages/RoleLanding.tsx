import type { FC } from 'react'
import type { WalletSession } from '../hooks/useWalletSession'

type PortalRole = 'citizen' | 'issuer' | 'verifier'

interface RoleLandingProps {
  onSelect: (role: PortalRole) => void
  sessions: Record<PortalRole, WalletSession>
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

export const RoleLanding: FC<RoleLandingProps> = ({ onSelect, sessions }) => {
  return (
    <div className="role-landing">
      <header className="role-landing__header">
        <h1>PixelGenesis Control Center</h1>
        <p>
          Choose the workspace you want to operate in. You can switch portals at any time without
          disconnecting your wallet.
        </p>
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


