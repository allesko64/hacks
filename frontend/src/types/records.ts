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

export interface AccessNotes {
  policy?: {
    id?: string
    label?: string
    description?: string
  }
  initialMessage?: string
  challenge?: {
    message: string | null
    issuedAt: number
  }
  response?: {
    submittedAt: number
  }
  evaluation?: {
    status: string
    reason: string
    evaluatedAt: number
    claimValue?: unknown
    claimValues?: Record<string, unknown>
    condition?: string
  }
  timeline?: Array<{ state: string; at: number }>
}

export interface AccessRequestRecord {
  id: number
  citizenWallet: string
  verifierWallet: string
  claim: string
  condition: Record<string, unknown> | null
  status: string
  notes: AccessNotes | string | null
  responsePayload: Record<string, unknown> | null
  createdAt: number | null
  updatedAt: number | null
  respondedAt: number | null
}

export interface CredentialRequestRecord {
  id: number
  walletAddress: string
  requestedClaims: string[]
  status: string
  issuerWallet: string | null
  verifierWallet: string | null
  notes: Record<string, unknown> | string | null
  createdAt: number | null
  updatedAt: number | null
}

