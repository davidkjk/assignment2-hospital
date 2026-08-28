import { render } from '@testing-library/react'
import { CalendarDays, Stethoscope, UserRoundPlus } from '@/components/icons'

// DISP-ICON-03 — 직원 콘솔 아이콘은 '채움(Solid)' 벡터다. 아웃라인·이모지 금지.
// 데모(`demo/src/components/icons.tsx`)가 lucide 이름으로 Phosphor를 re-export하므로,
// 포팅해 온 데모 화면이 import 경로만 바꿔 그대로 돌아간다.
it('데모와 같은 이름으로 채움 아이콘을 내보낸다', () => {
  const { container } = render(
    <>
      <Stethoscope />
      <CalendarDays />
      <UserRoundPlus />
    </>,
  )
  expect(container.querySelectorAll('svg')).toHaveLength(3)
})

it('weight 기본값이 fill이다', () => {
  const { container } = render(<Stethoscope />)
  // Phosphor의 fill 웨이트는 stroke 기반 path를 쓰지 않는다(면으로 그린다).
  expect(container.querySelector('svg')).toBeTruthy()
  expect(container.querySelector('svg')?.getAttribute('fill')).toBe('currentColor')
})
