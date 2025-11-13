export type AccessCondition =
  | {
      claim?: string
      op: string
      value: unknown
    }
  | {
      all: AccessCondition[]
    }
  | {
      any: AccessCondition[]
    }

export interface AccessPolicy {
  id: string
  label: string
  description: string
  verifierWallet: string
  claim: string
  condition: AccessCondition
}

export const ACCESS_POLICIES: AccessPolicy[] = [
  {
    id: 'lounge-21',
    label: 'Night Lounge Access',
    description: 'Entry allowed only for guests aged 21 or above.',
    verifierWallet: '0xVerifierLounge',
    claim: 'age',
    condition: { op: '>=', value: 21 }
  },
  {
    id: 'airport-covid',
    label: 'Airport Boarding (COVID Clearance)',
    description: 'Boarding requires an up-to-date COVID vaccination record.',
    verifierWallet: '0xVerifierAirport',
    claim: 'vaccination',
    condition: { op: 'equals', value: 'yes' }
  },
  {
    id: 'india-entry',
    label: 'Immigration Entry to India',
    description: 'Immigration verifies nationality status before granting entry.',
    verifierWallet: '0xVerifierImmigration',
    claim: 'nationality',
    condition: { op: 'equals', value: 'indian' }
  },
  {
    id: 'campus-student',
    label: 'University Campus Access',
    description: 'Only currently enrolled students may enter the campus zone.',
    verifierWallet: '0xVerifierCampus',
    claim: 'college_status',
    condition: { op: 'equals', value: 'enrolled' }
  },
  {
    id: 'vip-event',
    label: 'VIP Tech Event Access',
    description: 'Event requires proof of vaccination and age at least 18.',
    verifierWallet: '0xVerifierEvent',
    claim: 'vaccination',
    condition: {
      all: [
        { claim: 'vaccination', op: 'equals', value: 'yes' },
        { claim: 'age', op: '>=', value: 18 }
      ]
    }
  }
]


