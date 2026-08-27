import { useEffect, useRef, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { getStatsDetail, type DrilldownRow } from '../../api/stats'

// [STAT-DRILL-01~04][결정21·24] 셀·지표를 눌러 여는 마스킹 명단.
//
// ⭐ 명단은 서버가 마스킹해 보낸 값만 보인다(홍*동·010-****-5678·1990-**-**) — 원본은 응답에
//    아예 없다(MASK-SRV-01). 훑어보기용이고, 전체가 필요하면 행을 눌러 그 환자 상세로 간다
//    (내부 patient_id, 마스킹 값 재검색 아님) — 거기서 PTDET-HEAD-04 열람 기록이 남는다.
// ⭐ 이 명단 조회 자체가 stats_drilldown 감사를 남긴다(결정22) — 서버가 /stats/detail 안에서
//    남기므로 여기서 따로 감사 요청을 보내지 않는다(이중 기록 방지).

interface DrilldownModalProps {
  target: { metric: string; label: string; dept?: string }
  period: { from: string; to: string }
  onClose: () => void
}

export function DrilldownModal({ target, period, onClose }: DrilldownModalProps) {
  const navigate = useNavigate()
  const closeRef = useRef<HTMLButtonElement>(null)

  const query = useQuery({
    queryKey: ['stats-detail', target.metric, target.dept ?? null, period.from, period.to],
    queryFn: () => getStatsDetail(target.metric, period.from, period.to, { dept: target.dept }),
  })

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const page = query.data
  const rows = page?.rows ?? []
  const partial = page && page.total != null && page.total > rows.length

  return (
    <div style={styles.scrim} data-testid="drilldown-scrim">
      <div role="dialog" aria-modal="true" aria-label={`${target.label} 상세 명단`} style={styles.dialog}>
        <header style={styles.head}>
          <div>
            <h2 style={styles.title}>{target.label} 상세 명단</h2>
            <p style={styles.sub} data-testid="drilldown-scope">
              {period.from} ~ {period.to}
              {partial ? ` · 최근 ${rows.length}건` : rows.length > 0 ? ` · ${rows.length}건` : ''}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" style={styles.close}>
            ✕
          </button>
        </header>

        <div style={styles.notice}>
          훑어보기용 마스킹 명단입니다. 전체 정보가 필요하면 행을 눌러 환자 상세로 이동하세요 —
          그 열람은 접근 기록에 남습니다.
        </div>

        <div style={styles.body}>
          {query.isPending && <p role="status" style={styles.status}>명단을 불러오는 중입니다</p>}
          {query.isError && <EmptyState kind="error" onRetry={() => query.refetch()} />}
          {page && rows.length === 0 && (
            <EmptyState kind="zero" message="이 기간·지표에 해당하는 명단이 없습니다" />
          )}
          {page && rows.length > 0 && (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>환자</th>
                  <th style={styles.th}>전화 · 생년월일</th>
                  <th style={styles.th}>시각</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.id ?? r.patient_id} row={r} onOpen={() => navigate(`/patients/${r.patient_id}`)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ row, onOpen }: { row: DrilldownRow; onOpen: () => void }) {
  const when = row.occurred_at ?? (row.wait_minutes != null ? `대기 ${row.wait_minutes}분` : '')
  return (
    <tr style={styles.tr}>
      <td style={styles.td}>
        <button type="button" aria-label={`${row.masked_name ?? '환자'} 환자 상세 보기`} onClick={onOpen} style={styles.rowBtn}>
          {row.masked_name ?? '—'}
        </button>
      </td>
      <td style={styles.tdMuted}>
        {row.masked_phone ?? '—'} · {row.masked_birth_date ?? '—'}
      </td>
      <td style={styles.tdMuted}>{when}</td>
    </tr>
  )
}

const styles: Record<string, CSSProperties> = {
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(16,36,58,.30)',
  },
  dialog: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: 640,
    maxHeight: '80vh',
    overflow: 'hidden',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-divider)',
  },
  title: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  sub: { margin: '2px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  close: {
    border: 'none',
    background: 'none',
    fontSize: 16,
    color: 'var(--color-ink-muted)',
    cursor: 'pointer',
    lineHeight: 1,
  },
  notice: {
    padding: '8px 16px',
    background: 'var(--color-primary-wash)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)',
  },
  body: { minHeight: 0, flex: 1, overflowY: 'auto' },
  status: { padding: 24, textAlign: 'center', color: 'var(--color-ink-muted)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' },
  th: {
    position: 'sticky',
    top: 0,
    padding: '8px 16px',
    textAlign: 'left',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    color: 'var(--color-ink-muted)',
    background: 'var(--color-bg)',
    borderBottom: '1px solid var(--color-divider)',
  },
  tr: { borderBottom: '1px solid var(--color-divider)' },
  td: { padding: '8px 16px' },
  tdMuted: { padding: '8px 16px', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  rowBtn: {
    border: 'none',
    background: 'none',
    padding: 0,
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
