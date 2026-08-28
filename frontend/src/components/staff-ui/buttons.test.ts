import { expect, test } from 'vitest'
import { btnPrimary, btnGhost, btnLink } from './buttons'

test('주 버튼 = 딥틸 채움 + 흰 글자', () => {
  expect(btnPrimary).toContain('bg-primary')
  expect(btnPrimary).toContain('text-white')
})

test('보조 버튼 = 경계 + 카드 배경(고스트)', () => {
  expect(btnGhost).toContain('border-border')
  expect(btnGhost).toContain('bg-card')
})

test('링크 버튼 = 딥틸 글자 + 밑줄 호버', () => {
  expect(btnLink).toContain('text-primary')
  expect(btnLink).toContain('hover:underline')
})
