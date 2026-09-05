import { useRef, useState } from 'react'
import { UserPlus, AlertTriangle, X } from '@/components/icons'
import { StaffPage, PageHead, EmptyState, btnPrimary, btnGhost, btnLink } from '../../_ui'
import { staffMembers, PALETTE, ME, type StaffMember, type StaffRole } from './mockData'

// 직원 관리 (/staff/admin/staff) — STAFF-*.
// 왼쪽 직원 목록(활성·중지 함께) + 오른쪽 초대 폼(또는 의사 프로필 편집).
// 의사 [중지] → 확인창에 영향 미래 예약 건수·날짜·시각 → 확정하면 자동 취소 없이
//   needs_rescheduling '확인 필요' 큐로(STAFF-DEACT-*, 결정10 A안). data-testid="staff-admin-staff".

const ROLE_TONE: Record<StaffRole, string> = {
  관리자: 'bg-primary/12 text-primary',
  의사: 'bg-sky-100 text-sky-700',
  접수직원: 'bg-slate-100 text-slate-700',
}

type Filter = '전체' | '활성' | '중지됨'
type RightPanel = { mode: 'invite' } | { mode: 'profile'; id: string }

export function StaffAdmin() {
  const [staff, setStaff] = useState<StaffMember[]>(staffMembers)
  const [filter, setFilter] = useState<Filter>('전체')
  const [right, setRight] = useState<RightPanel>({ mode: 'invite' })
  const [deactivating, setDeactivating] = useState<StaffMember | null>(null)

  const counts = {
    전체: staff.length,
    활성: staff.filter((s) => s.active).length,
    중지됨: staff.filter((s) => !s.active).length,
  }
  const rows = staff
    .filter((s) => (filter === '전체' ? true : filter === '활성' ? s.active : !s.active))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))

  return (
    <StaffPage max="max-w-6xl" testid="staff-admin-staff">
      <PageHead title="직원 관리" />

      <div className="flex gap-4">
        {/* 왼쪽: 목록 */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1.5">
            {(['전체', '활성', '중지됨'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                {f} <span className="tabular-nums">{counts[f]}</span>
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            {rows.length === 0 ? (
              <EmptyState title="해당하는 직원이 없습니다" />
            ) : (
              rows.map((s) => {
                const activeRow = right.mode === 'profile' && right.id === s.id
                return (
                  <div
                    key={s.id}
                    className={`flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 ${activeRow ? 'bg-primary/5' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ROLE_TONE[s.role]}`}>{s.role}</span>
                        {s.department && <span className="text-xs text-muted-foreground">{s.department}</span>}
                        {!s.active && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">중지됨</span>}
                        {s.invitePending && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">⚑ 초대함 · 아직 안 들어옴</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.invitePending ? s.inviteSent : s.lastLogin ? `마지막 로그인 ${s.lastLogin}` : '로그인 기록 없음'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {s.active && s.role === '의사' && (
                        <button className={`${btnGhost} px-2.5 py-1`} onClick={() => setRight({ mode: 'profile', id: s.id })}>프로필</button>
                      )}
                      {s.invitePending && <button className={btnLink}>재초대</button>}
                      {s.active && s.name !== ME && !s.invitePending && (
                        <button className="rounded-lg border border-border bg-card px-2.5 py-1 text-sm font-medium text-muted-foreground hover:bg-muted" onClick={() => setDeactivating(s)}>중지</button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 오른쪽: 초대 폼 또는 프로필 편집 */}
        <div className="w-80 shrink-0">
          {/* 왼쪽 필터 칩 줄만큼 띄워 두 카드의 윗선을 맞춘다 */}
          <div aria-hidden className="mb-2 h-[26px]" />
          {right.mode === 'invite' ? (
            <InvitePanel />
          ) : (
            <ProfilePanel member={staff.find((s) => s.id === right.id)!} onClose={() => setRight({ mode: 'invite' })} />
          )}
        </div>
      </div>

      {deactivating && (
        <DeactivateConfirm
          member={deactivating}
          onClose={() => setDeactivating(null)}
          onDone={() => {
            setStaff((prev) => prev.map((x) => (x.id === deactivating.id ? { ...x, active: false } : x)))
            setDeactivating(null)
          }}
        />
      )}
    </StaffPage>
  )
}

function InvitePanel() {
  const [role, setRole] = useState<StaffRole>('접수직원')
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><UserPlus className="h-4 w-4" /> 직원 초대</h3>
      <Labeled label="이메일"><input type="email" placeholder="staff@gaon.kr" className={inputCls} /></Labeled>
      <Labeled label="이름"><input placeholder="이름" className={inputCls} /></Labeled>
      <Labeled label="역할">
        <div className="flex gap-1.5">
          {(['접수직원', '의사', '관리자'] as StaffRole[]).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-sm ${role === r ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </Labeled>
      {role === '의사' && (
        <Labeled label="소속 진료과">
          <select className={inputCls}>
            <option>내과</option>
            <option>정형외과</option>
          </select>
        </Labeled>
      )}
      <button className={`${btnPrimary} mt-1 w-full justify-center`}>초대</button>
      <p className="mt-2 text-[11px] text-muted-foreground">비밀번호는 직원이 초대 메일에서 직접 설정합니다.</p>
    </div>
  )
}

function ProfilePanel({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const pal = member.color != null ? member.color : 0
  const [color, setColor] = useState(pal)
  const [photo, setPhoto] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => setPhoto(String(r.result))
    r.readAsDataURL(f) // 데모: 로컬 미리보기만, 어디에도 올리지 않는다
  }
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{member.name} 선생님 프로필</h3>
        <button onClick={onClose} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" /> 닫기
        </button>
      </div>
      <div className="mb-3 flex items-center gap-3">
        {photo ? (
          <img src={photo} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold" style={{ background: PALETTE[color].fill, color: PALETTE[color].ink }}>
            {member.name[0]}
          </div>
        )}
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
          <div className="flex items-center gap-1.5">
            <button className={`${btnGhost} py-1.5`} onClick={() => fileRef.current?.click()}>사진 바꾸기</button>
            {photo && <button className={btnLink} onClick={() => setPhoto(null)}>되돌리기</button>}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">JPG·PNG · 최대 2MB</p>
        </div>
      </div>
      <Labeled label="전문분야 · 환자 앱 의사 카드에 그대로 보입니다">
        <input defaultValue={member.specialty ?? ''} className={inputCls} />
      </Labeled>
      <Labeled label="소개글 · 환자에게는 안 보이고 상담봇이 답할 때만 씁니다">
        <textarea defaultValue={member.bio ?? ''} rows={3} className={inputCls} />
      </Labeled>
      <div className="mb-3">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">캘린더 색</div>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((p, i) => (
            <button
              key={i}
              onClick={() => setColor(i)}
              className={`h-7 w-7 rounded-md ${color === i ? 'ring-2 ring-primary ring-offset-1' : ''}`}
              style={{ background: p.fill }}
              aria-label={`색 ${i + 1}`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">이 색은 모든 직원의 화면에서 함께 바뀝니다.</p>
      </div>
      <button className={`${btnPrimary} w-full justify-center`}>저장</button>
    </div>
  )
}

// 의사 중지 확인 — 영향 예약 미리보기 + 확인 필요 큐 (STAFF-DEACT-04·06·07)
function DeactivateConfirm({ member, onClose, onDone }: { member: StaffMember; onClose: () => void; onDone: () => void }) {
  const isDoctor = member.role === '의사'
  const impacted = isDoctor
    ? [
        { at: '8/23 (토) 10:30' },
        { at: '8/25 (월) 09:00' },
        { at: '8/25 (월) 14:20' },
      ]
    : []
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h3 className="text-base font-bold">{member.name} 님을 사용 중지할까요?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {member.role}{member.department ? ` · ${member.department}` : ''} · 사용 중지하면 이 계정의 로그인 세션도 끊깁니다.
        </p>

        {isDoctor && impacted.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> 확인 필요한 예약 {impacted.length}건
            </p>
            <ul className="mt-1.5 space-y-0.5 text-sm text-amber-900/90">
              {impacted.map((a, i) => (
                <li key={i} className="tabular-nums">· {a.at}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-900/80">
              자동으로 취소·재배정하지 않습니다. 「지금 처리할 것」의 확인 필요 목록으로 넘겨, 접수 직원이 환자별로 옮기거나 취소한 뒤 안내합니다.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>취소</button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700" onClick={onDone}>
            사용 중지
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}
