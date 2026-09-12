import { apiFetch } from './httpClient'

// 일정 변경(재예약·영향받는 예약) 얇은 클라이언트. 백엔드 계약: backend/app/routers/schedule_change.py

export function rescheduleAppointment(
  appointmentId: string,
  body: { new_start_at: string; reason: string },
) {
  return apiFetch<{ status: string }>(`/appointments/${appointmentId}/reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function listAffected(params: { exception_id?: string; deactivating_doctor_id?: string }) {
  const query = new URLSearchParams()
  if (params.exception_id) query.set('exception_id', params.exception_id)
  if (params.deactivating_doctor_id) query.set('deactivating_doctor_id', params.deactivating_doctor_id)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiFetch<Array<Record<string, unknown>>>(`/schedule/affected${suffix}`)
}
