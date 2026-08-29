import { useState, type CSSProperties } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ApiError } from '../../../api/httpClient'
import { TextField, btnPrimary, btnGhost } from '../../../components/staff-ui'
import type { Department } from './types'

// [SCHED-DEPT-*] 진료과 관리. 목록 + [진료과 추가] + 줄마다 [이름 수정][사용 중지].
//   ⛔ 삭제 버튼 없음(SCHED-DEPT-02) — 지운 진료과를 참조하는 지난 예약·문진이 통째로 깨진다.
//   활성 의사가 있으면 사용 중지를 막고 [직원 관리로 가기]를 준다(SCHED-DEPT-03·05, 막다른 길 금지).
//   ⛔ 「소속 의사도 함께 끄기」 스위치를 만들지 않는다(SCHED-DEPT-12, 갭 #89).
//   되돌릴 수 있는 일이라 빨간 버튼을 쓰지 않는다(SCHED-DEPT-07) — 회색으로 남고 [다시 사용]이 붙는다(SCHED-DEPT-08).

interface DepartmentListProps {
  departments: Department[]
  /** deptId → 그 과의 활성 의사 이름들(전체 현황에서 파생). 사용 중지를 막을지 판단한다. */
  activeDoctorsByDept: Record<string, string[]>
  onCreate: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDeactivate: (id: string) => Promise<void>
  onReactivate: (id: string) => Promise<void>
  onGoToStaff: () => void
}

type Blocking = { dept: Department; doctors: string[] }

export function DepartmentList({
  departments,
  activeDoctorsByDept,
  onCreate,
  onRename,
  onDeactivate,
  onReactivate,
  onGoToStaff,
}: DepartmentListProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [blocking, setBlocking] = useState<Blocking | null>(null)
  const [confirming, setConfirming] = useState<Department | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // [SCHED-DEPT-03·05][L33/G1] 사용 중지 확정. 예전엔 `void onDeactivate(id)`로 결과를 버려,
  // 서버가 「활성 의사가 있어 못 끈다」(400)를 내도 확인창만 닫히고 아무 일도 안 일어난 듯 보였다
  // (클라이언트 사전판정 activeDoctorsByDept가 서버와 어긋난 경우). 서버가 권위이므로 실패를 잡아,
  // 활성 의사 때문이면 「갈 길을 주는」 blocking 창으로, 그 밖의 실패면 인라인 문구로 보인다.
  async function confirmDeactivate(dept: Department) {
    setConfirming(null)
    setActionError(null)
    try {
      await onDeactivate(dept.id)
    } catch (e) {
      const ctx = e instanceof ApiError ? (e.context as { active_doctors?: string[] } | undefined) : undefined
      if (ctx?.active_doctors && ctx.active_doctors.length > 0) {
        setBlocking({ dept, doctors: ctx.active_doctors })
      } else {
        setActionError(e instanceof ApiError ? e.message : '진료과를 사용 중지하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
    }
  }

  function startEdit(dept: Department) {
    setEditing(dept.id)
    setDraftName(dept.name)
  }

  async function saveEdit(id: string) {
    await onRename(id, draftName)
    setEditing(null)
  }

  function clickDeactivate(dept: Department) {
    const doctors = activeDoctorsByDept[dept.id] ?? []
    if (doctors.length > 0) {
      setBlocking({ dept, doctors }) // 막는다 + 갈 길을 준다(SCHED-DEPT-03·05)
    } else {
      setConfirming(dept)
    }
  }

  return (
    <div>
      <div style={styles.head}>
        <h2 style={styles.title}>진료과 관리</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={btnPrimary}>
            진료과 추가
          </button>
        )}
      </div>

      {adding && (
        <div style={styles.addRow}>
          <TextField
            ariaLabel="새 진료과 이름"
            value={newName}
            onChange={setNewName}
            className="flex-1"
          />
          <button
            type="button"
            className={btnPrimary}
            onClick={async () => {
              await onCreate(newName)
              setNewName('')
              setAdding(false)
            }}
          >
            추가
          </button>
          <button type="button" className={btnGhost} onClick={() => setAdding(false)}>
            취소
          </button>
        </div>
      )}

      <ul style={styles.list}>
        {departments.map((dept) => {
          const count = (activeDoctorsByDept[dept.id] ?? []).length
          const isEditing = editing === dept.id
          return (
            <li
              key={dept.id}
              data-dept-row={dept.name}
              className={dept.is_active ? undefined : 'is-inactive'}
              style={{ ...styles.row, ...(dept.is_active ? null : styles.rowInactive) }}
            >
              {isEditing ? (
                <>
                  <TextField
                    ariaLabel="진료과 이름"
                    value={draftName}
                    onChange={setDraftName}
                    className="flex-1"
                  />
                  <div style={styles.rowActions}>
                    <button type="button" className={btnPrimary} onClick={() => saveEdit(dept.id)}>
                      저장
                    </button>
                    <button type="button" className={btnGhost} onClick={() => setEditing(null)}>
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.rowMain}>
                    <span style={styles.deptName}>{dept.name}</span>
                    <span style={styles.deptMeta}>
                      의사 {count}명{dept.is_active ? '' : ' · 사용 중지됨'}
                    </span>
                  </div>
                  <div style={styles.rowActions}>
                    <button type="button" className={btnGhost} onClick={() => startEdit(dept)}>
                      이름 수정
                    </button>
                    {dept.is_active ? (
                      <button type="button" className={btnGhost} onClick={() => clickDeactivate(dept)}>
                        사용 중지
                      </button>
                    ) : (
                      <button type="button" className={btnGhost} onClick={() => onReactivate(dept.id)}>
                        다시 사용
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>

      {blocking && (
        <ConfirmDialog
          title="이 진료과는 아직 사용 중지할 수 없습니다"
          cancelLabel="닫기"
          confirmLabel="직원 관리로 가기"
          onCancel={() => setBlocking(null)}
          onConfirm={() => {
            setBlocking(null)
            onGoToStaff()
          }}
        >
          <p style={styles.blockMsg}>
            이 진료과에 진료 중인 의사 {blocking.doctors.length}명이 있습니다.
          </p>
          <ul style={styles.blockList}>
            {blocking.doctors.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p style={styles.blockHint}>먼저 직원 관리에서 해당 의사를 사용 중지해 주세요.</p>
        </ConfirmDialog>
      )}

      {confirming && (
        <ConfirmDialog
          title="이 진료과를 사용 중지할까요?"
          message="환자 앱·상담봇의 목록에서 빠지지만, 지난 예약에는 그대로 남습니다. 언제든 다시 사용할 수 있습니다."
          cancelLabel="취소"
          confirmLabel="사용 중지"
          onCancel={() => setConfirming(null)}
          onConfirm={() => void confirmDeactivate(confirming)}
        />
      )}

      {actionError && (
        <p role="alert" style={styles.actionError}>{actionError}</p>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  addRow: { display: 'flex', gap: 8, marginBottom: 12 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    background: 'var(--color-surface)',
  },
  rowInactive: { background: 'var(--color-done-bg)', color: 'var(--color-done)' },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 2 },
  deptName: { fontWeight: 'var(--fw-body)' as CSSProperties['fontWeight'], fontSize: 'var(--fs-body)' },
  deptMeta: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  rowActions: { display: 'flex', gap: 8 },
  blockMsg: { margin: '0 0 6px', fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  blockList: { margin: '0 0 6px', paddingLeft: 18, fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  blockHint: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  actionError: { margin: '10px 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-danger)' },
}
