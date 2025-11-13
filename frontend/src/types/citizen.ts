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
  fullName: string | null
  address: string | null
  dateOfBirth: string | null
  nationality: string | null
  vaccinationStatus: string | null
  collegeName: string | null
  collegeStatus: string | null
  createdAt: number | null
  updatedAt: number | null
  lastLoginAt: number | null
  roles: CitizenRoleRecord[]
  documentSummary: SummaryRecord[]
  credentialSummary: SummaryRecord[]
}

