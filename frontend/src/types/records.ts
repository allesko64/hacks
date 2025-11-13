export type DocumentStatus = 'uploaded' | 'under_review' | 'verified' | 'rejected'

export interface DocumentRecord {
  id: number
  walletAddress: string
  type: string
  storageUri: string
  ipfsCid: string | null
  status: DocumentStatus
  metadata: Record<string, unknown> | null
  uploadedAt: number | null
  reviewedAt: number | null
}

export interface CredentialRecord {
  id: number
  walletAddress: string
  documentId: number | null
  type: string | null
  issuerWallet: string | null
  verificationStatus: string | null
  anchoredTxHash: string | null
  anchoredChainId: string | null
  anchoredAt: number | null
  revokedAt: number | null
  createdAt: number | null
  vcJwt: string
}

