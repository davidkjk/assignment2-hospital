import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dialogStyles } from '../../../components/ConfirmDialog'
import { ApiError } from '../../../api/httpClient'
import { ROLE_LABEL } from '../../../auth/roles'
import { staffApi, type StaffMember } from '../../../api/staff'
import { formatImpactTime } from './staffFormat'

// [STAFF-DEACT-01~10·NAVX-STAFF-01] 의사 사용 중지 — 결정10 A안.
// ⭐ 팝업은 「그래도 끌까」 하나만 묻는다 — 정책을 고르게 하지 않고 확정 버튼도 잠그지 않는다(06).
// ⭐ 영향 예약은 건수·날짜·시각만(이름·전화 없음, 04). 0건이면 정책 안내를 열지 않는다(05).
// ⭐ 확정이 자동 취소·재배정·환자 알림을 부르지 않는다(07·08) — 갈 길은 /today 확인 필요 카드다.
// ⭐ 본인·마지막관리자·경합은 409를 사람 문장으로 그 자리에 남긴다(막다른 길 금지, 03·09).

interface DeactivateDialogProps {
  target: StaffMember
  departmentName: string | null
  onCancel(): void
  /** 성공 시 — 영향 예약 건수를 넘겨 준다(0이면 안내 배너를 띄우지 않는다). */
  onDone(count: number): void
}

interface DialogError {
  msg: string
  /** 경합(최신 상태 변경)이면 [다시 확인]으로 최신을 다시 읽게 한다(09). */
  stale: boolean
}

export function DeactivateDialog({ target, departmentName, onCancel, onDone }: DeactivateDialogProps) {
  const impactQ = useQuery({
    queryKey: ['deactivation-impact', target.id],
    queryFn: () => staffApi.deactivationImpact(target.id),
  })
  const [error, setError] = useState<DialogError | null>(null)
  const [busy, setBusy] = useState(false)

  const impact = impactQ.data
  const subtitle = [target.name, ROLE_LABEL[target.role], departmentName].filter(Boolean).join(' · ')

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await staffApi.deactivate(target.id, impact?.version ?? null)
      onDone(impact?.count ?? 0)
    } catch (err) {
      if (err instanceof ApiError) {
        const stale = err.status === 409 && /최신|바뀌|다시 확인/.test(err.message)
        setError({ msg: err.message, stale })
      } else {
        setError({ msg: '중지하지 못했습니다', stale: false })
      }
    } finally {
      setBusy(false)
    }
  }

  async function recheck() {
    setError(null)
    await impactQ.refetch()
  }

  return (
    <div style={dialogStyles.scrim} data-testid="deactivate-scrim">
      <div role="dialog" aria-modal="true" aria-label="직원 사용 중지" style={dialogStyles.dialog}>
        <h2 style={styles.title}>직원 사용 중지</h2>
        <p style={styles.subtitle}>{subtitle}</p>
        <p style={styles.session}>사용 중지하면 이 계정의 모든 로그인 세션이 끊깁니다.</p>

        <div style={styles.impact}>
          {impactQ.isLoading && <p style={styles.muted}>영향 예약을 확인하는 중…</p>}
          {impact && impact.count === 0 && <p style={styles.muted}>영향받는 미래 예약 없음</p>}
          {impact && impact.count > 0 && (
            <>
              <p style={styles.impactHead}>확인 필요한 예약 {impact.count}건</p>
              <ul style={styles.times}>
                {impact.times.map((t) => (
                  <li key={`${t.date} ${t.time}`} style={styles.time}>
                    {formatImpactTime(t)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {error && (
          <div role="alert" style={styles.error}>
            <span>{error.msg}</span>
            {error.stale && (
              <button type="button" onClick={() => void recheck()} style={styles.recheck}>
                다시 확인
              </button>
            )}
          </div>
        )}

        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.cancel}>
            취소
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            aria-busy={busy}
            style={styles.confirm}
          >
            {busy ? '◌ 중지하는 중…' : '사용 중지'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  title: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  subtitle: { margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  session: { margin: 'var(--sp-1) 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  impact: { marginTop: 'var(--sp-4)', padding: 'var(--sp-3)', borderRadius: 8, background: 'var(--color-bg)', border: '1px solid var(--color-divider)' },
  muted: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  impactHead: { margin: 0, fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-warn)' },
  // [L31·G2] 영향 예약이 많아도(예: 126건) 목록이 화면을 넘겨 [사용 중지] 버튼을 밀어내지 않게 — 목록만 내부 스크롤.
  times: { margin: 'var(--sp-2) 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', maxHeight: '38vh', overflowY: 'auto' },
  time: { fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  error: {
    marginTop: 'var(--sp-3)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    borderLeft: '4px solid var(--color-danger)',
    padding: 'var(--sp-2) 0 var(--sp-2) var(--sp-3)',
    color: 'var(--color-danger)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
  },
  recheck: {
    height: 28,
    padding: '0 var(--sp-3)',
    borderRadius: 7,
    border: '1px solid var(--color-danger)',
    background: 'var(--color-surface)',
    color: 'var(--color-danger)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-5)' },
  cancel: {
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
  confirm: {
    height: 34,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-danger)',
    color: '#fff',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
}
