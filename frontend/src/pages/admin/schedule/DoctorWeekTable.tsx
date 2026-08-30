import { useState, type CSSProperties } from 'react'
import { ApiError } from '../../../api/httpClient'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { btnPrimary, btnGhost } from '../../../components/staff-ui'
import { DirtyDot } from './DirtyDot'
import { ScheduleTimeInput, TIME_FIELD_CLASS } from './ScheduleTimeInput'
import type { DirtyMapApi } from './useDirtyMap'
import { WEEKDAY_FULL, hhmm, type WeekRow } from './types'

// [SCHED-WEEK-*] 의사별 스케줄 = 고치는 곳. 위쪽 의사 가로줄 + 아래 요일 7행(늘 다 보인다, 접지 않는다).
//   한 행 여섯 칸 — 진료 스위치·진료 시간·한 칸 길이·점심시간·하루 최대 인원·예약 마감.
// [SCHED-SAVE-*] 저장은 표 맨 위 하나뿐 · 고친 줄에 ● · 다른 의사로 옮겨도 이름 옆 ● 남음(갭 #106).
//   저장 전 한 번만 경고(영향받는 예약 + 자리 미리보기), 성공하면 ● 사라지고 넘어간 건수를 말해 준다.

/** 저장 전 미리보기(dry-run). 영향받는 예약(어느 요일 때문인지)·자리 증감(SCHED-SLOT-07). */
export interface WeekPreview {
  affected: { weekday: number; count: number }[]
  slotRemoved: number
  slotAdded: number
}

interface Props {
  doctors: { id: string; name: string; department: string | null }[]
  selectedDoctorId: string
  onSelectDoctor: (id: string) => void
  serverWeek: Record<string, WeekRow[]>
  dirty: DirtyMapApi
  focusedWeekday?: number | null
  onPreview: (doctorId: string, rows: WeekRow[]) => Promise<WeekPreview>
  onCommit: (doctorId: string, rows: WeekRow[]) => Promise<{ affected: number }>
}

const COLS = ['진료', '진료 시간', '한 칸 길이', '점심시간', '하루 최대 인원', '예약 마감'] as const

export function DoctorWeekTable({
  doctors,
  selectedDoctorId,
  onSelectDoctor,
  serverWeek,
  dirty,
  focusedWeekday,
  onPreview,
  onCommit,
}: Props) {
  const [preview, setPreview] = useState<WeekPreview | null>(null)
  const [pendingRows, setPendingRows] = useState<WeekRow[]>([])
  const [status, setStatus] = useState<{ affected: number } | null>(null)
  // 저장이 실패하면 이유를 보인다 — 안 그러면 ●만 남고 「눌렀는데 아무 일도 없다」가 된다(G1·프로필과 같은 처방).
  const [actionError, setActionError] = useState<string | null>(null)

  const rows = serverWeek[selectedDoctorId] ?? []
  const curRow = (w: number): WeekRow =>
    dirty.getDraft(selectedDoctorId, w) ?? rows[w] ?? emptyRow(w)

  function edit(w: number, patch: Partial<WeekRow>) {
    setStatus(null)
    setActionError(null)
    dirty.setDraft(selectedDoctorId, w, { ...curRow(w), ...patch })
  }

  function copyMonday() {
    const mon = curRow(0)
    for (let w = 1; w < 7; w++) {
      if (curRow(w).is_day_off) continue // 휴진으로 꺼둔 줄은 건드리지 않는다(SCHED-WEEK-07)
      dirty.setDraft(selectedDoctorId, w, { ...mon, weekday: w, is_day_off: false })
    }
    setStatus(null)
  }

  function collectDirtyRows(): WeekRow[] {
    return dirty.dirtyWeekdays(selectedDoctorId).map((w) => curRow(w))
  }

  async function handleSave() {
    const dirtyRows = collectDirtyRows()
    if (dirtyRows.length === 0) return
    setActionError(null)
    try {
      const result = await onPreview(selectedDoctorId, dirtyRows)
      const needsWarning = result.affected.length > 0 || result.slotRemoved > 0 || result.slotAdded > 0
      if (needsWarning) {
        setPendingRows(dirtyRows)
        setPreview(result) // 한 번만 뜬다 — 영향·자리 미리보기를 한 팝업에 모은다(SCHED-SAVE-04)
      } else {
        await commit(dirtyRows)
      }
    } catch (e) {
      // 저장·미리보기가 실패하면 ●와 값을 그대로 두고 이유만 보인다(막다른 길 대신 이유, 초안 보존).
      setActionError(e instanceof ApiError ? e.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  async function commit(dirtyRows: WeekRow[]) {
    // 확인창의 [그래도 저장]에서도 불린다 — 여기서 던지면 handleSave 밖(확인창 경로)에선
    // 잡을 곳이 없으므로, 실패를 자체 처리해 ●를 남기고 이유를 보인다(G1 — void 삼킴 금지).
    try {
      const result = await onCommit(selectedDoctorId, dirtyRows)
      dirty.reset(selectedDoctorId) // ●가 사라진다(SCHED-SAVE-08)
      setPreview(null)
      setPendingRows([])
      setStatus(result)
      setActionError(null)
    } catch (e) {
      setPreview(null) // 확인창은 닫되, 고친 값·●는 남긴다.
      setActionError(e instanceof ApiError ? e.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  const dirtyCount = dirty.dirtyCount(selectedDoctorId)
  const turnsOffDay = pendingRows.some((r) => r.is_day_off)

  return (
    <div>
      {/* 위쪽 의사 가로줄 (SCHED-WEEK-08·09) */}
      <div role="tablist" aria-label="의사" style={styles.chipRow}>
        {doctors.map((doc) => {
          const active = doc.id === selectedDoctorId
          return (
            <button
              key={doc.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-chip={doc.name}
              onClick={() => onSelectDoctor(doc.id)}
              style={{ ...styles.chip, ...(active ? styles.chipActive : null) }}
            >
              {doc.name}
              {doc.department && <span style={styles.chipDept}>{doc.department}</span>}
              {dirty.dirtyDoctors.includes(doc.id) && <DirtyDot />}
            </button>
          )
        })}
      </div>

      {/* 저장 줄 — 표 맨 위 버튼 하나(SCHED-SAVE-01) */}
      <div style={styles.saveRow}>
        <button type="button" onClick={copyMonday} className={btnGhost}>
          월요일 값을 나머지에
        </button>
        <div style={styles.saveRight}>
          {dirtyCount > 0 && (
            <span style={styles.dirtyNote}>고친 곳 {dirtyCount}군데 · 아직 저장 안 됨</span>
          )}
          <button type="button" onClick={handleSave} className={btnPrimary}>
            저장
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" style={styles.errorNote}>
          {actionError}
        </p>
      )}

      {status && (
        <div role="status" style={styles.statusNote}>
          {status.affected}건은 접수 직원의 「확인 필요한 예약」으로 넘어갔습니다.
          <span data-testid="handoff-target" hidden>
            /today 확인 필요한 예약
          </span>
        </div>
      )}

      <div style={styles.wrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, textAlign: 'left' }}>요일</th>
              {COLS.map((c) => (
                <th key={c} style={styles.th}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_FULL.map((label, w) => {
              const row = curRow(w)
              const off = row.is_day_off
              const isDirty = dirty.isDirty(selectedDoctorId, w)
              return (
                <tr
                  key={label}
                  data-row={label}
                  data-focused={focusedWeekday === w ? 'true' : undefined}
                  style={isDirty ? styles.rowDirty : undefined}
                >
                  <td style={styles.tdLabel}>
                    {label}
                    {isDirty && <DirtyDot />}
                  </td>
                  <td style={styles.td}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!off}
                      aria-label={`${label} 진료 여부`}
                      onClick={() => edit(w, { is_day_off: !off })}
                      style={{ ...styles.toggle, ...(off ? styles.toggleOff : styles.toggleOn) }}
                    >
                      <span style={{ ...styles.knob, ...(off ? styles.knobOff : styles.knobOn) }} />
                    </button>
                  </td>
                  {off ? (
                    <DashCells day={label} />
                  ) : (
                    <>
                      <td style={styles.td}>
                        <ScheduleTimeInput
                          label={`${label} 진료 시작`}
                          value={hhmm(row.start)}
                          onChange={(v) => edit(w, { start: v })}
                        />
                        <span style={styles.tilde}>~</span>
                        <ScheduleTimeInput
                          label={`${label} 진료 종료`}
                          value={hhmm(row.end)}
                          onChange={(v) => edit(w, { end: v })}
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`${label} 한 칸 길이`}
                          data-cell2={`${label}|한 칸 길이`}
                          value={row.slot_minutes ?? ''}
                          onChange={(e) => edit(w, { slot_minutes: numOrNull(e.target.value) })}
                          className={TIME_FIELD_CLASS}
                        />
                        <span style={styles.unit}>분</span>
                      </td>
                      <td style={styles.td}>
                        {row.lunch_start ? (
                          <>
                            <ScheduleTimeInput
                              label={`${label} 점심 시작`}
                              value={hhmm(row.lunch_start)}
                              onChange={(v) => edit(w, { lunch_start: v })}
                            />
                            <span style={styles.tilde}>~</span>
                            <ScheduleTimeInput
                              label={`${label} 점심 끝`}
                              value={hhmm(row.lunch_end)}
                              onChange={(v) => edit(w, { lunch_end: v })}
                            />
                          </>
                        ) : (
                          <span data-cell2={`${label}|점심시간`} style={styles.dash}>
                            —
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`${label} 하루 최대 인원`}
                          data-cell2={`${label}|하루 최대 인원`}
                          value={row.max_daily ?? ''}
                          onChange={(e) => edit(w, { max_daily: numOrNull(e.target.value) })}
                          className={TIME_FIELD_CLASS}
                        />
                        <span style={styles.unit}>명</span>
                      </td>
                      <td style={styles.td}>
                        <ScheduleTimeInput
                          label={`${label} 예약 마감`}
                          value={hhmm(row.booking_deadline)}
                          onChange={(v) => edit(w, { booking_deadline: v })}
                        />
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {preview && (
        <ConfirmDialog
          title="저장하기 전에 확인해 주세요"
          cancelLabel="그만두기"
          confirmLabel={turnsOffDay ? '그래도 휴진 저장' : '그래도 저장'}
          onCancel={() => setPreview(null)}
          onConfirm={() => void commit(pendingRows)}
        >
          {preview.affected.length > 0 && (
            <div style={styles.warnBlock}>
              <p style={styles.warnHead}>영향받는 예약</p>
              <ul style={styles.warnList}>
                {preview.affected.map((a) => (
                  <li key={a.weekday}>
                    {WEEKDAY_FULL[a.weekday]} {a.count}건
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(preview.slotRemoved > 0 || preview.slotAdded > 0) && (
            <p style={styles.slotNote}>
              자리 {preview.slotRemoved}개가 없어지고 {preview.slotAdded}개가 생깁니다
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}

// 휴진 줄 — 나머지 다섯 칸이 전부 잠긴다(회색 —). SCHED-WEEK-04.
function DashCells({ day }: { day: string }) {
  return (
    <>
      {['진료 시간', '한 칸 길이', '점심시간', '하루 최대 인원', '예약 마감'].map((c) => (
        <td key={c} style={styles.td}>
          <span data-cell2={`${day}|${c}`} style={styles.dash}>
            —
          </span>
        </td>
      ))}
    </>
  )
}

function numOrNull(text: string): number | null {
  const digits = text.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

function emptyRow(weekday: number): WeekRow {
  return {
    weekday,
    is_day_off: true,
    start: null,
    end: null,
    slot_minutes: null,
    lunch_start: null,
    lunch_end: null,
    max_daily: null,
    booking_deadline: null,
  }
}

const styles: Record<string, CSSProperties> = {
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    padding: 'var(--sp-1) var(--sp-3)',
    borderRadius: 999,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  chipActive: {
    border: '1px solid var(--color-primary)',
    background: 'var(--color-primary-wash)',
    color: 'var(--color-primary)',
  },
  chipDept: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-caption)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  saveRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' },
  saveRight: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' },
  dirtyNote: { fontSize: 'var(--fs-caption)', color: 'var(--color-warn)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  statusNote: {
    padding: 'var(--sp-2) var(--sp-3)',
    borderRadius: 8,
    background: 'var(--color-primary-wash)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
    marginBottom: 'var(--sp-2)',
  },
  errorNote: {
    margin: '0 0 var(--sp-2)',
    padding: 'var(--sp-2) var(--sp-3)',
    borderRadius: 8,
    borderLeft: '4px solid var(--color-danger)',
    background: 'var(--color-danger-bg)',
    color: 'var(--color-danger)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
  },
  wrap: {
    overflowX: 'auto',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    background: 'var(--color-surface)',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' },
  th: {
    padding: 'var(--sp-2) var(--sp-2)',
    textAlign: 'center',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    color: 'var(--color-ink-muted)',
    borderBottom: '1px solid var(--color-divider)',
    whiteSpace: 'nowrap',
  },
  td: { padding: 'var(--sp-1) var(--sp-2)', borderBottom: '1px solid var(--color-divider)', textAlign: 'center', whiteSpace: 'nowrap' },
  tdLabel: { padding: 'var(--sp-1) var(--sp-2)', borderBottom: '1px solid var(--color-divider)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], whiteSpace: 'nowrap' },
  rowDirty: { background: 'rgba(180,78,0,0.06)' },
  toggle: {
    position: 'relative',
    width: 34,
    height: 20,
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  toggleOn: { background: 'var(--color-primary)' },
  toggleOff: { background: 'var(--color-divider)' },
  knob: { position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .12s' },
  knobOn: { left: 16 },
  knobOff: { left: 2 },
  tilde: { margin: '0 var(--sp-1)', color: 'var(--color-ink-muted)' },
  unit: { marginLeft: 'var(--sp-1)', color: 'var(--color-ink-muted)' },
  dash: { color: 'var(--color-ink-muted)' },
  warnBlock: { marginBottom: 'var(--sp-2)' },
  warnHead: { margin: '0 0 var(--sp-1)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  warnList: { margin: 0, paddingLeft: 'var(--sp-5)', fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  slotNote: { margin: 'var(--sp-1) 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-warn)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
}
