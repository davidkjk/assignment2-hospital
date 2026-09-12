import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PageHead } from './PageHead'

test('부제와 우측 액션을 함께 보인다', () => {
  render(<PageHead sub="오늘 예약 현황" action={<button>새 예약</button>} />)
  expect(screen.getByText('오늘 예약 현황')).toBeVisible()
  expect(screen.getByRole('button', { name: '새 예약' })).toBeVisible()
})

test('부제·액션이 둘 다 없으면 빈 띠를 남기지 않는다(null)', () => {
  const { container } = render(<PageHead />)
  expect(container).toBeEmptyDOMElement()
})
