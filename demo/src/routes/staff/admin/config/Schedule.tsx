import { useState } from 'react'
import { AlertTriangle, CalendarCheck2, CalendarPlus, CheckCircle2, Clock3, X } from '@/components/icons'
import { PageHead, Panel, StaffPage, StatusBadge, Tag, btnGhost, btnPrimary } from '../../_ui'
import { scheduleDoctors, weekDays, weeklySchedule } from './mockData'

// 진료 일정 관리 (/admin/schedule) — SCHED-* · data-testid="staff-schedule".
type ScheduleSection = 'overview' | 'departments' | 'doctor' | 'date'

const sections: { key: ScheduleSection; label: string; sub: string }[] = [
  { key: 'overview', label: '전체 현황', sub: '읽는 곳' },
  { key: 'departments', label: '진료과 관리', sub: '4과' },
  { key: 'doctor', label: '의사별 스케줄', sub: '의사 4명' },
  { key: 'date', label: '특정 날짜 변경', sub: '다음 휴무 8/28' },
]

export function Schedule() {
  const [section, setSection] = useState<ScheduleSection>('overview')
  const [closedModal, setClosedModal] = useState(false)
  const [saved, setSaved] = useState('')
  const [closeScope, setCloseScope] = useState<'hospital' | 'doctors'>('hospital')

  const registerClosure = () => {
    setClosedModal(false)
    setSaved('8월 28일 휴진을 등록했습니다. 영향받는 예약 7건은 오늘 현황의 「확인 필요」로 이동합니다.')
  }

  return (
    <StaffPage testid="staff-schedule" max="max-w-7xl">
      <PageHead
        title="진료 일정 관리"
        sub="평상시 근무 규칙과 특정 날짜의 변경을 관리합니다"
        action={<div className="flex gap-2"><button onClick={() => setSaved('9월 1일 화요일 18:00–20:00 근무를 추가했습니다.')} className={btnGhost}><CalendarPlus className="h-4 w-4 text-primary" />근무 추가</button><button onClick={() => setClosedModal(true)} className={btnPrimary}><CalendarCheck2 className="h-4 w-4" />휴진 등록</button></div>}
      />

      {saved && <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />{saved}</div>}

      <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
        <Panel pad="p-2">
          <nav className="space-y-1" aria-label="일정 관리 메뉴">
            {sections.map((item) => (
              <button key={item.key} onClick={() => setSection(item.key)} className={`w-full rounded-lg px-3 py-2.5 text-left ${section === item.key ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.sub}</span>
              </button>
            ))}
          </nav>
        </Panel>

        {section === 'overview' && <OverviewGrid onEditDoctor={() => setSection('doctor')} />}
        {section === 'departments' && <DepartmentPanel />}
        {section === 'doctor' && <DoctorSchedule />}
        {section === 'date' && <DateChanges onRegister={() => setClosedModal(true)} />}
      </div>

      {closedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="closure-title">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div><h3 id="closure-title" className="font-bold">8월 28일 휴진 등록</h3><p className="mt-1 text-sm text-muted-foreground">이번 한 번만 적용됩니다. 평상시 규칙은 바뀌지 않습니다.</p></div>
              <button onClick={() => setClosedModal(false)} aria-label="닫기" className="text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setCloseScope('hospital')} className={`rounded-lg border px-3 py-2 text-sm font-medium ${closeScope === 'hospital' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>병원 전체</button>
              <button onClick={() => setCloseScope('doctors')} className={`rounded-lg border px-3 py-2 text-sm font-medium ${closeScope === 'doctors' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>의사 고르기</button>
            </div>
            {closeScope === 'doctors' && <div className="mt-3 grid grid-cols-2 gap-2">{scheduleDoctors.map((doctor) => <label key={doctor.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"><input type="checkbox" defaultChecked />{doctor.name}<span className="text-xs text-muted-foreground">예약 {doctor.id === 'd1' ? 3 : doctor.id === 'd2' ? 2 : 1}건</span></label>)}</div>}
            <label className="mt-4 block text-sm"><span className="mb-1 block font-medium">메모</span><input defaultValue="병원 지정 휴무일" className={inputClass} /></label>
            <div className="mt-4 rounded-lg border border-border bg-muted/60 p-3">
              <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-primary" />영향받는 예약 7건</div>
              <p className="mt-1 text-xs text-muted-foreground">8월 28일 09:00–16:30 예약입니다. 자동 취소하거나 환자에게 자동 알림을 보내지 않고 「확인 필요」 큐로 보냅니다.</p>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setClosedModal(false)} className={btnGhost}>취소</button><button onClick={registerClosure} className={btnPrimary}>휴진 등록 확정</button></div>
          </div>
        </div>
      )}
    </StaffPage>
  )
}

function OverviewGrid({ onEditDoctor }: { onEditDoctor: () => void }) {
  return (
    <Panel title={<span className="flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-primary" />주간 전체 현황</span>} action={<span className="text-xs text-muted-foreground">평상시 규칙 · 읽기 전용</span>} pad="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead><tr className="border-b border-border/70 bg-muted/50"><th className="px-3 py-2 text-left">의사 · 진료과</th>{weekDays.map((day) => <th key={day} className="px-2 py-2 text-center">{day}</th>)}</tr></thead>
          <tbody className="divide-y divide-border/60">
            {weeklySchedule.map((row) => (
              <tr key={row.doctor.id}>
                <th className="px-3 py-3 text-left"><span className="font-semibold">{row.doctor.name}</span><Tag className="ml-2">{row.doctor.department}</Tag></th>
                {row.days.map((day) => (
                  <td key={day.day} className="border-l border-border/50 p-1.5 text-center">
                    <button onClick={onEditDoctor} className={`w-full rounded-md px-1 py-2 ${day.closed ? 'bg-muted text-muted-foreground' : 'hover:bg-primary/10'}`}>
                      {day.closed ? <span className="font-semibold">휴진</span> : <><span className="block font-medium tabular-nums">{day.hours.replace(':00', '')}</span><span className="block text-xs text-muted-foreground">{day.slot}분 · {day.capacity}명</span></>}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function DoctorSchedule() {
  const [doctor, setDoctor] = useState(scheduleDoctors[0].id)
  return <Panel title="의사별 스케줄" action={<button className={btnPrimary}>저장</button>}>
    <div className="mb-3 flex flex-wrap gap-2">{scheduleDoctors.map((item) => <button key={item.id} onClick={() => setDoctor(item.id)} className={`rounded-lg px-3 py-2 text-sm ${doctor === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{item.name}<span className="ml-1 text-xs opacity-70">{item.department}</span></button>)}</div>
    <div className="divide-y divide-border/60 rounded-lg border border-border">{weekDays.map((day, index) => <div key={day} className="grid grid-cols-[45px_70px_1fr_100px_100px] items-center gap-2 px-3 py-2 text-sm"><strong>{day}요일</strong><label className="flex items-center gap-1"><input type="checkbox" defaultChecked={index !== 6} />진료</label>{index === 6 ? <span className="text-muted-foreground">— 휴진일 —</span> : <span className="tabular-nums">09:00–18:00 · 점심 12:30–13:30</span>}<span>{index === 6 ? '—' : '15분/칸'}</span><span>{index === 6 ? '—' : '최대 40명'}</span></div>)}</div>
    <button className={`${btnGhost} mt-3`}><Clock3 className="h-4 w-4 text-primary" />월요일 값을 나머지에</button>
  </Panel>
}

function DepartmentPanel() {
  return <Panel title="진료과 관리" action={<button className={btnPrimary}>진료과 추가</button>}><div className="divide-y divide-border/60">{[['내과', 2, '활성'], ['피부과', 1, '활성'], ['정형외과', 1, '활성'], ['가정의학과', 0, '정지']].map(([name, doctors, status]) => <div key={name} className="flex items-center gap-3 py-3 text-sm"><span className="font-semibold">{name}</span><span className="text-muted-foreground">소속 의사 {doctors}명</span><StatusBadge status={String(status)} /><div className="ml-auto flex gap-2"><button className={btnGhost}>이름 수정</button><button className={btnGhost}>{status === '정지' ? '다시 사용' : '사용 중지'}</button></div></div>)}</div></Panel>
}

function DateChanges({ onRegister }: { onRegister: () => void }) {
  return <Panel title="특정 날짜 변경" action={<button onClick={onRegister} className={btnPrimary}>휴진 등록</button>}><div className="grid gap-4 md:grid-cols-[1fr_1.2fr]"><div className="rounded-lg border border-border p-3"><div className="grid grid-cols-7 gap-1 text-center text-xs">{weekDays.map((day) => <strong key={day}>{day}</strong>)}{Array.from({ length: 31 }, (_, index) => <button key={index} className={`rounded-md p-2 ${index + 1 === 28 ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{index + 1}{index + 1 === 28 && <span className="block">●</span>}</button>)}</div></div><div className="rounded-lg border border-border p-4"><h4 className="font-semibold">8월 28일 금요일</h4><p className="mt-2 text-sm text-muted-foreground">병원 전체 휴진 · 병원 지정 휴무일</p><div className="mt-3 flex items-center gap-2"><StatusBadge status="확인 필요" tone="amber" /><span className="text-sm">영향받는 예약 7건</span></div></div></div></Panel>
}

const inputClass = 'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'
