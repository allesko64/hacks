import { useEffect, useMemo } from 'react'
import type { WalletSession } from '../hooks/useWalletSession'

const truncateAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

interface ConnectWalletCardProps {
  auth: WalletSession
}

export function ConnectWalletCard({ auth }: ConnectWalletCardProps) {
  const { account, token, loading, error, connect, disconnect, resetError } = auth

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => resetError(), 4000)
    return () => window.clearTimeout(timer)
  }, [error, resetError])

  const statusLabel = useMemo(() => {
    if (loading) return 'Awaiting wallet signature…'
    if (account) return 'Wallet connected'
    return 'Wallet not connected'
  }, [account, loading])

  const accountDisplay = account ? truncateAddress(account) : '—'

  return (
    <section className="wallet-card">
      <header className="wallet-card__header">
        <span className="wallet-card__badge">MetaMask login</span>
        <h1>Authenticate with your wallet</h1>
        <p>Connect MetaMask and sign a one-time nonce to prove you own the address. No gas fees involved.</p>
      </header>

      <div className="wallet-card__status">
        <div>
          <span className="wallet-card__status-label">{statusLabel}</span>
          <strong className="wallet-card__status-value">{accountDisplay}</strong>
        </div>
        {account && (
          <button className="btn-secondary" onClick={disconnect}>
            Disconnect
          </button>
        )}
      </div>

      {token && (
        <div className="wallet-card__token">
          <span className="wallet-card__token-label">Session token</span>
          <code className="wallet-card__token-value">{token}</code>
        </div>
      )}

      {error && <div className="wallet-card__alert">{error}</div>}

      <div className="wallet-card__actions">
        {!account && (
          <button className="btn-primary" onClick={connect} disabled={loading}>
            {loading ? 'Connecting…' : 'Connect MetaMask'}
          </button>
        )}
        <p className="wallet-card__hint">
          Tip: ensure MetaMask is unlocked and that&nbsp;
          <code>VITE_API_URL</code> points to the backend (defaults to <code>http://localhost:3000</code>).
        </p>
      </div>

      <footer className="wallet-card__footer">
        <h2>What happens?</h2>
        <ol>
          <li>The frontend requests a nonce from <code>/auth/nonce</code>.</li>
          <li>MetaMask signs the message <code>&quot;PixelGenesis login nonce: &lt;nonce&gt;&quot;</code>.</li>
          <li>The backend verifies the signature at <code>/auth/verify</code> and issues a session token.</li>
        </ol>
      </footer>
    </section>
  )
}

