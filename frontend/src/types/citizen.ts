export interface CitizenRoleRecord {
  role: string
  assignedAt: number
}

export interface SummaryRecord {
  status: string
  count: number
}

export interface CitizenProfile {
  walletAddress: string
  did: string | null
  displayName: string | null
  email: string | null
  role: string | null
  createdAt: number | null
  updatedAt: number | null
  lastLoginAt: number | null
  roles: CitizenRoleRecord[]
  documentSummary: SummaryRecord[]
  credentialSummary: SummaryRecord[]
}

