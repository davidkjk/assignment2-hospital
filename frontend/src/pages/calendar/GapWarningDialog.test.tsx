import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { GapWarningDialog } from './GapWarningDialog'

// [CAL-GAP-05] 겹침 경고는 「누구와 몇 분」을 적는다 — 막연한 경고가 아니다.
//   겹치는 예약이 **고른 시각보다 뒤에 시작하나(틈)** / **앞서 시작한 이미 찬 자리인가**에 따라
//   문구가 달라진다. 앞선 예약에 「다음 예약」·「이 자리는 0분」을 적으면 거짓말이 된다.

test('[CAL-GAP-05] 틈에 넣기 — 뒤에 시작하는 「다음 예약」과 몇 분 겹치는지 적는다', () => {
  render(
    <GapWarningDialog
      slotMinutes={15}
      gapMinutes={5}
      occupied={false}
      overlap={{ patientLabel: '정우성 님', startLabel: '10:20', endLabel: '10:40', minutes: 10 }}
      onCancel={vi.fn()}
      onProceed={vi.fn()}
    />,
  )
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('이 자리는 5분입니다')
  expect(dialog).toHaveTextContent('진료 15분으로 잡으면')
  expect(dialog).toHaveTextContent('다음 예약(정우성 님 10:20)')
  expect(dialog).toHaveTextContent('10분 겹칩니다')
})

test('[CAL-GAP-05] 이미 찬 자리 — 앞서 시작한 예약엔 「다음 예약」·「0분」을 쓰지 않는다', () => {
  render(
    <GapWarningDialog
      slotMinutes={15}
      gapMinutes={0}
      occupied
      overlap={{ patientLabel: '정우성 님', startLabel: '10:00', endLabel: '10:20', minutes: 10 }}
      onCancel={vi.fn()}
      onProceed={vi.fn()}
    />,
  )
  const dialog = screen.getByRole('dialog')
  // 이미 있는 예약의 전체 구간(시작–끝)을 적고, 몇 분 겹치는지 적는다.
  expect(dialog).toHaveTextContent('이미 예약(정우성 님 10:00–10:20)이 있습니다')
  expect(dialog).toHaveTextContent('진료 15분으로 잡으면')
  expect(dialog).toHaveTextContent('10분 겹칩니다')
  // 앞선 예약에 「다음 예약」·「이 자리는 0분」을 적으면 어긋난다.
  expect(dialog).not.toHaveTextContent('다음 예약')
  expect(dialog).not.toHaveTextContent('이 자리는')
})

test('[CAL-GAP-06] 두 문구 모두 진행 버튼은 빨간 버튼이 아니라 「알겠습니다, 그대로 잡기」', () => {
  const { rerender } = render(
    <GapWarningDialog
      slotMinutes={15}
      gapMinutes={5}
      occupied={false}
      overlap={{ patientLabel: '정우성 님', startLabel: '10:20', endLabel: '10:40', minutes: 10 }}
      onCancel={vi.fn()}
      onProceed={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: '알겠습니다, 그대로 잡기' })).toBeVisible()
  expect(screen.getByRole('button', { name: '그만두기' })).toBeVisible()
  rerender(
    <GapWarningDialog
      slotMinutes={15}
      gapMinutes={0}
      occupied
      overlap={{ patientLabel: '정우성 님', startLabel: '10:00', endLabel: '10:20', minutes: 10 }}
      onCancel={vi.fn()}
      onProceed={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: '알겠습니다, 그대로 잡기' })).toBeVisible()
})
