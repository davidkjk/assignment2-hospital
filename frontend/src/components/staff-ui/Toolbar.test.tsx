import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Toolbar } from './Toolbar'

test('좌측 필터와 우측 액션을 한 줄에 배치한다', () => {
  render(<Toolbar left={<span>필터</span>} right={<button>추가</button>} />)
  expect(screen.getByText('필터')).toBeVisible()
  expect(screen.getByRole('button', { name: '추가' })).toBeVisible()
})
