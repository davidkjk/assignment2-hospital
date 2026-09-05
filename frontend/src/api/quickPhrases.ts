import { apiFetch } from './httpClient'

// 의사 자주 쓰는 문구 얇은 클라이언트. 백엔드 계약: backend/app/routers/doctor_phrases.py

export interface Phrase {
  id: string
  text: string
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function listPhrases(doctorId?: string) {
  const query = doctorId ? `?doctor_id=${encodeURIComponent(doctorId)}` : ''
  return apiFetch<Phrase[]>(`/doctor/quick-phrases${query}`)
}

export function createPhrase(text: string) {
  return apiFetch<Phrase>('/doctor/quick-phrases', json('POST', { text }))
}

export function updatePhrase(phraseId: string, text: string) {
  return apiFetch<Phrase>(`/doctor/quick-phrases/${phraseId}`, json('PUT', { text }))
}

export function deletePhrase(phraseId: string) {
  return apiFetch<{ status: string }>(`/doctor/quick-phrases/${phraseId}`, { method: 'DELETE' })
}
