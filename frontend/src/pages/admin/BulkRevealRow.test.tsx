import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { BulkRevealRow } from './BulkRevealRow'
import { groupRows } from './logRows'
import type { AccessLogRow } from '../../api/accessLogs'

function reveal(i: number, over: Partial<AccessLogRow> = {}): AccessLogRow {
  return {
    id: `c${i}`,
    accessed_at: '2026-08-08T10:12:03+09:00',
    resource_type: 'phone_reveal',
    search_term: null,
    staff_name: '김접수',
    patient: { patient_id: `p${i}`, masked_name: '홍*동', masked_birth_date: '1985-**-01', masked_phone: '010-****-5678' },
    ...over,
  }
}

function inTable(node: React.ReactNode) {
  return render(
    <table>
      <tbody>{node}</tbody>
    </table>,
  )
}

describe('대량 열람 묶음 (ALOG-GROUP-*)', () => {
  test('[ALOG-AUDIT-02][결정11] 단발 [번호 보기] 한 건은 접지 않고 한 행으로 남긴다', () => {
    const nodes = groupRows([reveal(0)])
    expect(nodes).toHaveLength(1)
    expect(nodes[0].kind).toBe('single')
  })

  test('[ALOG-GROUP-01][SEND-OPEN-07c] 같은 직원·시각의 연속 번호 열람은 한 묶음으로 접힌다', () => {
    const rows = Array.from({ length: 3000 }, (_, i) => reveal(i))
    const nodes = groupRows(rows)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ kind: 'bulk' })
    if (nodes[0].kind === 'bulk') expect(nodes[0].children).toHaveLength(3000)
  })

  test('[ALOG-GROUP-01] 3,000명 대량 열람은 표에서 한 줄로 접혀 개별 행을 깔지 않는다', () => {
    const children = Array.from({ length: 3000 }, (_, i) => reveal(i))
    const node = { kind: 'bulk' as const, key: 'c0', staffName: '김접수', accessedAt: children[0].accessed_at, children }
    inTable(<BulkRevealRow node={node} />)
    expect(screen.getByText('발송 명단 번호 열람 · 3,000명')).toBeVisible()
    expect(screen.queryAllByTestId('bulk-child')).toHaveLength(0)
  })

  test('[ALOG-GROUP-02][SEND-OPEN-07f] [개별 기록 보기]는 같은 화면에서 하위 행으로 펼치고 raw 번호를 다시 풀지 않는다', async () => {
    const children = Array.from({ length: 3000 }, (_, i) => reveal(i))
    const node = { kind: 'bulk' as const, key: 'c0', staffName: '김접수', accessedAt: children[0].accessed_at, children }
    inTable(<BulkRevealRow node={node} />)
    await userEvent.click(screen.getByRole('button', { name: '개별 기록 보기' }))
    expect(screen.getAllByTestId('bulk-child')).toHaveLength(3000)
    expect(screen.getAllByText('홍*동 · 1985-**-01')[0]).toBeVisible()
    expect(screen.queryByText(/010-\d{4}-\d{4}/)).toBeNull()
  }, 15000)   // 3,000행(SEND-OPEN-07f 상한) 렌더는 jsdom에서 느리다 — 로직 아닌 렌더 속도라 타임아웃만 올린다

  test('[ALOG-GROUP-01] 직원·시각이 다르면 묶지 않는다 — 다른 사람의 열람이 한 줄로 뭉개지지 않는다', () => {
    const rows = [reveal(0, { staff_name: '김접수' }), reveal(1, { staff_name: '박접수' })]
    const nodes = groupRows(rows)
    expect(nodes).toHaveLength(2)
    expect(nodes.every((n) => n.kind === 'single')).toBe(true)
  })
})
