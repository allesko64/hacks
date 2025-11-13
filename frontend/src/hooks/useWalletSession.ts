import { useCallback, useEffect, useRef, useState } from 'react'
import type { CitizenProfile } from '../types/citizen'
import { api } from '../lib/api'
import { BrowserProvider } from 'ethers'

type Nullable<T> = T | null

const API_BASE = (import.meta.env?.VITE_API_URL as string) ?? 'http://localhost:3000'
const MESSAGE_PREFIX = 'PixelGenesis login nonce: '

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>
      on: (event: string, handler: (...args: any[]) => void) => void
      removeListener: (event: string, handler: (...args: any[]) => void) => void
    }
  }
}

interface WalletSessionState {
  account: Nullable<string>
  did: Nullable<string>
  token: Nullable<string>
  loading: boolean
  error: Nullable<string>
  profile: Nullable<CitizenProfile>
}

export interface WalletSession {
  account: Nullable<string>
  did: Nullable<string>
  token: Nullable<string>
  loading: boolean
  error: Nullable<string>
  profile: Nullable<CitizenProfile>
  connect: () => Promise<void>
  disconnect: () => void
  resetError: () => void
  refreshProfile: () => Promise<void>
}

async function fetchNonce(address: string) {
  const response = await fetch(`${API_BASE}/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  })

  const data = await response.json()
  if (!response.ok || !data.nonce) {
    throw new Error(data.error || 'Failed to obtain nonce')
  }

  return data.nonce as string
}

async function verifySignature(address: string, signature: string) {
  const response = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature })
  })

  const data = await response.json()
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Signature verification failed')
  }

  return data.token as Nullable<string>
}

export function useWalletSession(): WalletSession {
  const [state, setState] = useState<WalletSessionState>({
    account: null,
    did: null,
    token: null,
    loading: false,
    error: null,
    profile: null
  })
  const mountedRef = useRef(true)

  const resetError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  const disconnect = useCallback(() => {
    setState({
      account: null,
      did: null,
      token: null,
      loading: false,
      error: null,
      profile: null
    })
  }, [])

  const loadProfile = useCallback(
    async (address: string) => {
      try {
        const citizen = await api.getCitizen(address)
        if (!mountedRef.current) return

        const profile = citizen?.citizen as CitizenProfile | undefined

        setState((prev) => ({
          ...prev,
          did: profile?.did ?? `did:ethr:${address}`,
          profile: profile ?? null
        }))
      } catch {
        if (!mountedRef.current) return
        setState((prev) => ({
          ...prev,
          did: `did:ethr:${address}`,
          profile: null
        }))
      }
    },
    []
  )

  const connect = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      if (!window.ethereum) {
        throw new Error('MetaMask extension not detected')
      }

      const accounts: string[] = await window.ethereum.request({
        method: 'eth_requestAccounts'
      })

      const address = accounts[0]
      if (!address) {
        throw new Error('No account returned by MetaMask')
      }

      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      const nonce = await fetchNonce(address)
      const signature = await signer.signMessage(`${MESSAGE_PREFIX}${nonce}`)
      const token = await verifySignature(address, signature)

      if (!mountedRef.current) return

      setState({
        account: address,
        did: null,
        token,
        loading: false,
        error: null,
        profile: null
      })

      await loadProfile(address)
    } catch (err: any) {
      if (!mountedRef.current) return
      setState({
        account: null,
        did: null,
        token: null,
        loading: false,
        error: err?.message ?? 'Unknown MetaMask error',
        profile: null
      })
    }
  }, [loadProfile])

  useEffect(() => {
    mountedRef.current = true
    const ethereum = window.ethereum

    const handleAccountsChanged = (accounts: string[]) => {
      if (!accounts.length) {
        disconnect()
      } else {
        const nextAccount = accounts[0]
        setState((prev) => ({
          ...prev,
          account: nextAccount,
          profile: prev.account === nextAccount ? prev.profile : null,
          did: prev.account === nextAccount ? prev.did : null
        }))
        if (nextAccount) {
          loadProfile(nextAccount).catch(() => undefined)
        }
      }
    }

    const handleChainChanged = () => {
      disconnect()
    }

    if (ethereum?.on) {
      ethereum.on('accountsChanged', handleAccountsChanged)
      ethereum.on('chainChanged', handleChainChanged)
    }

    return () => {
      mountedRef.current = false

      if (ethereum?.removeListener) {
        ethereum.removeListener('accountsChanged', handleAccountsChanged)
        ethereum.removeListener('chainChanged', handleChainChanged)
      }
    }
  }, [disconnect, loadProfile])

  const refreshProfile = useCallback(async () => {
    if (!state.account) return
    await loadProfile(state.account)
  }, [loadProfile, state.account])

  return {
    account: state.account,
    did: state.did,
    token: state.token,
    loading: state.loading,
    error: state.error,
    profile: state.profile,
    connect,
    disconnect,
    resetError,
    refreshProfile
  }
}


