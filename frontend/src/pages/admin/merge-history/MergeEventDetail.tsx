import { useState, type CSSProperties } from 'react'
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { RequireRole } from '../../../auth/RequireRole'
import { ADMIN_ONLY } from '../../../auth/roles'
import { useConnectivity } from '../../../lib/connectivity'
import { EmptyState } from '../../../components/EmptyState'
import { getMergeEvent, type MergeEventData, type MergeHistoryPage } from '../../../api/mergeHistory'
import { formatHospitalDateTime } from '../../../lib/clock'
import { UndoReasonStep } from './UndoReasonStep'
import { UndoConfirmDialog } from './UndoConfirmDialog'
import { LockedEventPanel } from './LockedEventPanel'
import { TextButton } from '@/components/staff-ui'

// [MHIST-DETAIL-* · REASON-* · CONFIRM-* · DONE-* · LOCK-* · NAV-* · EXC-*] 병합 이벤트 상세.
// 한 상태기계로 사유·확인창·완료를 닫는다(라우트를 새로 만들지 않는다). 직접 URL도 같은 권한 검사.

type Stage = 'view' | 'reason' | 'confirm' | 'done'

interface DoneSummary {
  merged_at: string
  executed_by: string
  reason: string
}

export function MergeEventDetail() {
  // MHIST-EXC-01/DETAIL-01 — direct URL도 같은 권한 검사. 형제 admin 화면과 같은 RequireRole 관례.
  return (
    <RequireRole roles={ADMIN_ONLY}>
      <MergeEventDetailInner />
    </RequireRole>
  )
}

function MergeEventDetailInner() {
  const { mergeEventId } = useParams()
  const id = mergeEventId ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { online } = useConnectivity()
  const [stage, setStage] = useState<Stage>('view')
  const [reason, setReason] = useState('')
  const [done, setDone] = useState<DoneSummary | null>(null)

  const q = useQuery({
    queryKey: ['merge-event', id],
    queryFn: () => getMergeEvent(id),
    enabled: !!id,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })

  if (q.isLoading) {
    return (
      <main data-merge-event-detail style={styles.page}>
        <p role="status" style={styles.loading}>병합 이벤트를 불러오는 중입니다</p>
      </main>
    )
  }
  if (q.isError || !q.data) {
    return (
      <main data-merge-event-detail style={styles.page}>
        <EmptyState kind="error" onRetry={() => void q.refetch()} />
      </main>
    )
  }
  const ev = q.data

  if (stage === 'done' && done) {
    // MHIST-DONE-01·02 — 무엇이 지워지지 않았는지 명시하고, 최신 목록으로만 되돌아간다.
    return (
      <main data-merge-event-detail style={styles.page} aria-labelledby="mev-done-title">
        <h1 id="mev-done-title" style={styles.doneTitle}>되돌림 완료</h1>
        <p style={styles.doneNote}>대표·대상의 계보 연결을 끊는 정정입니다. 원본 예약·문진·의료기록·감사기록을 지우지 않았습니다.</p>
        <dl style={styles.summary}>
          <Item label="처리 시각" value={formatHospitalDateTime(done.merged_at)} />
          <Item label="관리자" value={done.executed_by} />
          <Item label="사유" value={done.reason} />
        </dl>
        <p style={styles.doneAudit}>이 되돌림은 별도 감사 이벤트로 남습니다.</p>
        <button type="button" style={styles.primaryBtn} onClick={() => navigate('/admin/merge-history')}>
          이력으로 돌아가기
        </button>
      </main>
    )
  }

  function markListUndone() {
    queryClient.setQueryData<InfiniteData<MergeHistoryPage>>(['merge-history'], (old) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map((pg) => ({
          ...pg,
          rows: pg.rows.map((r) => (r.merge_event_id === id ? { ...r, status: 'undone' as const } : r)),
        })),
      }
    })
  }

  const undoable = ev.undo_status === 'undoable'

  return (
    <main data-merge-event-detail style={styles.page} aria-labelledby="mev-title">
      {/* MHIST-NAV-02 — 상세에서 목록으로 돌아가는 출구(막다른 길 방지). 목록은 최신 상태로 다시 읽는다. */}
      <TextButton style={{ marginBottom: 10 }} onClick={() => navigate('/admin/merge-history')}>← 이력으로</TextButton>
      <h1 id="mev-title" style={styles.title}>병합 이벤트</h1>

      {!online && (
        // MHIST-EXC-02 — route 유지 + 오프라인 배너. role=status는 내용으로 이름이 서지 않아 aria-label로 붙인다.
        <div role="status" aria-label="인터넷이 연결되어 있지 않습니다" style={styles.offline}>
          인터넷이 연결되어 있지 않습니다
        </div>
      )}

      {/* MHIST-DETAIL-02 — 보존 스냅샷은 읽기 전용. 원본을 화면에서 덮어쓰지 않는다. */}
      {/* MHIST-DETAIL-01 — 대표·대상을 표시명 + patient ID로 각각 보인다(동명이인 병합 식별). */}
      <dl style={styles.summary}>
        <Item label="병합 시각" value={formatHospitalDateTime(ev.merged_at)} />
        <Item label="실행자" value={ev.executed_by} />
        <Item label="대표 환자" value={partyLabel(ev.primary)} />
        <Item label="병합된 대상" value={partyLabel(ev.merged)} />
      </dl>

      <section aria-label="보존 상태" style={styles.preserve}>
        <h2 style={styles.preserveTitle}>병합으로 지워지지 않은 기록</h2>
        <ul style={styles.preserveList}>
          <li>예약 {ev.preservation.merged.appointments}건 보존</li>
          <li>문진 {ev.preservation.merged.questionnaires}건 보존</li>
          <li>의료기록 {ev.preservation.merged.medical_records}건 보존</li>
          <li>열람 기록 {ev.preservation.merged.access_logs}건 보존</li>
        </ul>
        <p style={styles.lineage}>계보 연결: {ev.preservation.lineage_active ? '유지됨(대표가 함께 읽음)' : '끊김'}</p>
      </section>

      {undoable ? (
        <div style={styles.actionRow}>
          <button
            type="button"
            style={online ? styles.primaryBtn : styles.primaryBtnOff}
            disabled={!online}
            onClick={() => setStage('reason')}
          >
            되돌림 검토
          </button>
          {!online && <p style={styles.reasonHint}>연결되면 되돌릴 수 있습니다</p>}
        </div>
      ) : (
        // MHIST-DETAIL-03 · LOCK-* — 완료·되돌림불가는 잠김 패널로. 되돌림 버튼을 두지 않는다.
        <LockedEventPanel event={ev} />
      )}

      {stage === 'reason' && (
        <UndoReasonStep
          reason={reason}
          onReason={setReason}
          onContinue={() => setStage('confirm')}
          onCancel={() => setStage('view')}
        />
      )}

      {stage === 'confirm' && (
        <UndoConfirmDialog
          event={ev}
          reason={reason}
          onConfirmed={() => {
            markListUndone()
            // 처리 시각 = 되돌린 순간(원 병합시각이 아니다). 서버가 시각을 안 줘 화면 시계로 찍는다.
            setDone({ merged_at: new Date().toISOString(), executed_by: ev.executed_by, reason })
            setStage('done')
          }}
          onCancel={() => setStage('view')}
        />
      )}
    </main>
  )
}

// 표시명 + patient ID(UUID 앞 8자) — 동명이인 병합을 눈으로 가른다(MHIST-DETAIL-01).
function partyLabel(p: { name: string; patient_id?: string }): string {
  if (!p.patient_id) return p.name
  const id = p.patient_id.length > 10 ? p.patient_id.slice(0, 8) : p.patient_id
  return `${p.name} (${id})`
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.item}>
      <dt style={styles.itemLabel}>{label}</dt>
      <dd style={styles.itemValue}>{value}</dd>
    </div>
  )
}

// 상세 상태 판정을 쓰는 곳에서 재사용하기 위해 타입만 노출한다.
export type { MergeEventData }

const styles: Record<string, CSSProperties> = {
  page: { padding: 20, maxWidth: 720, margin: '0 auto' },
  title: { margin: '0 0 12px', fontSize: 'var(--fs-title)', color: 'var(--color-ink)' },
  loading: { fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  offline: {
    margin: '0 0 12px', padding: '10px 14px', borderRadius: 10,
    borderLeft: '4px solid var(--color-danger)', background: 'var(--color-danger-bg)',
    fontSize: 'var(--fs-body)', color: 'var(--color-ink)',
  },
  summary: { margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 8, padding: 14, border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)', background: 'var(--color-surface)' },
  item: { display: 'grid', gridTemplateColumns: '96px 1fr', gap: 10, fontSize: 'var(--fs-body)' },
  itemLabel: { margin: 0, color: 'var(--color-ink-muted)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  itemValue: { margin: 0, color: 'var(--color-ink)' },
  preserve: { margin: '0 0 16px', padding: 14, border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)', background: 'var(--color-bg)' },
  preserveTitle: { margin: '0 0 8px', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  preserveList: { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  lineage: { margin: '10px 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  actionRow: { display: 'flex', alignItems: 'center', gap: 12 },
  reasonHint: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  primaryBtn: { height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer' },
  primaryBtnOff: { height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--color-sidebar-ink)', color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], opacity: 0.5, cursor: 'not-allowed' },
  doneTitle: { margin: '0 0 8px', fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  doneNote: { margin: '0 0 14px', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  doneAudit: { margin: '12px 0 16px', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
}
