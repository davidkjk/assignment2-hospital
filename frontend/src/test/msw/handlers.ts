import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/me', () => HttpResponse.json({
    id: 'staff-1',
    name: '김직원',
    email: 'kim@hospital.kr',
    role: 'receptionist',
    department_id: null,
    department_name: null,
  })),
]
