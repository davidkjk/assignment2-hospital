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
