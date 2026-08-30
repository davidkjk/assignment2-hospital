import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { RequireRole } from '../../../auth/RequireRole'
import { ADMIN_ONLY } from '../../../auth/roles'
import { useConnectivity } from '../../../lib/connectivity'
import { EmptyState } from '../../../components/EmptyState'
import { patientMergeApi, type CandidateRow, type MergeResult } from '../../../api/patientMerge'
import { CandidateGroup } from './CandidateGroup'
import { ComparePanel } from './ComparePanel'
import { MergeConfirmDialog } from './MergeConfirmDialog'

// [MERGE-SHELL-01~03 · HEAD-01·02 · LIST-06 · STATE-01~03] 중복 환자 병합 — 관리자 전용.
// ⭐⭐ 비가역·파괴적 기능. 안전 UX가 최우선이다. 화면은 상태 하나로 3단계를 정한다(결정 #18):
//     목록(list) → 좌·우 비교(compare) → 확인창(confirm). 라우트를 새로 만들지 않는다.
// ⭐ 이 화면 진입 자체는 「특정 환자를 연 것」이 아니라 열람 감사를 남기지 않는다(SHELL-03).

type Stage =
  | { kind: 'list' }
  | { kind: 'compare'; leftId: string; rightId: string; primaryId: string | null }
  | { kind: 'confirm'; primaryId: string; duplicateId: string }
  | { kind: 'success'; result: MergeResult; primaryName: string; duplicateName: string }

export function MergeCandidatesPage() {
  return (
    <RequireRole roles={ADMIN_ONLY}>
      <MergeCandidatesInner />
    </RequireRole>
  )
}

function MergeCandidatesInner() {
  const { online } = useConnectivity()
  const [stage, setStage] = useState<Stage>({ kind: 'list' })

  const candidatesQ = useQuery({
    queryKey: ['merge-candidates'],
    queryFn: patientMergeApi.candidates,
    // 창 포커스만으로 다시 불러 비교·확인 중인 상태를 지우지 않는다 — 재조회는 손으로만 건다.
    refetchOnWindowFocus: false,
  })

  const groups = candidatesQ.data ?? []
  const rowById = useMemo(() => {
    const map = new Map<string, CandidateRow>()
    for (const g of groups) for (const r of g.rows) map.set(r.patient_id, r)
    return map
  }, [groups])

  function recheck() {
    setStage({ kind: 'list' })
    void candidatesQ.refetch()
  }

  return (
    <section style={styles.page} aria-label="중복 환자 후보">
      {/* 화면 제목은 셸 헤더가 그린다(`STAFF-SHELL-02` 개정, `MERGE-HEAD-01` 서술형 제목은 헤더로 이관) — 본문엔 설명만. */}
      <p style={styles.desc}>같은 사람의 환자 기록이 나뉘었는지 확인하고 병합을 검토합니다</p>

      {/* MERGE-HEAD-02 — 자동으로 합치지 않는다. 가족이 번호를 공유할 수 있음을 같은 자리에서 말한다. */}
      <div role="note" style={styles.notice}>
        <p style={styles.noticeStrong}>자동으로 합치지 않습니다</p>
        <p style={styles.noticeBody}>
          두 기록을 직접 비교하고 대표를 정한 뒤에만 검토를 시작합니다. 가족이 번호를 공유하면 실제로 다른 사람일 수 있습니다.
        </p>
      </div>

      {!online && (
        // MERGE-STATE-03 — 오프라인 고지. 검토 진입은 아래에서 잠근다(캐시로 확정 금지).
        <div role="status" style={styles.offline}>인터넷이 연결되어 있지 않습니다. 연결되면 최신 후보로 병합을 검토할 수 있습니다.</div>
      )}

      {stage.kind !== 'confirm' && stage.kind !== 'success' && (
        <div style={styles.toolbar}>
          {/* 재조회만 한다 — 지금 단계(목록·비교)는 그대로 둔다. 확인창의 [다시 확인]만 목록으로 되돌린다. */}
          <button type="button" onClick={() => void candidatesQ.refetch()} style={styles.recheck}>다시 확인</button>
        </div>
      )}

      {stage.kind === 'compare' && renderCompare()}
      {stage.kind === 'list' && renderList()}
      {stage.kind === 'success' && renderSuccess(stage.result, stage.primaryName, stage.duplicateName)}

      {stage.kind === 'confirm' && renderConfirm(stage.primaryId, stage.duplicateId)}
    </section>
  )

  function renderList() {
    if (candidatesQ.isFetching) {
      return (
        <div aria-busy="true">
          <p style={styles.loading}>중복 환자 후보를 불러오는 중입니다</p>
          <div data-testid="skeleton" style={styles.skeleton} />
          <div data-testid="skeleton" style={styles.skeleton} />
        </div>
      )
    }
    if (candidatesQ.isError) {
      return <EmptyState kind="error" onRetry={() => void candidatesQ.refetch()} />
    }
    if (groups.length === 0) {
      // MERGE-LIST-06 — 0건은 조회 실패가 아니라 사실이라 [다시 시도]를 두지 않는다.
      return (
        <div style={styles.zeroWrap}>
          <EmptyState kind="zero" message="현재 병합을 검토할 중복 환자가 없습니다" />
          <p style={styles.zeroHint}>새 후보가 생기면 이곳에 표시됩니다</p>
        </div>
      )
    }
    return (
      <div style={styles.groups}>
        {groups.map((g, i) => (
          <CandidateGroup
            key={g.key}
            index={i}
            group={g}
            disabled={!online}
            onReview={(leftId, rightId) => setStage({ kind: 'compare', leftId, rightId, primaryId: null })}
          />
        ))}
      </div>
    )
  }

  function renderCompare() {
    if (stage.kind !== 'compare') return null
    const left = rowById.get(stage.leftId)
    const right = rowById.get(stage.rightId)
    if (!left || !right) {
      // 재조회로 후보가 사라졌다(다른 직원이 먼저 병합). 목록으로 돌린다 — 막다른 길 방지.
      return <EmptyState kind="zero" message="이 후보는 더 이상 병합 대상이 아닙니다" action={<button type="button" onClick={() => setStage({ kind: 'list' })} style={styles.recheck}>후보 목록으로</button>} />
    }
    return (
      <>
        {/* MERGE-STATE-02 — 재조회 실패는 비교 상태를 지우지 않는다. 오류만 위에 붙인다. */}
        {candidatesQ.isError && <p role="alert" style={styles.compareErr}>후보를 다시 불러오지 못했습니다. 잠시 후 다시 확인하세요.</p>}
        <ComparePanel
          left={left}
          right={right}
          primaryId={stage.primaryId}
          onPickPrimary={(id) => setStage({ ...stage, primaryId: id })}
          onReview={() => stage.primaryId && setStage({
            kind: 'confirm',
            primaryId: stage.primaryId,
            duplicateId: stage.primaryId === left.patient_id ? right.patient_id : left.patient_id,
          })}
          onBack={() => setStage({ kind: 'list' })}
        />
      </>
    )
  }

  function renderConfirm(primaryId: string, duplicateId: string) {
    const primary = rowById.get(primaryId)
    const duplicate = rowById.get(duplicateId)
    if (!primary || !duplicate) return null
    return (
      <MergeConfirmDialog
        primary={primary}
        duplicate={duplicate}
        onCancel={() => setStage({ kind: 'compare', leftId: primaryId, rightId: duplicateId, primaryId })}
        onConfirmed={(result) =>
          setStage({ kind: 'success', result, primaryName: primary.name, duplicateName: duplicate.name })
        }
        onRecheck={recheck}
      />
    )
  }

  function renderSuccess(result: MergeResult, primaryName: string, duplicateName: string) {
    // MERGE-UNDO-03 — 사라졌다는 사실만 보이지 않고, 이력 ID·대표·비활성화된 행·정정 경로를 준다.
    // ⭐ 이 화면엔 되돌리기 버튼을 두지 않는다(MERGE-UNDO-01) — 되돌림은 사유가 필요한 무거운 동작이다.
    return (
      <section aria-label="병합 완료" style={styles.success}>
        <h2 style={styles.successTitle}>병합을 완료했습니다</h2>
        <dl style={styles.successItems}>
          <div style={styles.item}><dt style={styles.itemLabel}>병합 이력 ID</dt><dd style={styles.itemValue}>{result.merge_id}</dd></div>
          <div style={styles.item}><dt style={styles.itemLabel}>대표 환자</dt><dd style={styles.itemValue}>{primaryName}</dd></div>
          <div style={styles.item}><dt style={styles.itemLabel}>비활성화된 행</dt><dd style={styles.itemValue}>{duplicateName}</dd></div>
        </dl>
        <p style={styles.successNote}>정정이 필요하면 병합 이력 화면에서 관리자가 되돌릴 수 있습니다.</p>
        <div style={styles.successActions}>
          <button type="button" onClick={() => { setStage({ kind: 'list' }); void candidatesQ.refetch() }} style={styles.recheck}>후보 목록으로</button>
          <Link to="/admin/merge-history" style={styles.historyLink}>병합 이력 화면</Link>
        </div>
      </section>
    )
  }
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 20, maxWidth: 900, margin: '0 auto' },
  title: { margin: '0 0 4px', fontSize: 'var(--fs-xl)', color: 'var(--color-ink)' },
  desc: { margin: '0 0 14px', fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  notice: {
    margin: '0 0 14px', padding: '12px 14px', borderRadius: 10,
    borderLeft: '4px solid var(--color-warn)', background: 'var(--color-bg)',
  },
  noticeStrong: { margin: 0, fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)' },
  noticeBody: { margin: '4px 0 0', fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  offline: {
    margin: '0 0 12px', padding: '10px 14px', borderRadius: 10,
    borderLeft: '4px solid var(--color-done)', background: 'var(--color-done-bg)',
    fontSize: 'var(--fs-base)', color: 'var(--color-ink)',
  },
  toolbar: { display: 'flex', justifyContent: 'flex-end', marginBottom: 12 },
  recheck: {
    height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  groups: { display: 'flex', flexDirection: 'column', gap: 14 },
  loading: { margin: '0 0 10px', fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  skeleton: {
    height: 96, borderRadius: 'var(--radius-card)', marginBottom: 12,
    background: 'var(--color-divider)', opacity: 0.55,
  },
  zeroWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  zeroHint: { margin: '-28px 0 0', fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  compareErr: {
    margin: '0 0 12px', borderLeft: '4px solid var(--color-warn)', paddingLeft: 12,
    color: 'var(--color-warn)', fontSize: 'var(--fs-base)', fontWeight: 600,
  },
  success: {
    padding: 18, borderRadius: 'var(--radius-card)', border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)',
  },
  successTitle: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  successItems: { margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, fontSize: 'var(--fs-base)' },
  itemLabel: { margin: 0, color: 'var(--color-ink-muted)', fontWeight: 600 },
  itemValue: { margin: 0, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  successNote: { margin: '14px 0 0', fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  successActions: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 },
  // [L21] 옆의 [후보 목록으로]와 같은 테두리 버튼으로 — raw 링크로 크게·청록으로 튀지 않게(사용자 지적).
  historyLink: {
    display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 14px', borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
    color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
  },
}
