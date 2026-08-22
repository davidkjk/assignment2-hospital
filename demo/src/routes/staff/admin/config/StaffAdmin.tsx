import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, UserPlus, Users, X } from '@/components/icons'
import { PageHead, Panel, Segmented, StaffPage, StatusBadge, Tag, btnGhost, btnPrimary } from '../../_ui'
import { staffMembers, type StaffMember, type StaffRole } from './mockData'

// 직원 관리 (/admin/staff) — STAFF-* · data-testid="staff-admin-staff".
type Filter = 'all' | 'active' | 'stopped'

export function StaffAdmin() {
  const [members, setMembers] = useState(staffMembers)
  const [filter, setFilter] = useState<Filter>('all')
  const [role, setRole] = useState<StaffRole>('접수직원')
  const [inviteSent, setInviteSent] = useState(false)
  const [confirming, setConfirming] = useState<StaffMember | null>(null)

  const filtered = useMemo(() => members.filter((member) => {
    if (filter === 'active') return member.status === '활성'
    if (filter === 'stopped') return member.status === '정지'
    return true
  }), [filter, members])

  const count = (key: Filter) => {
    if (key === 'active') return members.filter((member) => member.status === '활성').length
    if (key === 'stopped') return members.filter((member) => member.status === '정지').length
    return members.length
  }

  const stopMember = () => {
    if (!confirming) return
    setMembers((current) => current.map((member) => member.id === confirming.id ? { ...member, status: '정지' as const } : member))
    setConfirming(null)
  }

  return (
    <StaffPage testid="staff-admin-staff" max="max-w-7xl">
      <PageHead title="직원 관리" sub="직원 계정과 역할을 관리하고 초대를 보냅니다" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />직원 목록</span>}
          action={<Segmented options={[{ key: 'all', label: '전체' }, { key: 'active', label: '활성' }, { key: 'stopped', label: '중지됨' }]} value={filter} onChange={setFilter} count={count} />}
          pad="p-0"
        >
          <div className="grid grid-cols-[minmax(190px,1.4fr)_100px_110px_85px_150px] gap-3 border-b border-border/70 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>직원</span><span>역할</span><span>소속</span><span>상태</span><span className="text-right">작업</span>
          </div>
          <ul className="divide-y divide-border/60">
            {filtered.map((member) => (
              <li key={member.id} className={`grid grid-cols-[minmax(190px,1.4fr)_100px_110px_85px_150px] items-center gap-3 px-4 py-3 text-sm ${member.status === '정지' ? 'bg-muted/40 text-muted-foreground' : ''}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <span>{member.name}</span>
                    {member.invitePending && <Tag className="!bg-primary/10 !text-primary">초대함 · 아직 안 들어옴</Tag>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{member.email} · {member.lastLogin}</div>
                </div>
                <Tag className={member.role === '의사' ? '!bg-primary/10 !text-primary' : ''}>{member.role}</Tag>
                <span>{member.department}</span>
                <StatusBadge status={member.status} />
                <div className="flex justify-end gap-1.5">
                  {member.invitePending && <button className={btnGhost}>재초대</button>}
                  {member.status === '활성' && member.id !== 's1' && (
                    <button onClick={() => setConfirming(member)} className={btnGhost}>중지 검토</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={<span className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" />직원 추가</span>}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); setInviteSent(true) }}>
            <Field label="이름"><input required className={inputClass} placeholder="직원 이름" /></Field>
            <Field label="이메일"><input required type="email" className={inputClass} placeholder="name@hospital.kr" /></Field>
            <Field label="역할">
              <select value={role} onChange={(event) => setRole(event.target.value as StaffRole)} className={inputClass}>
                <option>접수직원</option><option>의사</option><option>관리자</option>
              </select>
            </Field>
            {role === '의사' && <Field label="소속 진료과"><select required className={inputClass}><option value="">진료과 선택</option><option>내과</option><option>피부과</option><option>정형외과</option></select></Field>}
            <p className="text-xs text-muted-foreground">비밀번호는 받지 않습니다. 직원에게 로그인 초대 메일이 전송됩니다.</p>
            {inviteSent && <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />초대했습니다.</div>}
            <button className={`${btnPrimary} w-full justify-center`}><UserPlus className="h-4 w-4" />초대 보내기</button>
          </form>
        </Panel>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="stop-staff-title">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="stop-staff-title" className="font-bold">{confirming.name} 직원을 중지할까요?</h3>
                <p className="mt-1 text-sm text-muted-foreground">{confirming.role} · {confirming.department}. 중지 후 로그인 세션도 끊깁니다.</p>
              </div>
              <button onClick={() => setConfirming(null)} className="text-muted-foreground" aria-label="닫기"><X className="h-5 w-5" /></button>
            </div>
            {confirming.role === '의사' && (
              <div className="mt-4 rounded-lg border border-border bg-muted/60 p-3">
                <div className="flex gap-2 font-semibold"><AlertTriangle className="mt-0.5 h-4 w-4 text-primary" />확인 필요한 예약 {confirming.affectedAppointments?.length ?? 0}건</div>
                <p className="mt-1 text-xs text-muted-foreground">자동 취소·재배정하지 않습니다. 중지 후 오늘 현황의 「확인 필요」 큐에서 예약별로 처리합니다.</p>
                <ul className="mt-2 space-y-1 text-sm tabular-nums">
                  {confirming.affectedAppointments?.map((appointment) => <li key={`${appointment.date}-${appointment.time}`}>{appointment.date} · {appointment.time}</li>)}
                </ul>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirming(null)} className={btnGhost}>취소</button>
              <button onClick={stopMember} className={btnPrimary}>사용 중지 확정</button>
            </div>
          </div>
        </div>
      )}
    </StaffPage>
  )
}

const inputClass = 'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>{children}</label>
}
