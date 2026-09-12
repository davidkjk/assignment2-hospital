import { HOSPITAL_TZ } from '../../lib/clock'
import type { AccessLogRow } from '../../api/accessLogs'

// [ALOG-LIST-02][ALOG-GROUP-01] 열람 행의 순수 변환 — 시각 포맷과 대량 묶음 접기.
// 표시층에서만 접는다: 서버는 환자별 전수를 그대로 보내고(저장을 줄이지 않음), 화면이 같은
// 직원·시각·행동의 연속 행을 한 줄로 접는다. 묶음 한 줄만 저장하는 모델은 채택하지 않는다.

/** [ALOG-LIST-02] 병원 시간대 절대 시각 `YYYY.MM.DD HH:mm:ss`. 「3분 전」 같은 상대값으로 안 바꾼다. */
export function formatAccessedAt(iso: string, timeZone: string = HOSPITAL_TZ): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const parts = new Intl.DateTimeFormat('en-CA', { // clock-ok — timeZone을 인자로 받는다
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hour = g('hour') === '24' ? '00' : g('hour') // Intl는 자정을 24로 줄 수 있다
  return `${g('year')}.${g('month')}.${g('day')} ${hour}:${g('minute')}:${g('second')}`
}

/** 같은 묶음 판정용 초 단위 키 — accessed_at을 초까지 자른다(밀리초·표기 차이를 흡수). */
export function secondKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return String(Math.floor(d.getTime() / 1000))
}

export type GroupNode =
  | { kind: 'single'; row: AccessLogRow }
  | {
      kind: 'bulk'
      /** 안정 key — 묶음 첫 행 id. */
      key: string
      staffName: string | null
      accessedAt: string
      children: AccessLogRow[]
    }

// 대량 묶음으로 접을 최소 연속 건수. 1건(단발 [번호 보기])은 접지 않고 한 행으로 남긴다
// (ALOG-AUDIT-02) — 접는 것은 수백·수천 명 대량 열람뿐이다(ALOG-GROUP-01).
const BULK_MIN = 2

/**
 * [ALOG-GROUP-01] 정렬된 행에서 같은 직원·같은 초·`phone_reveal`인 연속 구간을 한 묶음으로 접는다.
 * 나머지는 그대로 single. 3,000행을 표에 그대로 깔지 않는 것이 목적이다.
 */
export function groupRows(rows: AccessLogRow[]): GroupNode[] {
  const out: GroupNode[] = []
  let i = 0
  while (i < rows.length) {
    const row = rows[i]
    if (row.resource_type === 'phone_reveal') {
      const staff = row.staff_name
      const sec = secondKey(row.accessed_at)
      let j = i + 1
      while (
        j < rows.length &&
        rows[j].resource_type === 'phone_reveal' &&
        rows[j].staff_name === staff &&
        secondKey(rows[j].accessed_at) === sec
      ) {
        j += 1
      }
      const run = rows.slice(i, j)
      if (run.length >= BULK_MIN) {
        out.push({ kind: 'bulk', key: row.id, staffName: staff, accessedAt: row.accessed_at, children: run })
        i = j
        continue
      }
    }
    out.push({ kind: 'single', row })
    i += 1
  }
  return out
}
