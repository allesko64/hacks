import { useMemo } from 'react'
import type { WalletSession } from './useWalletSession'

export function useStaticWalletSession(walletAddress?: string | null): WalletSession {
  const normalized = walletAddress ? walletAddress.toLowerCase() : null

  return useMemo<WalletSession>(
    () => ({
      account: normalized,
      did: normalized ? `did:ethr:${normalized}` : null,
      token: null,
      loading: false,
      error: null,
      profile: null,
      connect: async () => undefined,
      disconnect: () => undefined,
      resetError: () => undefined,
      refreshProfile: async () => undefined
    }),
    [normalized]
  )
}


