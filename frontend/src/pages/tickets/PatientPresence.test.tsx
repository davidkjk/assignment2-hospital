import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PatientPresence } from './PatientPresence'

test('[TICKET-DETAIL-PATIENT-PRESENCE-01] 접속만 하면 "환자 접속 중"을 상태점과 함께 표시', () => {
  render(<PatientPresence typing={false} viewing={true} />)
  expect(screen.getByText('환자 접속 중')).toBeInTheDocument()
})

test('[TICKET-DETAIL-PATIENT-TYPING-01] 입력 중이면 "환자 입력 중"을 표시(접속보다 우선)', () => {
  render(<PatientPresence typing={true} viewing={true} />)
  expect(screen.getByText('환자 입력 중')).toBeInTheDocument()
  expect(screen.queryByText('환자 접속 중')).not.toBeInTheDocument()
})

test('접속도 입력도 아니면 아무것도 그리지 않는다(막다른 상태 표시 금지)', () => {
  const { container } = render(<PatientPresence typing={false} viewing={false} />)
  expect(container).toBeEmptyDOMElement()
})

test('[TICKET-DETAIL-SCOPE-01] 상태 표시는 라이브 텍스트로만(온라인 초록 점 아님)', () => {
  render(<PatientPresence typing={false} viewing={true} />)
  // aria-live 로 스크린리더에 알리되, "온라인" 같은 상시 접속 단정은 쓰지 않는다.
  expect(screen.getByText('환자 접속 중').closest('[aria-live]')).not.toBeNull()
})
