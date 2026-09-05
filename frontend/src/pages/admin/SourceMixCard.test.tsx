import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { SourceMixCard } from './SourceMixCard'
import type { SourceMix } from '../../api/stats'

// 결정23 · 갭 #23 — 앱·직원·챗봇을 별도 유입원으로.

function labels(): string[] {
  return screen.getAllByTestId('source-label').map((el) => el.textContent ?? '')
}
function percentSum(): number {
  return screen.getAllByTestId('source-pct').reduce((a, el) => a + Number(el.textContent), 0)
}

describe('SourceMixCard', () => {
  test('[STAT-METRIC-05][결정23] 앱·직원·챗봇을 각각 별도 유입원으로 세고 섞지 않는다', () => {
    const mix: SourceMix = { basis: 'created_at', rows: { app: 244, staff: 150, chatbot: 34 }, total: 428 }
    render(<SourceMixCard mix={mix} />)
    expect(labels()).toEqual(['앱', '직원', '챗봇'])
    expect(percentSum()).toBe(100)
  })

  test('[STAT-METRIC-05] chatbot 데이터가 아직 없어도(0건) 표가 깨지지 않는다', () => {
    // 4단계 전에는 챗봇 열이 없어지는 게 아니라 값이 0일 뿐이다 — 총합은 여전히 100.
    const mix: SourceMix = { basis: 'created_at', rows: { app: 260, staff: 168, chatbot: 0 }, total: 428 }
    render(<SourceMixCard mix={mix} />)
    expect(labels()).toContain('챗봇')
    expect(percentSum()).toBe(100)
  })
})
