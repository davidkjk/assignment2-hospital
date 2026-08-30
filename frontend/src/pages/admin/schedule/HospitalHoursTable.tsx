import { useRef, useState, type CSSProperties } from 'react'
import { InlineError } from '../../../components/InlineError'
import { Checkbox, btnPrimary, btnGhost, TextButton } from '../../../components/staff-ui'
import { PanelCard } from './PanelCard'
import { ScheduleTimeInput, TIME_FIELD_CLASS } from './ScheduleTimeInput'
import { WEEKDAY_FULL, hhmm, type HospitalHoursRow } from './types'

// [SCHED-HOURS-*] 병원 요일별 운영시간 = 접수 창구가 열려 있는 시간(의사 진료시간과 다르다).
//   상담봇의 "지금 문 열었나" 판정이 이 값을 본다. ⛔ 의사 점심과 자동 계산하지 않는다(HOURS-05).
//   잘못된 시각은 인라인 오류이고 저장 버튼을 비활성으로 만들지 않는다(HOURS-11, 왜 안 눌리는지 모르는 버튼 금지).
//   운영시간을 줄여 의사와 어긋나도 막지 않고 팝업도 안 띄운다 — 표 아래 상시 한 줄(HOURS-17).
//     그 줄은 저장된 값 기준이다(HOURS-17k) — 입력 중인 값으로 실시간 계산하지 않는다.

/** 저장된 값 기준으로 계산된 「운영시간 < 의사 진료시간」 어긋남(HOURS-17g·17i). */
export interface HoursMismatch {
  weekday: number
  doctorEndLabel: string // "18:00"
  hoursEndLabel: string // "13:00"
  doctorNames: string[]
  firstDoctorId: string
}

interface Props {
  hours: HospitalHoursRow[] // 7
  mismatch: HoursMismatch | null
  onSave: (rows: HospitalHoursRow[]) => Promise<{ conflict?: boolean }>
  onRefetch: () => void
  onGoToWeekly: (doctorId: string) => void
}

type FieldErrors = Record<number, { close?: string; lunch?: string }>

function validateRow(r: HospitalHoursRow): { close?: string; lunch?: string } {
  if (r.is_closed || !r.open_time || !r.close_time) return {}
  const errs: { close?: string; lunch?: string } = {}
  if (r.close_time <= r.open_time) errs.close = '닫는 시간이 여는 시간보다 이릅니다'
  if (r.lunch_start && r.lunch_end) {
    if (r.lunch_start < r.open_time || r.lunch_end > r.close_time) {
      errs.lunch = '점심시간이 문 여는 시간 밖에 있습니다'
    }
  }
  return errs
}

export function HospitalHoursTable({ hours, mismatch, onSave, onRefetch, onGoToWeekly }: Props) {
  const [rows, setRows] = useState<HospitalHoursRow[]>(hours)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function patch(w: number, up: Partial<HospitalHoursRow>) {
    setRows((prev) => prev.map((r) => (r.weekday === w ? { ...r, ...up } : r)))
  }

  function copyMonday() {
    const mon = rows[0]
    setRows((prev) =>
      prev.map((r) =>
        r.weekday >= 1 && r.weekday <= 5 // 화~토(일요일=휴무만 제외, SCHED-HOURS-12 — 병원 월~토 진료)
          ? { ...r, open_time: mon.open_time, close_time: mon.close_time, lunch_start: mon.lunch_start, lunch_end: mon.lunch_end, is_closed: mon.is_closed }
          : r,
      ),
    )
  }

  async function handleSave() {
    const nextErrors: FieldErrors = {}
    for (const r of rows) {
      const e = validateRow(r)
      if (e.close || e.lunch) nextErrors[r.weekday] = e
    }
    setErrors(nextErrors)
    const firstBad = rows.find((r) => nextErrors[r.weekday])
    if (firstBad) {
      const field = nextErrors[firstBad.weekday].close ? 'close' : 'lunch'
      inputRefs.current[`${firstBad.weekday}-${field}`]?.focus() // 오류 난 칸으로 이동(HOURS-11)
      return
    }
    setSaving(true)
    setConflict(false)
    try {
      const result = await onSave(rows)
      if (result.conflict) {
        setConflict(true)
        onRefetch() // 409 → 자동 재조회(HOURS-14)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <PanelCard title="병원 운영시간">
      {conflict && (
        <div style={styles.bannerWrap}>
          <div role="status" style={styles.banner}>
            다른 관리자가 먼저 저장해 최신 값을 다시 불러왔습니다. 확인 후 다시 저장해 주세요.
          </div>
        </div>
      )}

      <div style={styles.tableScroll}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, textAlign: 'left', paddingLeft: 'var(--sp-4)' }}>요일</th>
            <th style={styles.th}>휴무</th>
            <th style={styles.th}>여는 시간</th>
            <th style={styles.th}>닫는 시간</th>
            <th style={{ ...styles.th, ...styles.lastColPad }}>점심시간</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const full = WEEKDAY_FULL[r.weekday]
            const err = errors[r.weekday]
            const lunchOff = !r.lunch_start && !r.lunch_end
            return (
              <tr key={r.weekday} data-hours-row={WEEKDAY_FULL[r.weekday].slice(0, 1)}>
                <td style={styles.tdLabelPad}>{full}</td>
                <td style={styles.td}>
                  <Checkbox
                    ariaLabel={`${full} 휴무`}
                    checked={r.is_closed}
                    onChange={(v) => patch(r.weekday, { is_closed: v })}
                  />
                </td>
                {r.is_closed ? (
                  <td colSpan={3} style={{ ...styles.closedCell, ...styles.lastColPad }}>
                    ── 휴무일 ──
                  </td>
                ) : (
                  <>
                    <td style={styles.td}>
                      <input
                        ref={(el) => (inputRefs.current[`${r.weekday}-open`] = el)}
                        type="text"
                        inputMode="numeric"
                        aria-label={`${full} 시작`}
                        value={hhmm(r.open_time)}
                        onChange={(e) => patch(r.weekday, { open_time: fmt(e.target.value) })}
                        className={TIME_FIELD_CLASS}
                      />
                    </td>
                    <td style={styles.td}>
                      <input
                        ref={(el) => (inputRefs.current[`${r.weekday}-close`] = el)}
                        type="text"
                        inputMode="numeric"
                        aria-label={`${full} 종료`}
                        value={hhmm(r.close_time)}
                        onChange={(e) => patch(r.weekday, { close_time: fmt(e.target.value) })}
                        className={TIME_FIELD_CLASS}
                      />
                      {err?.close && (
                        <div data-testid={`err-${full}-종료`}>
                          <InlineError message={err.close} />
                        </div>
                      )}
                    </td>
                    <td style={{ ...styles.td, ...styles.lastColPad }}>
                      <span style={styles.lunchToggle}>
                        <Checkbox
                          ariaLabel={`${full} 점심 있음`}
                          checked={!lunchOff}
                          onChange={(checked) =>
                            patch(r.weekday, checked ? { lunch_start: '12:00', lunch_end: '13:00' } : { lunch_start: null, lunch_end: null })
                          }
                        />
                        {lunchOff ? (
                          <span style={styles.dash}>—</span>
                        ) : (
                          <>
                            <ScheduleTimeInput label={`${full} 점심 시작`} value={hhmm(r.lunch_start)} onChange={(v) => patch(r.weekday, { lunch_start: v })} />
                            <span style={styles.tilde}>~</span>
                            <ScheduleTimeInput label={`${full} 점심 끝`} value={hhmm(r.lunch_end)} onChange={(v) => patch(r.weekday, { lunch_end: v })} />
                          </>
                        )}
                      </span>
                      {err?.lunch && (
                        <div data-testid={`err-${full}-점심`}>
                          <InlineError message={err.lunch} />
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      <div style={styles.footer}>
        <p style={styles.infoNote}>
          ⓘ 의사별 진료시간은 「의사별 스케줄」에서 따로 정합니다. 이 값은 접수 창구가 열려 있는 시간입니다.
        </p>

        <div style={styles.actions}>
          <button type="button" onClick={copyMonday} className={btnGhost}>
            월요일 값을 나머지에
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className={btnPrimary}>
            저장
          </button>
        </div>

        {mismatch && (
          <p data-testid="mismatch-note" style={styles.mismatch}>
            {WEEKDAY_FULL[mismatch.weekday]} {mismatch.doctorEndLabel}까지 진료하는 의사가 {mismatch.doctorNames.length}명 있습니다 —
            상담봇은 {mismatch.hoursEndLabel} 이후 「진료시간이 아닙니다」라고 답합니다.{' '}
            <span style={styles.mismatchNames}>{mismatch.doctorNames.join(' · ')}</span>{' '}
            <TextButton onClick={() => onGoToWeekly(mismatch.firstDoctorId)}>
              의사별 스케줄에서 보기 ›
            </TextButton>
          </p>
        )}
      </div>
    </PanelCard>
  )
}

/** "0900"→"09:00" (테이블 자체 텍스트 인풋용 — ScheduleTimeInput과 같은 규칙). */
function fmt(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`
}

const styles: Record<string, CSSProperties> = {
  bannerWrap: { padding: 'var(--sp-4) var(--sp-4) 0' },
  banner: {
    padding: 'var(--sp-3) var(--sp-4)',
    borderRadius: 8,
    background: 'var(--color-danger-bg)',
    color: 'var(--color-danger)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
  },
  tableScroll: { overflowX: 'auto' },
  footer: { padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' },
  th: { padding: 'var(--sp-2)', textAlign: 'center', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)', borderBottom: '1px solid var(--color-divider)' },
  td: { padding: 'var(--sp-2)', borderBottom: '1px solid var(--color-divider)', textAlign: 'center' },
  tdLabel: { padding: 'var(--sp-2)', borderBottom: '1px solid var(--color-divider)', fontWeight: 'var(--fw-body)' as CSSProperties['fontWeight'] },
  tdLabelPad: { padding: 'var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4)', borderBottom: '1px solid var(--color-divider)', fontWeight: 'var(--fw-body)' as CSSProperties['fontWeight'] },
  lastColPad: { paddingRight: 'var(--sp-4)' },
  closedCell: { padding: 'var(--sp-2)', borderBottom: '1px solid var(--color-divider)', textAlign: 'center', color: 'var(--color-ink-muted)' },
  lunchToggle: { display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' },
  tilde: { margin: '0 var(--sp-0-5)', color: 'var(--color-ink-muted)' },
  dash: { color: 'var(--color-ink-muted)' },
  infoNote: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  actions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  mismatch: { margin: 0, padding: 'var(--sp-3) var(--sp-4)', borderRadius: 8, background: 'var(--color-done-bg)', fontSize: 'var(--fs-body)', color: 'var(--color-ink)', lineHeight: 1.5 },
  mismatchNames: { fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
}
