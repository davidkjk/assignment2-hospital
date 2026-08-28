import { useState, type CSSProperties } from 'react'
import { hospitalHHMM, hospitalInstant } from '../../lib/clock'
import { ApiError } from '../../api/httpClient'
import { createPhoneAppointment } from '../../api/calendar'
import { searchPatients as searchPatientsApi } from '../../api/patients'
import { BusyButton } from '../../components/BusyButton'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { InlineError } from '../../components/InlineError'
import { GapWarningDialog } from './GapWarningDialog'
import { nextEndAt, overlapWith, snapTo5min, type CalendarBusy } from './snap'
import type { GridDoctor } from './gridModel'

// [CAL-BOOK-*] 전화 예약 — 오른쪽 패널에 환자·의사·날짜·시간·사유가 위에서 아래로.
//   ⛔ 모달 아님(PANEL-USE-01). ⚠️ Task 9는 WalkinVisitTimePicker만 만들었고 WalkInPanel은 없다 —
//   그래서 환자 찾기·의사 고르기 UI를 여기서 자체 구축한다(공통 추출은 Task 24 소관).
//   시각은 캘린더에서 5분 단위로 찍는다는 점만 워크인과 다르다.

export interface BookingPatient {
  id: string
  name: string
}

export interface PhoneBookingPanelProps {
  doctors: GridDoctor[]
  initial?: { patient?: BookingPatient; doctorId?: string; date?: string; time?: string }
  /** 겹침 계산에 쓰는 그 의사·그 날의 기존 예약(CAL-GAP-09). */
  busyFor?: (doctorId: string, date: string) => CalendarBusy[]
  searchPatientsFn?: (q: string) => Promise<Array<{ id: string; name: string; birth?: string }>>
  createFn?: typeof createPhoneAppointment
  onSaved?: (appointmentId: string) => void
  /** 주간에서 왔을 때 [이 날 시간 고르기] — 일간으로 옮겨 시각을 찍게 한다(CAL-WEEK-10). */
  onPickTimeOnCalendar?: () => void
}

/** 병원 시각을 못박아 보낸다(`TIME-TZ-01`) — 오프셋 없는 문자열은 서버 설정에 기댄다. */
function toStartAt(date: string, time: string): string {
  return hospitalInstant(date, Number(time.slice(0, 2)), Number(time.slice(3, 5))).toISOString()
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export function PhoneBookingPanel({
  doctors,
  initial,
  busyFor,
  searchPatientsFn = defaultSearch,
  createFn = createPhoneAppointment,
  onSaved,
  onPickTimeOnCalendar,
}: PhoneBookingPanelProps) {
  const [patient, setPatient] = useState<BookingPatient | null>(initial?.patient ?? null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string; birth?: string }>>([])
  const [doctorId, setDoctorId] = useState(initial?.doctorId ?? '')
  const [date, setDate] = useState(initial?.date ?? '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [reason, setReason] = useState('')

  const [timeError, setTimeError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [gapWarn, setGapWarn] = useState<{ slotMinutes: number; gapMinutes: number; overlap: { patientLabel: string; startLabel: string; minutes: number } } | null>(null)
  const [raceMsg, setRaceMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const doctor = doctors.find((d) => d.id === doctorId) ?? null
  const slotMinutes = doctor?.slotMinutes ?? 15

  async function runSearch(q: string) {
    setQuery(q)
    if (!q.trim()) {
      setResults([])
      return
    }
    setResults(await searchPatientsFn(q))
  }

  /** [CAL-GAP-05] 저장 직전 — 겹치면 경고, 아니면 재확인. */
  function attemptSave() {
    setRaceMsg(null)
    setError(null)
    if (!time) {
      setTimeError('시간을 고르세요') // CAL-RACE-06
      return
    }
    setTimeError(null)
    const start = new Date(toStartAt(date, time))
    const end = nextEndAt(start, slotMinutes)
    const busy = busyFor?.(doctorId, date) ?? []
    const ov = overlapWith(start, end, busy)
    if (ov) {
      const other = busy.find((b) => b.appointmentId === ov.appointmentId)
      const gapMinutes = other ? Math.round((other.startAt.getTime() - start.getTime()) / 60000) : 0
      setGapWarn({
        slotMinutes,
        gapMinutes,
        overlap: {
          patientLabel: ov.patientLabel,
          startLabel: other ? hospitalHHMM(other.startAt) : '',
          minutes: ov.minutes,
        },
      })
      return
    }
    setConfirming(true)
  }

  async function doSave(allowOverlap: boolean) {
    setConfirming(false)
    setGapWarn(null)
    if (!patient) {
      setError('환자를 먼저 고르세요')
      return
    }
    try {
      const res = await createFn({
        patient_id: patient.id,
        doctor_id: doctorId,
        start_at: toStartAt(date, time),
        reason,
        allow_overlap: allowOverlap,
      })
      onSaved?.(res.appointment_id)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // [CAL-RACE-03·04·07] 패널은 그대로, 시간 칸만 비운다. ⛔ 「새로고침」·서버 문구를 쓰지 않는다.
        setTime('')
        setRaceMsg('방금 다른 직원이 이 자리를 잡았습니다')
        return
      }
      setError(e instanceof Error ? e.message : '예약을 저장하지 못했습니다')
    }
  }

  return (
    <div className="cal-booking-panel">
      <h2 className="cal-panel-title">전화 예약</h2>

      {/* 환자 */}
      <label className="cal-field">
        <span className="cal-field-label">환자</span>
        {patient ? (
          <input aria-label="환자" value={patient.name} readOnly />
        ) : (
          <input aria-label="환자" placeholder="이름·전화번호로 찾기" value={query} onChange={(e) => runSearch(e.target.value)} />
        )}
      </label>
      {!patient && results.length > 0 && (
        <ul className="cal-patient-results" data-testid="patient-results">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setPatient({ id: r.id, name: r.name })}>
                {r.name}
                {r.birth ? ` · ${r.birth}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 의사 */}
      <label className="cal-field">
        <span className="cal-field-label">의사</span>
        <select aria-label="의사" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">선택</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.departmentName ? `${d.departmentName} / ${d.name}` : d.name}
            </option>
          ))}
        </select>
      </label>

      {/* 날짜 */}
      <label className="cal-field">
        <span className="cal-field-label">날짜</span>
        <input aria-label="날짜" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      {/* 시간 */}
      <label className="cal-field">
        <span className="cal-field-label">시간</span>
        <input
          aria-label="시간"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onBlur={(e) => {
            // 직접 입력해도 5분 격자에 붙인다(CAL-TIME-03) — 화면과 서버가 같은 규칙.
            if (e.target.value && date) {
              const snapped = snapTo5min(new Date(toStartAt(date, e.target.value)))
              setTime(hospitalHHMM(snapped))
            }
          }}
        />
      </label>
      {timeError && <p className="cal-field-error" data-testid="time-error">{timeError}</p>}
      {raceMsg && <p className="cal-race-msg" role="status">{raceMsg}</p>}

      {/* 사유 */}
      <label className="cal-field">
        <span className="cal-field-label">사유</span>
        <input aria-label="사유" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>

      {onPickTimeOnCalendar && !time && (
        <button type="button" onClick={onPickTimeOnCalendar}>
          이 날 시간 고르기
        </button>
      )}

      {error && <InlineError message={error} />}

      <div className="cal-panel-actions">
        <BusyButton label="예약 저장" busyLabel="저장 중…" onClick={attemptSave} />
      </div>

      {confirming && (
        <ConfirmDialog
          title="이 내용으로 예약할까요?"
          confirmLabel="예약"
          cancelLabel="다시 보기"
          onConfirm={() => void doSave(false)}
          onCancel={() => setConfirming(false)}
        />
      )}
      {gapWarn && (
        <GapWarningDialog
          slotMinutes={gapWarn.slotMinutes}
          gapMinutes={gapWarn.gapMinutes}
          overlap={gapWarn.overlap}
          onCancel={() => setGapWarn(null)}
          onProceed={() => void doSave(true)}
        />
      )}
    </div>
  )
}

async function defaultSearch(q: string): Promise<Array<{ id: string; name: string; birth?: string }>> {
  // searchPatients는 이제 커서 페이지({rows,…})를 준다(24a 계약). 이 임시 검색은 첫 페이지만 쓴다.
  // ⚠️ 후속(Task 14): 이 defaultSearch를 <PatientSearch mode="pick">로 대체한다(SEARCH-BOX-03).
  const page = await searchPatientsApi(q)
  return page.rows.map((r) => ({
    id: r.patient_id,
    name: r.name,
    birth: r.masked_birth_date,
  }))
}

// 스타일은 tokens.css 변수만 — 하드코딩 hex 금지(frontend-design).
export const bookingPanelStyles: Record<string, CSSProperties> = {}
