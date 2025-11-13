import type { CitizenProfile } from '../types/citizen'
import type { CredentialRecord, DocumentRecord } from '../types/records'

const API_BASE =
  (import.meta.env?.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

type RequestOptions = RequestInit & {
  skipAuth?: boolean
}

interface ApiEnvelope<T> {
  ok: boolean
  items?: T[]
}

interface CitizenEnvelope {
  ok: boolean
  citizen: CitizenProfile
}

interface DocumentEnvelope {
  ok: boolean
  document: DocumentRecord
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, headers, ...rest } = options

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {})
    },
    ...rest
  })

  const data = await response
    .json()
    .catch(() => ({ ok: response.ok } as unknown as T))

  if (!response.ok || (data as any)?.ok === false) {
    const message = (data as any)?.error ?? response.statusText
    throw new Error(message)
  }

  return data as T
}

export const api = {
  getCitizen(walletAddress: string) {
    return request<CitizenEnvelope>(`/citizens/${walletAddress}`)
  },
  updateCitizen(walletAddress: string, payload: any) {
    return request(`/citizens/${walletAddress}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
  },
  assignCitizenRole(walletAddress: string, role: string) {
    return request(`/citizens/${walletAddress}/roles`, {
      method: 'POST',
      body: JSON.stringify({ role })
    })
  },
  listDocuments(walletAddress: string) {
    const params = new URLSearchParams({ walletAddress })
    return request<ApiEnvelope<DocumentRecord>>(`/documents?${params.toString()}`)
  },
  uploadDocument(payload: any) {
    return request<DocumentEnvelope>('/documents/upload', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },
  updateDocumentStatus(id: number | string, payload: any) {
    return request(`/documents/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
  },
  listCredentials(walletAddress: string) {
    const params = new URLSearchParams({ walletAddress })
    return request<ApiEnvelope<CredentialRecord>>(`/credentials?${params.toString()}`)
  },
  issueCredential(payload: any) {
    return request('/credentials/issue', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },
  requestCredential(payload: any) {
    return request('/requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },
  listCredentialRequests(walletAddress: string) {
    const params = new URLSearchParams({ walletAddress })
    return request(`/requests?${params.toString()}`)
  }
}

