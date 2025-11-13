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

export const DEMO_VERIFIER_WALLET =
  (import.meta.env?.VITE_DEMO_VERIFIER_WALLET as string | undefined)?.trim().toLowerCase() ??
  null

const resolveVerifierWallet = (fallback: string) =>
  (DEMO_VERIFIER_WALLET ?? fallback).toLowerCase()

export const ACCESS_POLICIES: AccessPolicy[] = [
  {
    id: 'lounge-21',
    label: 'Night Lounge Access',
    description: 'Entry allowed only for guests aged 21 or above.',
    verifierWallet: resolveVerifierWallet('0xverifierlounge'),
    claim: 'age',
    condition: { op: '>=', value: 21 }
  },
  {
    id: 'airport-covid',
    label: 'Airport Boarding (COVID Clearance)',
    description: 'Boarding requires an up-to-date COVID vaccination record.',
    verifierWallet: resolveVerifierWallet('0xverifierairport'),
    claim: 'vaccination',
    condition: { op: 'equals', value: 'yes' }
  },
  {
    id: 'india-entry',
    label: 'Immigration Entry to India',
    description: 'Immigration verifies nationality status before granting entry.',
    verifierWallet: resolveVerifierWallet('0xverifierimmigration'),
    claim: 'nationality',
    condition: { op: 'equals', value: 'indian' }
  },
  {
    id: 'campus-student',
    label: 'University Campus Access',
    description: 'Only currently enrolled students may enter the campus zone.',
    verifierWallet: resolveVerifierWallet('0xverifiercampus'),
    claim: 'college_status',
    condition: { op: 'equals', value: 'enrolled' }
  },
  {
    id: 'vip-event',
    label: 'VIP Tech Event Access',
    description: 'Event requires proof of vaccination and age at least 18.',
    verifierWallet: resolveVerifierWallet('0xverifierevent'),
    claim: 'vaccination',
    condition: {
      all: [
        { claim: 'vaccination', op: 'equals', value: 'yes' },
        { claim: 'age', op: '>=', value: 18 }
      ]
    }
  }
]


