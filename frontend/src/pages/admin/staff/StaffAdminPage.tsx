import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { RequireRole } from '../../../auth/RequireRole'
import { ADMIN_ONLY } from '../../../auth/roles'
import { useAuth } from '../../../auth/useAuth'
import { ConfirmDialog, dialogStyles } from '../../../components/ConfirmDialog'
import { staffApi, type StaffMember } from '../../../api/staff'
import { ApiError } from '../../../api/httpClient'
import { StaffList } from './StaffList'
import { InviteForm } from './InviteForm'
import { DoctorProfilePanel } from './DoctorProfilePanel'
import { DeactivateDialog } from './DeactivateDialog'

// [STAFF-SHELL-*·D-STAFF-01] /admin/staff — 왼쪽 목록 / 오른쪽 전환 칸.
// ⭐ 오른쪽을 하나의 상태로 다룬다: right = 초대 폼 | 의사 프로필. 초대 폼은 언마운트하지 않고
//    숨긴다(STAFF-PROFILE-10) — 프로필을 보다 돌아와도 쓰던 초대 내용이 살아 있어야 한다.
// ⭐ 떠날 때 묻기(STAFF-PROFILE-09)는 「다른 의사 줄·[닫기]」 두 화면 내 경로를 같은 guardLeave로
//    묶는다. (사이드바 이동은 라우터 레벨 차단이 필요해 App.tsx 배선과 함께 다룬다 — 이월.)

type RightPane = { kind: 'invite' } | { kind: 'profile'; staffId: string }

export function StaffAdminPage() {
  return (
    <RequireRole roles={ADMIN_ONLY}>
      <StaffAdminInner />
    </RequireRole>
  )
}

function StaffAdminInner() {
  const { staff: me } = useAuth()
  const [searchParams] = useSearchParams()
  const emailRef = useRef<HTMLInputElement | null>(null)
  const saveRef = useRef<(() => Promise<boolean>) | null>(null)

  const staffQ = useQuery({ queryKey: ['staff'], queryFn: staffApi.list })
  const deptQ = useQuery({ queryKey: ['departments', 'active'], queryFn: staffApi.departments })

  const staff = useMemo(() => staffQ.data ?? [], [staffQ.data])
  const departments = deptQ.data ?? []
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name ?? null : null)

  const [right, setRight] = useState<RightPane>(() => {
    const doctor = searchParams.get('doctor')
    return doctor ? { kind: 'profile', staffId: doctor } : { kind: 'invite' }
  })
  const [profileDirty, setProfileDirty] = useState(false)
  const [leavePrompt, setLeavePrompt] = useState<{ proceed: () => void } | null>(null)
  const [deactivating, setDeactivating] = useState<StaffMember | null>(null)
  const [deleting, setDeleting] = useState<StaffMember | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [banner, setBanner] = useState<{ count: number } | null>(null)

  const handleDirty = useCallback((d: boolean) => setProfileDirty(d), [])

  function guardLeave(action: () => void) {
    if (right.kind === 'profile' && profileDirty) {
      setLeavePrompt({ proceed: action })
    } else {
      action()
    }
  }

  function openProfile(id: string) {
    guardLeave(() => {
      setProfileDirty(false)
      setRight({ kind: 'profile', staffId: id })
    })
  }
  function closeProfile() {
    guardLeave(() => {
      setProfileDirty(false)
      setRight({ kind: 'invite' })
    })
  }

  async function onDeactivated(count: number) {
    setDeactivating(null)
    await staffQ.refetch()
    setBanner(count > 0 ? { count } : null)
  }

  async function confirmDelete() {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await staffApi.remove(deleting.id)
      setDeleting(null)
      await staffQ.refetch()
    } catch (err) {
      // 딸린 데이터가 있으면 서버가 409로 "중지를 쓰세요"를 준다 — 삼키지 않고 확인창에 보인다.
      setDeleteError(err instanceof ApiError ? err.message : '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const selectedDoctor =
    right.kind === 'profile' ? staff.find((m) => m.id === right.staffId) : undefined

  return (
    <section style={styles.page} aria-label="직원 관리">
      {/* 화면 제목은 셸 헤더가 그린다(`STAFF-SHELL-02` 개정) — 본문엔 두지 않는다. */}
      {banner && (
        <div role="status" style={styles.banner}>
          <span>확인 필요한 예약 {banner.count}건은 오늘의 현황에서 처리합니다.</span>
          <Link to="/today" style={styles.bannerLink}>
            오늘의 현황으로 ›
          </Link>
        </div>
      )}

      <div style={styles.body}>
        <StaffList
          staff={staff}
          departments={departments}
          currentStaffId={me?.staffId ?? ''}
          loading={staffQ.isLoading}
          error={staffQ.isError}
          onRetry={() => void staffQ.refetch()}
          activeProfileId={right.kind === 'profile' ? right.staffId : null}
          onProfile={openProfile}
          onDeactivate={setDeactivating}
          onDelete={(m) => {
            setDeleteError(null)
            setDeleting(m)
          }}
          onInviteEmptyState={() => {
            setRight({ kind: 'invite' })
            emailRef.current?.focus()
          }}
        />

        <div data-col="right" style={styles.right}>
          <InviteForm
            departments={departments}
            hidden={right.kind !== 'invite'}
            emailRef={emailRef}
            onInvited={() => void staffQ.refetch()}
          />
          {right.kind === 'profile' && selectedDoctor && (
            <DoctorProfilePanel
              doctor={selectedDoctor}
              allStaff={staff}
              onClose={closeProfile}
              onSaved={() => void staffQ.refetch()}
              onDirtyChange={handleDirty}
              saveRef={saveRef}
            />
          )}
        </div>
      </div>

      {deactivating && (
        <DeactivateDialog
          target={deactivating}
          departmentName={deptName(deactivating.department_id)}
          onCancel={() => setDeactivating(null)}
          onDone={onDeactivated}
        />
      )}

      {/* [STAFF-DELETE-01] 잘못 초대한 미수락 계정 되돌리기(삭제). 되돌릴 수 없어 확인창 안에서만,
          빨간 버튼(danger)도 여기서만(BLOCK-CONF-01). 딸린 데이터가 있으면 서버가 막고 이유를 보인다. */}
      {deleting && (
        <ConfirmDialog
          title={`${deleting.name} 님의 초대를 취소할까요?`}
          confirmLabel={deleteBusy ? '지우는 중…' : '초대 취소하고 삭제'}
          cancelLabel="그만두기"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        >
          <p style={styles.deleteMsg}>
            아직 들어오지 않은(초대 수락 전) 계정이라 지워도 안전합니다. 계정을 완전히 삭제하며,
            <strong> 되돌릴 수 없습니다.</strong> 같은 이메일로 정보를 다시 입력해 초대할 수 있습니다.
          </p>
          {deleteError && (
            <p role="alert" style={styles.deleteError}>{deleteError}</p>
          )}
        </ConfirmDialog>
      )}

      {leavePrompt && (
        <div style={dialogStyles.scrim} data-testid="leave-scrim">
          <div role="dialog" aria-modal="true" aria-label="저장하지 않은 변경" style={dialogStyles.dialog}>
            <h2 style={styles.leaveTitle}>저장하지 않은 변경이 있습니다</h2>
            <p style={styles.leaveMsg}>지금 저장하거나, 버리고 떠나거나, 여기 남을 수 있습니다.</p>
            <div style={styles.leaveActions}>
              <button
                type="button"
                onClick={() => {
                  const proceed = leavePrompt.proceed
                  setLeavePrompt(null)
                  setProfileDirty(false)
                  proceed()
                }}
                style={styles.leaveDiscard}
              >
                버리기
              </button>
              <button type="button" onClick={() => setLeavePrompt(null)} style={styles.leaveCancel}>
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  const proceed = leavePrompt.proceed
                  // 저장이 서버에서 막히면 떠나지 않는다 — 조용한 데이터 손실을 막는다(G1).
                  // 실패 사유는 프로필 패널이 인라인으로 보여 준다.
                  const ok = await saveRef.current?.()
                  if (ok === false) return
                  setLeavePrompt(null)
                  setProfileDirty(false)
                  proceed()
                }}
                style={styles.leaveSave}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 'var(--sp-5)', maxWidth: 1100, margin: '0 auto' },
  title: { margin: '0 0 var(--sp-4)', fontSize: 'var(--fs-title)', color: 'var(--color-ink)' },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    marginBottom: 'var(--sp-4)',
    padding: 'var(--sp-3) var(--sp-4)',
    borderRadius: 10,
    borderLeft: '4px solid var(--color-warn)',
    background: 'var(--color-bg)',
    fontSize: 'var(--fs-body)',
    color: 'var(--color-ink)',
  },
  bannerLink: { fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)', textDecoration: 'none' },
  body: { display: 'flex', gap: 'var(--sp-5)', alignItems: 'flex-start' },
  right: {
    flex: 1,
    minWidth: 0,
    // 왼쪽 목록의 상태 필터줄(칩 30 + col gap 12)만큼 내려 첫 직원 카드와 윗선을 맞춘다(L25).
    marginTop: 'var(--sp-11)',
    padding: 'var(--sp-5)',
    borderRadius: 12,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
  },
  deleteMsg: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  deleteError: { margin: 'var(--sp-3) 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-danger)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'] },
  leaveTitle: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  leaveMsg: { margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  leaveActions: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-5)' },
  leaveDiscard: {
    height: 34,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  leaveCancel: {
    height: 34,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  leaveSave: {
    height: 34,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
}
