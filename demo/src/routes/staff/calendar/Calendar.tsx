import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from '@/components/icons'
import { maskBirth, maskPhone } from '../mockData'
import { PageHead, Panel, SearchInput, StaffPage, StatusBadge, btnGhost, btnPrimary } from '../_ui'
import {
  bookingPatients,
  calendarAppointments,
  calendarDoctors,
  calendarTimes,
  type CalendarAppointment,
} from './mockData'

// 예약 캘린더 (/calendar) — CAL-* · SUPPORT-CAL-*.
// 최상위: data-testid="staff-calendar". 일간 시간행×의사열, 예약/전화예약 사이드패널, 확정 확인창.

type PanelState =
  | { kind: 'detail'; appointment: CalendarAppointment }
  | { kind: 'booking'; doctorId: string; time: string }

type ConfirmState = {
  title: string
  body: string
  confirmLabel: string
}

const inputClass =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'

export function Calendar() {
  const [department, setDepartment] = useState('전체')
  const [selectedDoctors, setSelectedDoctors] = useState(calendarDoctors.map((doctor) => doctor.id))
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [patientQuery, setPatientQuery] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)

  const departmentDoctors = calendarDoctors.filter(
    (doctor) => department === '전체' || doctor.department === department,
  )
  const visibleDoctors = departmentDoctors.filter((doctor) => selectedDoctors.includes(doctor.id))
  const allVisible = departmentDoctors.every((doctor) => selectedDoctors.includes(doctor.id))
  const normalizedQuery = patientQuery.replace(/[-.\s]/g, '')
  const patientResults = useMemo(() => {
    if (!patientQuery.trim()) return []
    return bookingPatients.filter((patient) => {
      const haystack = `${patient.name}${patient.birth}${patient.phone}`.replace(/[-.\s]/g, '')
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery, patientQuery])

  const openBooking = (doctorId = calendarDoctors[0].id, time = '') => {
    setPatientQuery('')
    setSelectedPatientId(null)
    setPanel({ kind: 'booking', doctorId, time })
  }

  const toggleDoctor = (doctorId: string) => {
    setSelectedDoctors((current) => {
      if (current.includes(doctorId)) {
        const next = current.filter((id) => id !== doctorId)
        return next.length === 0 ? current : next
      }
      return [...current, doctorId]
    })
  }

  return (
    <StaffPage testid="staff-calendar" max="max-w-[1500px]">
      <PageHead
        title="예약 캘린더"
        sub="시간을 가로로 훑어 의사별 빈 시간을 찾습니다"
        action={
          <button className={btnPrimary} onClick={() => openBooking()}>
            <CalendarPlus className="h-4 w-4" />
            전화 예약
          </button>
        }
      />

      <Panel className="mb-3" pad="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-lg border border-border bg-card">
            <button aria-label="이전 날" className="p-2 hover:bg-muted">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="border-x border-border px-3 py-2 text-sm font-semibold">오늘 · 8월 22일 (토)</button>
            <button aria-label="다음 날" className="p-2 hover:bg-muted">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">진료과</span>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
            >
              {['전체', '내과', '정형외과'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedDoctors(departmentDoctors.map((doctor) => doctor.id))}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                allVisible ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              전체
            </button>
            {departmentDoctors.map((doctor) => {
              const active = selectedDoctors.includes(doctor.id)
              return (
                <button
                  key={doctor.id}
                  onClick={() => toggleDoctor(doctor.id)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                  {doctor.name}
                </button>
              )
            })}
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs">
            <button className="rounded-md bg-card px-3 py-1.5 font-medium shadow-sm">일간</button>
            <button className="px-3 py-1.5 text-muted-foreground">주간</button>
          </div>
        </div>
      </Panel>

      <div className="flex items-start gap-3">
        <Panel className="min-w-0 flex-1 overflow-hidden" pad="p-0">
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[680px] text-sm"
              style={{ gridTemplateColumns: `72px repeat(${visibleDoctors.length}, minmax(180px, 1fr))` }}
            >
              <div className="border-b border-r border-border bg-muted p-3 text-xs font-medium text-muted-foreground">
                시간
              </div>
              {visibleDoctors.map((doctor) => (
                <div key={doctor.id} className="border-b border-r border-border bg-muted p-3 last:border-r-0">
                  <div className="font-semibold">{doctor.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {doctor.department} · {doctor.slotMinutes}분 진료
                  </div>
                </div>
              ))}

              {calendarTimes.flatMap((time) => [
                <div
                  key={`${time}-label`}
                  className="border-b border-r border-border px-3 py-4 text-xs font-medium tabular-nums text-muted-foreground"
                >
                  {time}
                </div>,
                ...visibleDoctors.map((doctor) => {
                  const appointment = calendarAppointments.find(
                    (item) => item.doctorId === doctor.id && item.start === time,
                  )
                  if (!appointment) {
                    const blocked = time === '12:30'
                    return (
                      <button
                        key={`${time}-${doctor.id}`}
                        disabled={blocked}
                        onClick={() => openBooking(doctor.id, time)}
                        className={`min-h-16 border-b border-r border-border p-2 text-left last:border-r-0 ${
                          blocked ? 'cursor-not-allowed bg-muted text-muted-foreground' : 'hover:bg-primary/10'
                        }`}
                      >
                        {blocked ? (
                          <span className="text-xs">점심시간 12:30–13:30</span>
                        ) : (
                          <span className="rounded-md border border-dashed border-input px-2 py-1 text-xs text-muted-foreground">
                            빈 시간
                          </span>
                        )}
                      </button>
                    )
                  }
                  return (
                    <button
                      key={appointment.id}
                      onClick={() => setPanel({ kind: 'detail', appointment })}
                      className="relative min-h-16 border-b border-r border-border bg-primary/10 p-2 text-left hover:bg-primary/10 last:border-r-0"
                    >
                      {appointment.support && (
                        <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-card px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
                          <AlertTriangle className="h-3 w-3 text-primary" />
                          {appointment.support.type}
                        </span>
                      )}
                      <div className="pr-20 font-semibold">{appointment.patientName}</div>
                      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {appointment.start}–{appointment.end} · {appointment.status === '예약신청' ? '신청 · 미확정' : appointment.status}
                      </div>
                    </button>
                  )
                }),
              ])}
            </div>
          </div>
        </Panel>

        {panel && (
          <aside className="w-80 shrink-0">
            <Panel
              title={panel.kind === 'detail' ? '예약 상세' : '전화 예약'}
              action={
                <button aria-label="패널 닫기" onClick={() => setPanel(null)} className="rounded-md p-1 hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              }
            >
              {panel.kind === 'detail' ? (
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-base font-bold">{panel.appointment.patientName}</div>
                    <div className="mt-1 text-muted-foreground">{panel.appointment.patientBirth} · {panel.appointment.phone}</div>
                  </div>
                  <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 border-y border-border py-3">
                    <dt className="text-muted-foreground">예약</dt>
                    <dd>8월 22일 {panel.appointment.start}–{panel.appointment.end}</dd>
                    <dt className="text-muted-foreground">담당</dt>
                    <dd>{calendarDoctors.find((doctor) => doctor.id === panel.appointment.doctorId)?.department} / {calendarDoctors.find((doctor) => doctor.id === panel.appointment.doctorId)?.name}</dd>
                    <dt className="text-muted-foreground">상태</dt>
                    <dd><StatusBadge status={panel.appointment.status} /></dd>
                    <dt className="text-muted-foreground">사유</dt>
                    <dd>{panel.appointment.reason}</dd>
                  </dl>
                  {panel.appointment.support && (
                    <div className="rounded-lg border border-border bg-muted p-3">
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-4 w-4 text-primary" />
                        {panel.appointment.support.type} · 직원 확인 중
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{panel.appointment.support.context}</p>
                      <button className="mt-2 text-xs font-medium text-primary hover:underline">
                        상담 {panel.appointment.support.count}건 맥락 보기
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={btnGhost}
                      onClick={() => setConfirm({ title: '예약을 변경할까요?', body: '격자에서 새 시간을 고른 뒤 변경 내용을 확정합니다.', confirmLabel: '변경 확정' })}
                    >
                      예약 변경
                    </button>
                    <button
                      className={btnGhost}
                      onClick={() => setConfirm({ title: '예약을 취소할까요?', body: '취소하면 되돌릴 수 없습니다. 환자와 상담 내용을 한 번 더 확인해 주세요.', confirmLabel: '취소 확정' })}
                    >
                      예약 취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-sm">
                  <div>
                    <label className="mb-1.5 block font-medium">환자 찾기</label>
                    <SearchInput
                      value={patientQuery}
                      onChange={setPatientQuery}
                      placeholder="이름 · 전화 · 생년월일"
                      icon={<Search className="h-4 w-4" />}
                    />
                    {patientResults.length > 0 && (
                      <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
                        {patientResults.map((patient) => (
                          <button
                            key={patient.id}
                            onClick={() => setSelectedPatientId(patient.id)}
                            className={`block w-full px-3 py-2 text-left ${selectedPatientId === patient.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
                          >
                            <div className="font-medium">{patient.name}</div>
                            <div className="text-xs text-muted-foreground">{maskBirth(patient.birth)} · {maskPhone(patient.phone)}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="text-xs font-medium text-primary hover:underline">선택한 환자를 새로 등록하기</button>
                  <label className="block">
                    <span className="mb-1.5 block font-medium">의사</span>
                    <select
                      value={panel.doctorId}
                      onChange={(event) => setPanel({ kind: 'booking', doctorId: event.target.value, time: panel.time })}
                      className={inputClass}
                    >
                      {calendarDoctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.department} / {doctor.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="mb-1.5 block font-medium">날짜</span>
                      <input value="2026-08-22" readOnly className={inputClass} />
                    </label>
                    <label>
                      <span className="mb-1.5 block font-medium">시간</span>
                      <input value={panel.time} readOnly placeholder="격자에서 고르기" className={inputClass} />
                    </label>
                  </div>
                  <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">빈 시간을 누르면 시간이 채워집니다. 아직 저장 전이므로 다른 직원에게는 보이지 않습니다.
                  </p>
                  <label className="block">
                    <span className="mb-1.5 block font-medium">예약 사유</span>
                    <textarea rows={3} className="w-full rounded-lg border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" placeholder="방문 사유를 적어 주세요" />
                  </label>
                  <button
                    disabled={!selectedPatientId || !panel.time}
                    className={`${btnPrimary} w-full justify-center`}
                    onClick={() => setConfirm({ title: '전화 예약을 저장할까요?', body: '환자·의사·날짜·시간을 확인했습니다. 저장하면 예약이 확정됩니다.', confirmLabel: '예약 저장' })}
                  >
                    예약 저장
                  </button>
                </div>
              )}
            </Panel>
          </aside>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" role="dialog" aria-modal="true">
          <Panel className="w-full max-w-md" title={confirm.title}>
            <p className="text-sm leading-6 text-muted-foreground">{confirm.body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setConfirm(null)}>돌로</button>
              <button className={btnPrimary} onClick={() => { setConfirm(null); setPanel(null) }}>{confirm.confirmLabel}</button>
            </div>
          </Panel>
        </div>
      )}
    </StaffPage>
  )
}
