import { describe, expect, test } from 'vitest'
import {
  K_ANONYMITY_THRESHOLD,
  SUPPRESS_LABEL,
  buildCsvRows,
  buildFullStatsCsv,
  buildStatsCsv,
  suppressForExport,
} from './exportCsv'

// ⭐ 화면과 파일이 「일부러 다른」 지점(결정21) — 화면은 전부 공개, CSV만 k=5 억제.
//    이 모듈은 화면 렌더 경로가 절대 부르지 않는다(STAT-MASK-01) — CSV 버튼만 부른다.

describe('exportCsv — CSV 전용 소수 집계 억제', () => {
  test('[STAT-MASK-01] CSV에서만 k=5 미만 셀을 가린다', () => {
    // rows 첫 칸 count=3(<5)은 가려지고 라벨로 바뀐다.
    const out = suppressForExport([{ dept: '피부과', count: 3 }, { dept: '내과', count: 40 }], 5)
    expect(out[0].count).toBe(SUPPRESS_LABEL)
  })

  test('[STAT-MASK-02] 한 칸만 가리면 총계로 역산되므로 가장 작은 칸을 보완 억제한다', () => {
    // 43 - 40 = 3 → 한 칸만 가림은 가린 척일 뿐. 비공개가 1칸이면 하나 더 가려 2칸이 된다.
    const out = suppressForExport([{ d: 'A', c: 3 }, { d: 'B', c: 40 }], 5)
    expect(out.filter((r) => (r.c as unknown) === SUPPRESS_LABEL)).toHaveLength(2)
  })

  test('[STAT-MASK-04] 진료과×의사×시간대 교차 셀도 같은 k 기준으로 억제한다', () => {
    const rows = [
      { dept: '내과', doctor: '박지훈', hour: '10시', count: 3 },
      { dept: '내과', doctor: '박지훈', hour: '11시', count: 7 },
    ]
    const out = buildCsvRows(rows)
    expect(out[0].count).toBe(SUPPRESS_LABEL) // k=5 미만은 교차 셀도 억제
    expect(out[1].count).toBe('7') // 5 이상은 문자열 그대로
  })

  test('[STAT-MASK-03] 비공개가 있으면 파일 첫 줄에 이유를 적는다', () => {
    const { content } = buildStatsCsv({
      period: { from: '2026-08-01', to: '2026-08-15' },
      byLabel: '진료과',
      rows: [{ label: '피부과', booked: 3, visited: 2, no_show: 1 }, { label: '내과', booked: 40, visited: 38, no_show: 5 }],
    })
    expect(content).toMatch(/^# 소수 인원 보호로 일부 값이 비공개입니다\. 전체 수치는 화면에서 볼 수 있습니다\./m)
  })

  test('[STAT-EXPORT-01] 집계만 내보내고 환자 명단(이름·전화)을 붙이지 않는다', () => {
    const { content } = buildStatsCsv({
      period: { from: '2026-08-01', to: '2026-08-15' },
      byLabel: '진료과',
      rows: [{ label: '내과', booked: 40, visited: 38, no_show: 5 }],
    })
    expect(content).not.toMatch(/홍|010-/)
  })

  test('[STAT-EXPORT-02] 비공개 셀이 있으면 결과가 suppressed=true를 밝힌다', () => {
    const result = buildStatsCsv({
      period: { from: '2026-08-01', to: '2026-08-15' },
      byLabel: '진료과',
      rows: [{ label: '피부과', booked: 3, visited: 2, no_show: 1 }, { label: '내과', booked: 40, visited: 38, no_show: 5 }],
    })
    expect(result.suppressed).toBe(true)
    expect(result.rowCount).toBe(2)
  })

  test('[STAT-EXPORT-02] 모든 칸이 k 이상이면 억제하지 않고 안내 줄도 없다', () => {
    const { content, suppressed } = buildStatsCsv({
      period: { from: '2026-08-01', to: '2026-08-15' },
      byLabel: '진료과',
      rows: [{ label: '내과', booked: 40, visited: 38, no_show: 9 }],
    })
    expect(suppressed).toBe(false)
    expect(content).not.toMatch(/소수 인원 보호로/)
  })

  test('k=5는 병원 설정으로 빼지 않고 상수로 둔다', () => {
    // 설정으로 빼면 관리자가 k=1로 낮춰 보호가 무의미해진다(끌 수 없어야 하는 스위치를 만들지 않는다).
    expect(K_ANONYMITY_THRESHOLD).toBe(5)
  })
})

describe('buildFullStatsCsv — 화면에 보이는 집계 전부를 담는다(STAT-EXPORT-01)', () => {
  const base = {
    period: { from: '2026-08-24', to: '2026-08-30' },
    stats: {
      source_mix: { basis: 'created_at', rows: { app: 584, staff: 348, chatbot: 154 }, total: 1086 },
      cancelled: { basis: 'status_changed_at', value: 23 },
      no_show: { basis: 'status_changed_at', value: 26 },
      visits: { basis: 'status_changed_at', value: 262 },
      wait: { basis: 'wait_started_at', avg_minutes: 0, over_threshold: 0, threshold_minutes: 30 },
      visits_by_hour: { basis: 'slot_start_time', by_hour: { '9': 152, '10': 88, '11': 22 }, unknown_time: 0 },
      bot: null,
    },
    byLabel: '진료과',
    byRows: [
      { label: '이비인후과', booked: 276, visited: 69, no_show: 5 },
      { label: '내과', booked: 269, visited: 65, no_show: 10 },
    ],
  }

  test('예약현황(진료과 표)만이 아니라 지표 요약·유입원·상담봇·시간대별 구획을 모두 담는다', () => {
    const { content } = buildFullStatsCsv(base)
    expect(content).toContain('# 지표 요약')
    expect(content).toContain('# 유입원')
    expect(content).toContain('# 상담봇 지표')
    expect(content).toContain('# 진료과별 예약 현황')
    expect(content).toContain('# 시간대별 방문')
    // 지표·유입원 값이 실제로 실린다
    expect(content).toMatch(/예약,1086,생성일 기준/)
    expect(content).toMatch(/앱,584,54%/)
  })

  test('상담봇 계약이 없으면 0으로 위장하지 않고 「집계할 수 없음」으로 적는다(STAT-METRIC-06)', () => {
    const { content } = buildFullStatsCsv(base)
    expect(content).toMatch(/# 상담봇 지표\n현재 집계할 수 없음/)
  })

  test('시간대별은 히스토그램이라 진짜 작은 셀(<5)만 가리고 큰 셀은 보완 억제로 지우지 않는다', () => {
    const withSmall = { ...base, stats: { ...base.stats, visits_by_hour: { basis: 'slot_start_time', by_hour: { '9': 152, '14': 3 }, unknown_time: 0 } } }
    const { content, suppressed } = buildFullStatsCsv(withSmall)
    expect(content).toMatch(/09시,152/) // 큰 셀은 그대로
    expect(content).toMatch(new RegExp(`14시,${SUPPRESS_LABEL}`)) // <5만 가림
    expect(suppressed).toBe(true)
  })

  test('요약 총계·유입원은 코스한 집계라 가리지 않는다', () => {
    const { content } = buildFullStatsCsv(base)
    expect(content).not.toMatch(new RegExp(`예약,${SUPPRESS_LABEL}`))
  })
})
