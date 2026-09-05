import { BASIS_LABEL, type StatsResponse } from '../../api/stats'

// [STAT-MASK-*][STAT-EXPORT-*] CSV 전용 소수 집계 억제(결정21).
//
// ⭐ 화면과 파일이 「일부러 다르다」 — 관리자 화면은 1건짜리 칸까지 전부 공개하고,
//    병원 밖으로 나가는 CSV 파일에서만 k=5 미만을 가린다. 그래서 이 모듈은 화면 렌더
//    경로가 절대 부르지 않는다(StatsPage는 원본 숫자를 그대로 그린다). CSV 버튼만 부른다.

/** 익명성 임계값. 설정으로 빼지 않고 상수로 둔다 — 관리자가 k=1로 낮추면 보호가 무의미해진다. */
export const K_ANONYMITY_THRESHOLD = 5

/** 가려진 칸에 들어가는 글자(막다른 길 방지 — 왜 가렸는지 칸에서도 말한다). */
export const SUPPRESS_LABEL = '소수 인원 보호로 비공개'

/** 파일 첫 줄 안내(STAT-MASK-03) — 값이 화면과 다른 이유를 파일 안에서 설명한다. */
export const SUPPRESS_FILE_NOTE =
  '# 소수 인원 보호로 일부 값이 비공개입니다. 전체 수치는 화면에서 볼 수 있습니다.'

/**
 * 숫자 배열에서 가릴 칸을 정한다. k 미만은 직접 억제하고, 비공개가 정확히 1칸이면 총계로
 * 역산되므로 남은 칸 중 가장 작은 것을 하나 더 가린다(STAT-MASK-02 보완 추론 차단).
 */
function maskFlags(nums: number[], k: number): boolean[] {
  const masked = nums.map((n) => n < k)
  if (masked.filter(Boolean).length === 1) {
    let idx = -1
    let min = Infinity
    nums.forEach((n, i) => {
      if (!masked[i] && n < min) {
        min = n
        idx = i
      }
    })
    if (idx >= 0) masked[idx] = true
  }
  return masked
}

/**
 * [STAT-MASK-01·02] 한 분류 축의 행들에서 유일한 숫자 필드를 억제한다(직접 + 보완).
 * 총계가 함께 나가는 표에 쓴다. 숫자 필드는 가려지면 SUPPRESS_LABEL로 대체된다.
 */
export function suppressForExport<T extends Record<string, unknown>>(
  rows: T[],
  k: number = K_ANONYMITY_THRESHOLD,
): T[] {
  if (rows.length === 0) return []
  const countKey = Object.keys(rows[0]).find((key) => typeof rows[0][key] === 'number')
  if (!countKey) return rows.map((r) => ({ ...r }))
  const masked = maskFlags(
    rows.map((r) => r[countKey] as number),
    k,
  )
  return rows.map((r, i) => ({ ...r, [countKey]: masked[i] ? SUPPRESS_LABEL : r[countKey] })) as T[]
}

/**
 * [STAT-MASK-04] 교차 분류(진료과×의사×시간대) 셀을 CSV용으로 만든다. 각 셀의 `count`를
 * k 기준으로 직접 억제하고 문자열로 굳힌다. 교차 셀은 축이 아니라 개별 칸이라 보완 억제는
 * 하지 않는다(총계 역산 표는 suppressForExport가 맡는다).
 */
export function buildCsvRows<T extends { count: number | string }>(
  rows: T[],
  k: number = K_ANONYMITY_THRESHOLD,
): (Omit<T, 'count'> & { count: string })[] {
  return rows.map((r) => {
    const masked = typeof r.count === 'number' && r.count < k
    return { ...r, count: masked ? SUPPRESS_LABEL : String(r.count) }
  })
}

export interface StatsCsvInput {
  period: { from: string; to: string }
  /** 첫 열 제목 — '진료과' 또는 '의사'. */
  byLabel: string
  rows: { label: string; booked: number; visited: number; no_show: number }[]
}

export interface StatsCsvResult {
  content: string
  rowCount: number
  suppressed: boolean
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * [STAT-EXPORT-01·02] 진료과·의사별 집계 표를 CSV 문자열로 만든다. 각 숫자 열을 축별로
 * 억제하고(직접 + 보완), 비공개가 하나라도 있으면 파일 첫 줄에 이유를 적는다(STAT-MASK-03).
 * 환자 명단(이름·전화·생년월일)은 애초에 담지 않는다 — 집계만 나간다.
 */
export function buildStatsCsv(input: StatsCsvInput): StatsCsvResult {
  const columns: { key: 'booked' | 'visited' | 'no_show'; head: string }[] = [
    { key: 'booked', head: '예약' },
    { key: 'visited', head: '방문' },
    { key: 'no_show', head: '예약 부도' },
  ]
  const k = K_ANONYMITY_THRESHOLD
  const maskedByColumn = new Map<string, boolean[]>()
  for (const col of columns) {
    maskedByColumn.set(
      col.key,
      maskFlags(
        input.rows.map((r) => r[col.key]),
        k,
      ),
    )
  }

  let suppressed = false
  const dataLines = input.rows.map((r, i) => {
    const cells = columns.map((col) => {
      const masked = maskedByColumn.get(col.key)![i]
      if (masked) suppressed = true
      return masked ? SUPPRESS_LABEL : String(r[col.key])
    })
    return [csvField(r.label), ...cells].join(',')
  })

  const lines: string[] = []
  if (suppressed) lines.push(SUPPRESS_FILE_NOTE)
  lines.push(`# 기간: ${input.period.from} ~ ${input.period.to}`)
  lines.push([csvField(input.byLabel), ...columns.map((c) => c.head)].join(','))
  lines.push(...dataLines)

  return { content: lines.join('\n'), rowCount: input.rows.length, suppressed }
}

// ── 전체 집계 CSV(STAT-EXPORT-01) ────────────────────────────────────────────
// 화면에 보이는 모든 집계 구획을 한 파일에 담는다 — 지표 요약·유입원·상담봇·진료과(의사)별·
// 시간대별. ⭐ 종전엔 진료과별 표 하나만 내려가 「예약현황만 나온다」는 지적을 받았다(사용자 2026-08-30).
// k=5 억제는 개인이 좁혀질 수 있는 **차원별 표**(진료과/의사·시간대)에만 걸고, 코스한 총계(요약·유입원
// 합계)는 화면과 같이 원값으로 둔다 — 총계는 가려도 의미가 없고 이미 화면에 다 보인다.

export interface FullStatsCsvInput {
  period: { from: string; to: string }
  stats: StatsResponse
  /** 현재 선택된 분류축 표시명 — '진료과' 또는 '의사'. */
  byLabel: string
  byRows: { label: string; booked: number; visited: number; no_show: number }[]
}

/** 한 차원(라벨→건수)을 셀별 k=5 억제해 CSV 줄로. suppressed 여부를 함께 돌려준다.
 *  ⚠️ 시간대별 방문량은 환자와 연결된 교차표가 아니라 히스토그램이라, 진료과 표의 보완 억제
 *     (총계 역산 차단으로 큰 셀까지 가림)는 쓰지 않는다 — 진짜 작은 셀(<5)만 가린다. */
function dimensionSection(head: [string, string], pairs: [string, number][]): { lines: string[]; suppressed: boolean } {
  let suppressed = false
  const lines = [
    [csvField(head[0]), csvField(head[1])].join(','),
    ...pairs.map(([label, n]) => {
      const masked = n < K_ANONYMITY_THRESHOLD
      if (masked) suppressed = true
      return [csvField(label), masked ? SUPPRESS_LABEL : String(n)].join(',')
    }),
  ]
  return { lines, suppressed }
}

export function buildFullStatsCsv(input: FullStatsCsvInput): StatsCsvResult {
  const { stats: s, period } = input
  const out: string[] = []
  let suppressed = false
  const pct = (n: number) => (s.source_mix.total ? `${Math.round((n / s.source_mix.total) * 100)}%` : '0%')

  // 1) 지표 요약 — 총계라 억제하지 않는다.
  const summary: [string, number, string][] = [
    ['예약', s.source_mix.total, s.source_mix.basis],
    ['취소', s.cancelled.value, s.cancelled.basis],
    ['예약 부도', s.no_show.value, s.no_show.basis],
    ['실제 방문', s.visits.value, s.visits.basis],
    ['평균 대기시간(분)', s.wait.avg_minutes, s.wait.basis],
    [`오래 기다린 사례(${s.wait.threshold_minutes}분 이상)`, s.wait.over_threshold, s.wait.basis],
  ]
  const summaryLines = ['지표,값,기준일', ...summary.map(([label, v, basis]) =>
    [csvField(label), String(v), csvField(BASIS_LABEL[basis] ?? basis)].join(','))]

  // 2) 유입원 — 앱·직원·챗봇 별도(총계라 억제하지 않는다).
  const m = s.source_mix.rows
  const sourceLines = ['유입원,건수,비율',
    ['앱', String(m.app), pct(m.app)].join(','),
    ['직원', String(m.staff), pct(m.staff)].join(','),
    ['챗봇', String(m.chatbot), pct(m.chatbot)].join(','),
    ['합계', String(s.source_mix.total), ''].join(','),
  ]

  // 3) 상담봇 지표 — 계약이 없으면 「집계할 수 없음」(0으로 위장하지 않는다, STAT-METRIC-06).
  const botLines = s.bot == null
    ? ['현재 집계할 수 없음']
    : ['지표,값',
        ['총 문의', String(s.bot.total_inquiries)].join(','),
        ['상담봇 자체 안내', String(s.bot.self_served)].join(','),
        ['직원 연결', String(s.bot.handoff)].join(',')]

  // 4) 진료과/의사별 — k=5 억제(차원별 표). buildStatsCsv를 재사용하되 자체 '# 기간'·안내줄은 빼고
  //    표 본문(헤더+데이터)만 취한다.
  const byTable = buildStatsCsv({ period, byLabel: input.byLabel, rows: input.byRows })
  if (byTable.suppressed) suppressed = true
  const byLines = byTable.content.split('\n').filter((l) => !l.startsWith('#'))

  // 5) 시간대별 방문 — k=5 억제(차원별). 시각 오름차순 + 시간 미기록.
  const hourEntries = Object.entries(s.visits_by_hour.by_hour)
    .map(([h, n]) => [`${String(Number(h)).padStart(2, '0')}시`, n] as [string, number])
    .sort((a, b) => a[0].localeCompare(b[0]))
  const hourPairs: [string, number][] = [...hourEntries]
  if (s.visits_by_hour.unknown_time > 0) hourPairs.push(['시간 미기록', s.visits_by_hour.unknown_time])
  const hourly = dimensionSection(['시각', '방문'], hourPairs)
  if (hourly.suppressed) suppressed = true

  out.push(`# 기간: ${period.from} ~ ${period.to}`)
  out.push('', '# 지표 요약', ...summaryLines)
  out.push('', '# 유입원 (앱·직원·챗봇 별도 집계)', ...sourceLines)
  out.push('', '# 상담봇 지표', ...botLines)
  out.push('', `# ${input.byLabel}별 예약 현황`, ...byLines)
  out.push('', '# 시간대별 방문 (슬롯 시작 시각 기준)', ...hourly.lines)

  const lines = suppressed ? [SUPPRESS_FILE_NOTE, ...out] : out
  return { content: lines.join('\n'), rowCount: input.byRows.length, suppressed }
}
