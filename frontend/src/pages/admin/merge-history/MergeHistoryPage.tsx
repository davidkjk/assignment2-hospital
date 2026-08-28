import { type CSSProperties } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { RequireRole } from '../../../auth/RequireRole'
import { ADMIN_ONLY } from '../../../auth/roles'
import { useConnectivity } from '../../../lib/connectivity'
import { EmptyState } from '../../../components/EmptyState'
import { getMergeHistory, statusBadge, type MergeUndoStatus } from '../../../api/mergeHistory'

// [MHIST-SHELL-* · LIST-* · EXC-01·04] 병합 되돌림 이력 목록 — 관리자 전용.
// ⭐ 목록 행에는 즉시 되돌림 버튼을 두지 않는다(MHIST-LIST-01·04). 되돌림은 상세의 사유·확인을 거친다.
// ⭐ 권한 거부는 /login이 아니라 안내 + 역할 화면 출구다(MHIST-EXC-01) — 이 화면이 스스로 판정한다.

export function MergeHistoryPage() {
  // MHIST-EXC-01 — 관리자 외 접근은 권한 안내 + 역할 기본 화면으로, /login이 아니다. 형제 admin
  // 화면(MergeCandidatesPage 등)과 같은 관례: 페이지가 스스로 RequireRole로 감싼다. RequireRole은
  // nav 항목 경로면 표를 근거로 판정하므로, App.tsx 배선에서 이중 래핑돼도 결과가 같다(멱등).
  return (
    <RequireRole roles={ADMIN_ONLY}>
      <MergeHistoryInner />
    </RequireRole>
  )
}

function MergeHistoryInner() {
  const navigate = useNavigate()
  const { online } = useConnectivity()

  const q = useInfiniteQuery({
    queryKey: ['merge-history'],
    queryFn: ({ pageParam }) => getMergeHistory(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    refetchOnWindowFocus: false,
    staleTime: 0,
  })

  const rows = q.data?.pages.flatMap((p) => p.rows) ?? []

  return (
    <main data-merge-history style={styles.page} aria-labelledby="mhist-title">
      <h1 id="mhist-title" style={styles.title}>병합 되돌림 이력</h1>
      <p style={styles.desc}>이미 발생한 환자 병합을 조회하고, 관리자가 되돌림을 검토합니다</p>

      {!online && (
        // MHIST-EXC-02 — route를 유지하고 낡음을 알린다. 되돌림 판단은 상세에서 최신 상태로만.
        <div role="status" style={styles.offline}>
          인터넷이 연결되어 있지 않습니다. 연결되면 최신 이력을 다시 불러옵니다.
        </div>
      )}

      {q.isLoading ? (
        <div aria-busy="true">
          <p style={styles.loading}>병합 이력을 불러오는 중입니다</p>
          <div data-testid="skeleton" style={styles.skeleton} />
          <div data-testid="skeleton" style={styles.skeleton} />
        </div>
      ) : q.isError && rows.length === 0 ? (
        <EmptyState kind="error" onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        // MHIST-EXC-04 — 0건은 조회 실패가 아니라 사실이라 [다시 시도]를 두지 않는다.
        <EmptyState
          kind="zero"
          message="병합 되돌림 이력이 없습니다"
          action={
            <button type="button" style={styles.zeroAction} onClick={() => navigate('/admin/patient-merge-candidates')}>
              병합 후보 보기
            </button>
          }
        />
      ) : (
        <div style={styles.list} role="list">
          <div style={styles.headRow} aria-hidden="true">
            <span>병합 시각</span><span>실행자</span><span>대표 → 대상</span><span>상태</span><span />
          </div>
          {rows.map((r) => (
            <div key={r.id} role="listitem" data-row data-merge-event-id={r.merge_event_id} style={styles.row}>
              <span style={styles.when}>{r.merged_at}</span>
              <span style={styles.who}>{r.executed_by}</span>
              <span style={styles.parties}>
                <span>{r.primary.name}</span>
                <span aria-hidden="true" style={styles.arrow}>→</span>
                <span>{r.merged.name}</span>
              </span>
              <span data-badge style={badgeStyle(r.status)}>{statusBadge(r.status)}</span>
              <button type="button" style={styles.detailBtn} onClick={() => navigate(`/admin/merge-history/${r.merge_event_id}`)}>
                상세 보기
              </button>
            </div>
          ))}
          {q.hasNextPage && (
            <button type="button" style={styles.more} disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              {q.isFetchingNextPage ? '◌ 더 불러오는 중…' : '더 보기'}
            </button>
          )}
        </div>
      )}
    </main>
  )
}

function badgeStyle(status: MergeUndoStatus): CSSProperties {
  const base = styles.badge
  if (status === 'undone') return { ...base, background: 'var(--color-done-bg)', color: 'var(--color-done)' }
  if (status === 'locked') return { ...base, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
  return { ...base, background: 'var(--color-primary-wash)', color: 'var(--color-primary)' }
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 20, maxWidth: 960, margin: '0 auto' },
  title: { margin: '0 0 4px', fontSize: 'var(--fs-xl)', color: 'var(--color-ink)' },
  desc: { margin: '0 0 14px', fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  offline: {
    margin: '0 0 12px', padding: '10px 14px', borderRadius: 10,
    borderLeft: '4px solid var(--color-danger)', background: 'var(--color-danger-bg)',
    fontSize: 'var(--fs-base)', color: 'var(--color-ink)',
  },
  loading: { margin: '0 0 10px', fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  skeleton: { height: 52, borderRadius: 'var(--radius-card)', marginBottom: 10, background: 'var(--color-divider)', opacity: 0.55 },
  list: { display: 'flex', flexDirection: 'column', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)', overflow: 'hidden', background: 'var(--color-surface)' },
  headRow: {
    display: 'grid', gridTemplateColumns: '160px 90px 1fr 92px 96px', gap: 12, alignItems: 'center',
    padding: '8px 14px', background: 'var(--color-bg)', color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)', fontWeight: 700, borderBottom: '1px solid var(--color-divider)',
  },
  row: {
    display: 'grid', gridTemplateColumns: '160px 90px 1fr 92px 96px', gap: 12, alignItems: 'center',
    padding: '10px 14px', borderTop: '1px solid var(--color-divider)', fontSize: 'var(--fs-base)', color: 'var(--color-ink)',
  },
  when: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink-muted)' },
  who: { fontWeight: 600 },
  parties: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  arrow: { color: 'var(--color-ink-muted)' },
  badge: { justifySelf: 'start', padding: '2px 9px', borderRadius: 999, fontSize: 'var(--fs-sm)', fontWeight: 700, whiteSpace: 'nowrap' },
  detailBtn: {
    height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
  },
  zeroAction: {
    height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-base)', fontWeight: 700, cursor: 'pointer',
  },
  more: {
    alignSelf: 'center', margin: 12, height: 34, padding: '0 16px', borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)', color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
}
