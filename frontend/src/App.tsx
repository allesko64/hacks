import './App.css'
import { ConnectWalletCard } from './components/ConnectWalletCard'
import { CitizenDashboard } from './pages/CitizenDashboard'
import { useMetamaskAuth } from './hooks/useMetamaskAuth'

function App() {
  const auth = useMetamaskAuth()

  return (
    <div className="app-shell">
      {auth.account ? <CitizenDashboard auth={auth} /> : <ConnectWalletCard auth={auth} />}
    </div>
  )
}

export default App
