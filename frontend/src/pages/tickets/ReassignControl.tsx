import { useEffect, useState } from 'react'
import { AlertTriangle } from '../../components/icons'
import { btnGhost } from '../../components/staff-ui'
import type { ActiveStaff, StaffRole } from '../../api/staffChatDetail'

// 담당 이관(REASSIGN-*). 의료판단(reason=medical_judgment)은 ⚠ 경고문구만 강조(REASSIGN-01) —
// '의사에게 전달' 동작은 성립하지 않아(의사 전용 답변 화면 없음) 제거, 이관은 일반과 동일하게 모든 활성 직원(REASSIGN-05).
// 성공은 assigned_staff_id만·in_progress 유지(REASSIGN-02, 훅), 처리 중 선택·버튼 잠금(REASSIGN-03),
// 실패는 기존 담당·상태 유지+재시도(REASSIGN-04). ⛔ 별도 [담당 지정]·[내가 맡기] 없음(ASSIGN-02 — 자동배정과 중복).
// 시각은 데모 tickets 상단 이관바 그대로.

const ROLE: Record<StaffRole, string> = { reception: '접수', doctor: '의사', admin: '관리자' }

export function ReassignControl(props: {
  reason: string
  busy: boolean
  loadStaff: () => Promise<ActiveStaff[]>
  onReassign: (toStaffId: string) => Promise<void>
}) {
  const { reason, busy, loadStaff, onReassign } = props
  const isMedical = reason === 'medical_judgment'
  const [staff, setStaff] = useState<ActiveStaff[]>([])
  const [pick, setPick] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void loadStaff()
      .then(setStaff)
      .catch(() => setStaff([]))
  }, [loadStaff])

  // REASSIGN-05: 이관 대상은 언제나 모든 활성 직원. 의료판단도 '의사에게 전달' 없이 일반 이관으로 통일.
  const options = staff

  const submit = async () => {
    if (busy || pick === '') return // REASSIGN-03: 잠금
    setFailed(false)
    try {
      await onReassign(pick)
    } catch {
      setFailed(true) // REASSIGN-04: 기존 담당·상태 유지
    }
  }

  return (
    <section aria-label="담당 이관" className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
      {/* ASSIGN-02: [담당 지정]·[내가 맡기] 버튼을 두지 않는다 */}
      {isMedical && (
        <p
          data-emphasis
          role="note"
          className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          의료 판단이 필요한 문의입니다. 임의로 답하지 말고 담당 의사에게 전달하세요.
        </p>
      )}
      <span className="text-sm text-muted-foreground">담당 이관</span>
      <select
        id="reassign-to"
        aria-label="이관할 직원"
        value={pick}
        disabled={busy}
        onChange={(e) => setPick(e.target.value)}
        className="h-8 rounded-lg border border-input bg-card px-2 text-sm outline-none focus:border-ring disabled:opacity-60"
      >
        <option value="">직원 선택</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {ROLE[s.role]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={busy || pick === ''}
        aria-busy={busy}
        className={`${btnGhost} py-1.5`}
      >
        {busy ? '전달 중…' : '이관'}
      </button>
      {failed && (
        <p role="alert" className="w-full text-sm text-rose-600">
          이관에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}
    </section>
  )
}
