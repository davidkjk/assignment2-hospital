import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { LogTable } from './LogTable'
import type { AccessLogRow } from '../../api/accessLogs'

// 백엔드 계약: audit_query_service._to_row — 마스킹 식별자만, resource_type은 raw.
const P1 = { patient_id: 'p1', name: '홍*동', masked_birth_date: '1985-**-01', masked_phone: '010-****-5678' }

function row(over: Partial<AccessLogRow>): AccessLogRow {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    accessed_at: '2026-08-15T09:41:07+09:00',
    resource_type: 'patient_detail',
    search_term: null,
    staff_name: '김영희',
    patient: P1,
    ...over,
  }
}

function renderRows(rows: AccessLogRow[], onSelectPatient = vi.fn()) {
  render(<LogTable rows={rows} onSelectPatient={onSelectPatient} />)
  return { onSelectPatient }
}

/** 한 종류만 담아 배지 라벨을 읽는다. */
function badgeFor(resource_type: string): string {
  const { unmount } = render(<LogTable rows={[row({ id: 'b', resource_type })]} />)
  const label = screen.getByTestId('log-kind-badge').textContent ?? ''
  unmount()
  return label
}

describe('LogTable /admin/access-logs', () => {
  test('[ALOG-LIST-01][ALOG-LIST-02] 네 열이 「누가·언제·누구의·무엇을」 순서이고 시각은 절대 시각이다', () => {
    renderRows([row({ id: 'r0' })])
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '열람 시각', '열람 직원', '환자', '열람 자료',
    ])
    expect(screen.getByText('2026.08.15 09:41:07')).toBeVisible()
  })

  test('[ALOG-LIST-03] 이름 없는 직원에게 식별자를 지어내지 않고 「직원 정보 없음」으로 두되 행은 보존한다', () => {
    renderRows([row({ id: 'r0', staff_name: null }), row({ id: 'r1' })])
    expect(screen.getByText('직원 정보 없음')).toBeVisible()
    expect(screen.getAllByTestId('log-row')).toHaveLength(2)
  })

  test('[ALOG-LIST-04][MASK-SRV-01] 환자 식별은 서버가 마스킹한 값이고 원본은 화면에 없다', () => {
    renderRows([row({ id: 'r0' })])
    expect(screen.getByRole('button', { name: '홍*동 · 1985-**-01' })).toBeVisible()
    expect(screen.queryByText(/홍길동|1985-03-01|010-0000-5678/)).toBeNull()
  })

  test('[ALOG-LIST-05][ALOG-LIST-06] patient_detail은 「환자정보」, medical_record는 「진료기록」', () => {
    expect(badgeFor('patient_detail')).toBe('환자정보')
    expect(badgeFor('medical_record')).toBe('진료기록')
  })

  test('[ALOG-LIST-07] 모르는 종류가 와도 행을 버리지 않고 raw 식별자도 노출하지 않는다', () => {
    renderRows([row({ id: 'r0', resource_type: 'something_new_v2' })])
    expect(screen.getByText('새 기록 종류 · 확인 필요')).toBeVisible()
    expect(screen.queryByText('something_new_v2')).toBeNull()
    expect(screen.getAllByTestId('log-row')).toHaveLength(1)
  })

  test('[ALOG-LIST-10] 환자 이름을 눌러도 환자 상세로 튀지 않고 patient_id 필터만 요청한다', async () => {
    const { onSelectPatient } = renderRows([row({ id: 'r0' })])
    await userEvent.click(screen.getByRole('button', { name: '홍*동 · 1985-**-01' }))
    expect(onSelectPatient).toHaveBeenCalledWith('p1')
  })

  test('[ALOG-LIST-12][결정17] 병합과 병합 되돌림은 서로 다른 배지이고 열람과 섞지 않는다', () => {
    expect(badgeFor('patient_merge')).toBe('병합')
    expect(badgeFor('patient_merge_undo')).toBe('병합 되돌림')
    expect(badgeFor('patient_merge')).not.toBe('환자정보')
  })

  test('[ALOG-LIST-13][결정22][STAT-AUDIT-02] 환자 없는 관리자 활동은 별도 배지·「해당 없음」으로 보인다', () => {
    expect(badgeFor('stats_drilldown')).toBe('통계 상세 열람')
    expect(badgeFor('stats_export')).toBe('통계 CSV 내보내기')
    renderRows([row({ id: 'r0', resource_type: 'stats_export', patient: null })])
    expect(within(screen.getByTestId('log-row')).getByText('해당 없음')).toBeVisible()
  })

  test('[ALOG-AUDIT-01][SEARCH-LOG-02][결정11] 검색은 「검색」 배지+검색 범위로, 열람과 안 섞고 환자 사건이 아니다', () => {
    renderRows([row({ id: 'r0', resource_type: 'search', search_term: '김 1234', patient: null })])
    const r = screen.getByTestId('log-row')
    expect(within(r).getByTestId('log-kind-badge')).toHaveTextContent('검색')
    expect(r).toHaveTextContent('검색 범위: 전체')
    expect(within(r).queryByText('환자정보')).toBeNull()
  })

  test('[SEARCH-LOG-06] 넓은 검색(조각 하나로 기준 이상)은 ⚠ 배지로 표시한다', () => {
    renderRows([row({ id: 'r0', resource_type: 'search', search_term: '1955', is_wide_search: true, patient: null })])
    expect(within(screen.getByTestId('log-row')).getByText('넓은 검색')).toBeVisible()
  })

  test('[SEARCH-LOG-06] 일반 검색엔 넓은 검색 배지가 없다', () => {
    renderRows([row({ id: 'r0', resource_type: 'search', search_term: '김 1234', is_wide_search: false, patient: null })])
    expect(within(screen.getByTestId('log-row')).queryByText('넓은 검색')).toBeNull()
  })
})
