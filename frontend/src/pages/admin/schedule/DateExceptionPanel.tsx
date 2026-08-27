import { useState, type CSSProperties } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ScheduleTimeInput } from './ScheduleTimeInput'
import type { DateException } from './types'

// [SCHED-EXC-*] 특정 날짜 변경 = 왼쪽 월간 달력 + 오른쪽 그 날 목록.
//   ⛔ 정기 휴진(일요일 등)은 달력에 표시하지 않는다(EXC-02) — 그건 그 날만의 변경이 아니라 평상시 규칙.
//   두 갈래: 병원 전체 / 의사 고르기(여러 명 체크, EXC-03·05). 이미 정기 휴진인 의사는 회색으로 못 고른다(EXC-06).
//   담는 것은 종일 휴진·진료 시간 변경 둘뿐(EXC-08). 그날만 점심 옮기기는 없다(갭 #94 해소).
//   겹치면 좁은 쪽(의사별)이 이기고 덮였다는 사실이 보인다(EXC-09·11).
//   저장 전 경고는 SCHED-WARN-*을 그대로 쓰고 0건이면 안 뜬다(EXC-15).

interface CalendarDay {
  date: string // "2026-08-17"
  label: string // 일(day number)
  inMonth: boolean
  hasException: boolean // 등록된 변경이 있는 날만 ●(EXC-02)
}

interface PanelDoctor {
  id: string
  name: string
  regularDayOff: boolean // 그 요일이 정기 휴진 → 회색, 못 고름(EXC-06)
  appointmentCount: number // 그 날 예약 건수(EXC-07)
}

export interface SaveExceptionInput {
  scope: 'hospital' | 'doctor'
  doctorIds: string[]
  type: 'closed' | 'time'
  memo: string
  overrideStart: string
  overrideEnd: string
}

interface Props {
  monthLabel: string
  calendarDays: CalendarDay[]
  selectedDate: string
  onSelectDate: (date: string) => void
  dayDoctors: PanelDoctor[]
  dayExceptions: DateException[]
  onSave: (input: SaveExceptionInput) => Promise<{ affected: number }>
  onRevert: (exceptionId: string) => Promise<void>
}

const HOSPITAL_MEMO_DEFAULT = '병원 지정 휴무일'

export function DateExceptionPanel({
  monthLabel,
  calendarDays,
  selectedDate,
  onSelectDate,
  dayDoctors,
  dayExceptions,
  onSave,
  onRevert,
}: Props) {
  const [scope, setScope] = useState<'hospital' | 'doctor'>('hospital')
  const [checked, setChecked] = useState<string[]>([])
  const [type, setType] = useState<'closed' | 'time'>('closed')
  const [memo, setMemo] = useState(HOSPITAL_MEMO_DEFAULT)
  const [overrideStart, setOverrideStart] = useState('09:00')
  const [overrideEnd, setOverrideEnd] = useState('13:00')
  const [warnAffected, setWarnAffected] = useState<number | null>(null)

  const affectedTotal = dayExceptions.reduce((sum, e) => sum + e.affected_count, 0)
  const hospitalClosedThatDay = dayExceptions.some((e) => e.scope === 'hospital' && e.is_closed)
  const anyDoctorOverride = dayExceptions.some((e) => e.scope === 'doctor' && !e.is_closed)

  function toggle(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSave() {
    const input: SaveExceptionInput = {
      scope,
      doctorIds: scope === 'doctor' ? checked : [],
      type,
      memo,
      overrideStart,
      overrideEnd,
    }
    const res = await onSave(input)
    if (res.affected > 0) setWarnAffected(res.affected) // 0건이면 안 뜬다(EXC-15)
  }

  return (
    <div style={styles.wrap}>
      {/* 왼쪽 월간 달력 */}
      <div style={styles.calendar}>
        <div style={styles.calHead}>{monthLabel}</div>
        <div style={styles.calGrid}>
          {calendarDays.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelectDate(d.date)}
              aria-pressed={d.date === selectedDate}
              style={{
                ...styles.calDay,
                ...(d.inMonth ? null : styles.calDayMuted),
                ...(d.date === selectedDate ? styles.calDaySel : null),
              }}
            >
              {d.label}
              {d.hasException && <span data-cal-dot={d.date} style={styles.calDot} />}
            </button>
          ))}
        </div>
      </div>

      {/* 오른쪽 그 날 바뀐 것 + 새로 넣기 */}
      <div style={styles.right}>
        <h3 style={styles.rightHead}>{selectedDate}</h3>
        <p data-testid="affected-count" hidden>
          {affectedTotal}
        </p>

        {/* 이미 등록된 변경 */}
        {dayExceptions.length > 0 && (
          <>
            <ul style={styles.entryList}>
              {dayExceptions.map((e) => (
                <li
                  key={e.id}
                  data-entry-date={e.exception_date}
                  data-hospital-row={e.scope === 'hospital' ? 'true' : undefined}
                  data-doctor-row={e.scope === 'doctor' ? e.doctor_name ?? undefined : undefined}
                  style={styles.entry}
                >
                  <span>
                    {e.scope === 'hospital'
                      ? `${e.memo ?? '병원 전체 휴무'}${anyDoctorOverride ? ' — 아래에서 덮인 사람 있음' : ''}`
                      : e.is_closed
                        ? `${e.doctor_name} 종일 휴진`
                        : hospitalClosedThatDay
                          ? `${e.doctor_name} — 병원 휴무일이지만 이 사람은 나온다`
                          : `${e.doctor_name} 진료 시간 변경`}
                    {e.affected_count > 0 && <span style={styles.entryMeta}> · 예약 {e.affected_count}건</span>}
                  </span>
                  <button type="button" style={styles.ghostBtn} onClick={() => void onRevert(e.id)}>
                    되돌리기
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* 새로 넣기 */}
        <fieldset style={styles.field}>
          <legend style={styles.legend}>누가 쉬나</legend>
          <label style={styles.radio}>
            <input type="radio" name="exc-scope" checked={scope === 'hospital'} onChange={() => setScope('hospital')} />
            병원 전체
          </label>
          <label style={styles.radio}>
            <input type="radio" name="exc-scope" checked={scope === 'doctor'} onChange={() => setScope('doctor')} />
            의사 고르기
          </label>
        </fieldset>

        {scope === 'hospital' ? (
          <label style={styles.memoRow}>
            메모
            <input aria-label="메모" value={memo} onChange={(e) => setMemo(e.target.value)} style={styles.input} />
          </label>
        ) : (
          <div style={styles.doctorPick}>
            <button type="button" style={styles.ghostBtn} onClick={() => setChecked(dayDoctors.filter((d) => !d.regularDayOff).map((d) => d.id))}>
              전체 선택
            </button>
            <ul style={styles.doctorList}>
              {dayDoctors.map((d) => (
                <li key={d.id} data-doctor-row={d.name} style={styles.doctorRow}>
                  <label style={styles.radio}>
                    <input
                      type="checkbox"
                      aria-label={d.name}
                      disabled={d.regularDayOff}
                      checked={checked.includes(d.id)}
                      onChange={() => toggle(d.id)}
                    />
                    {d.name}
                  </label>
                  <span style={styles.entryMeta}>예약 {d.appointmentCount}건</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <fieldset style={styles.field}>
          <legend style={styles.legend}>무엇을 바꾸나</legend>
          <label style={styles.radio}>
            <input type="radio" name="exc-type" checked={type === 'closed'} onChange={() => setType('closed')} />
            종일 휴진
          </label>
          <label style={styles.radio}>
            <input type="radio" name="exc-type" checked={type === 'time'} onChange={() => setType('time')} />
            진료 시간 변경
          </label>
          {type === 'time' && (
            <div style={styles.timeRow}>
              <ScheduleTimeInput label="변경 시작" value={overrideStart} onChange={setOverrideStart} />
              <span style={styles.tilde}>~</span>
              <ScheduleTimeInput label="변경 종료" value={overrideEnd} onChange={setOverrideEnd} />
            </div>
          )}
        </fieldset>

        <button type="button" onClick={handleSave} style={styles.primaryBtn}>
          저장
        </button>
      </div>

      {warnAffected !== null && (
        <ConfirmDialog
          title="이 날짜 변경으로 영향받는 예약이 있습니다"
          message={`영향받는 예약 ${warnAffected}건이 「확인 필요한 예약」으로 넘어갑니다.`}
          cancelLabel="그만두기"
          confirmLabel="그래도 저장"
          onCancel={() => setWarnAffected(null)}
          onConfirm={() => setWarnAffected(null)}
        />
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  calendar: { flex: '0 0 260px', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)', padding: 10, background: 'var(--color-surface)' },
  calHead: { fontWeight: 700, fontSize: 'var(--fs-base)', marginBottom: 8, color: 'var(--color-ink)' },
  calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
  calDay: {
    position: 'relative',
    aspectRatio: '1',
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    fontSize: 'var(--fs-sm)',
    color: 'var(--color-ink)',
    cursor: 'pointer',
  },
  calDayMuted: { color: 'var(--color-gray-past)' },
  calDaySel: { background: 'var(--color-primary-wash)', color: 'var(--color-primary)', fontWeight: 700 },
  calDot: { position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 5, height: 5, borderRadius: '50%', background: 'var(--color-primary)' },
  right: { flex: 1, minWidth: 0 },
  rightHead: { margin: '0 0 10px', fontSize: 'var(--fs-lg)', color: 'var(--color-ink)' },
  entryList: { listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  entry: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--color-divider)', borderRadius: 8, fontSize: 'var(--fs-base)', color: 'var(--color-ink)' },
  entryMeta: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  field: { border: '1px solid var(--color-divider)', borderRadius: 8, padding: 10, marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 12 },
  legend: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)', padding: '0 4px' },
  radio: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-base)', color: 'var(--color-ink)' },
  memoRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 'var(--fs-base)' },
  input: { flex: 1, height: 30, padding: '0 8px', borderRadius: 6, border: '1px solid var(--color-divider)', fontSize: 'var(--fs-base)', color: 'var(--color-ink)' },
  doctorPick: { marginBottom: 10 },
  doctorList: { listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  doctorRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  timeRow: { display: 'flex', alignItems: 'center', gap: 4, width: '100%' },
  tilde: { color: 'var(--color-ink-muted)' },
  ghostBtn: { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)', cursor: 'pointer' },
  primaryBtn: { padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer' },
}
