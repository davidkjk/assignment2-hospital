import type { CSSProperties } from 'react'
import type { AccessLogRow } from '../../api/accessLogs'
import { AlertTriangle } from '../../components/icons'
import { LogKindBadge, staffDisplay } from './LogKindBadge'
import { BulkRevealRow } from './BulkRevealRow'
import { formatAccessedAt, groupRows } from './logRows'

// [ALOG-LIST-*] 감사 표 — 네 열 「누가·언제·누구의·무엇을」. 읽기 전용(행에 편집·삭제·되돌리기 없음).
//
// ⭐ 행·이름을 눌러도 환자 상세로 튀지 않는다(ALOG-LIST-10) — 같은 화면의 patient_id 필터만 바뀐다.
//    감사 화면에서 환자 상세로 자동 이동시키면, 기록을 보러 왔다가 새 열람 기록을 만들게 된다.
// ⭐ 로딩 중엔 표 머리를 유지하고 이전 환자 행을 잠깐이라도 안 섞는다(ALOG-STATE-01).

const COLUMNS = ['열람 시각', '열람 직원', '환자', '열람 자료'] as const

interface LogTableProps {
  rows: AccessLogRow[]
  /** 이름 누르면 그 환자로 필터(ALOG-LIST-10). 환자 상세로 이동하지 않는다. */
  onSelectPatient?: (patientId: string) => void
  /** 로딩 중 — 표 머리만 남기고 skeleton 4행(ALOG-STATE-01). */
  loading?: boolean
  /** 마지막 묶음이 다음 페이지로 이어질 수 있을 때(ALOG-GROUP-01 꼬리). */
  nextCursor?: string | null
}

export function LogTable({ rows, onSelectPatient, loading = false, nextCursor = null }: LogTableProps) {
  const nodes = groupRows(rows)
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c} scope="col" style={styles.th}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <SkeletonRows />
        ) : (
          nodes.map((node, idx) => {
            if (node.kind === 'bulk') {
              const isLast = idx === nodes.length - 1
              return <BulkRevealRow key={node.key} node={node} hasMore={isLast && nextCursor != null} />
            }
            return <SingleRow key={node.row.id} row={node.row} onSelectPatient={onSelectPatient} />
          })
        )}
      </tbody>
    </table>
  )
}

function SingleRow({ row, onSelectPatient }: { row: AccessLogRow; onSelectPatient?: (id: string) => void }) {
  return (
    <tr data-testid="log-row" data-resource={row.resource_type} style={styles.row}>
      <td style={styles.cell}>{formatAccessedAt(row.accessed_at)}</td>
      <td style={styles.cell}>{staffDisplay(row.staff_name)}</td>
      <td style={styles.cell}>
        <PatientCell row={row} onSelectPatient={onSelectPatient} />
      </td>
      <td style={styles.cell}>
        <div style={styles.kindWrap}>
          <LogKindBadge resourceType={row.resource_type} />
          <ResourceDetail row={row} />
        </div>
      </td>
    </tr>
  )
}

// [ALOG-LIST-04·10·13][ALOG-AUDIT-01] 환자 칸 — 환자 사건은 마스킹 식별자(누르면 필터),
// 검색은 「검색 범위: 전체」, 환자 없는 관리자 활동은 「해당 없음」.
function PatientCell({ row, onSelectPatient }: { row: AccessLogRow; onSelectPatient?: (id: string) => void }) {
  if (row.resource_type === 'search') {
    return <span style={styles.muted}>검색 범위: 전체</span>
  }
  if (row.resource_type === 'stats_drilldown' || row.resource_type === 'stats_export') {
    return <span style={styles.muted}>해당 없음</span>
  }
  const p = row.patient
  if (!p) return <span style={styles.muted}>—</span>
  const label = [p.name, p.masked_birth_date].filter(Boolean).join(' · ') || '—'
  if (!onSelectPatient) return <span>{label}</span>
  // 링크형 버튼 — 편집·삭제가 아니라 같은 화면 필터로 좁힌다(ALOG-LIST-10).
  return (
    <button type="button" onClick={() => onSelectPatient(p.patient_id)} style={styles.patientLink}>
      {label}
    </button>
  )
}

// [ALOG-AUDIT-01][ALOG-LIST-12] 배지 옆 보조 설명 — 검색어·병합 되돌림 사유 등. 열람과 안 섞는다.
function ResourceDetail({ row }: { row: AccessLogRow }) {
  if (row.resource_type === 'search') {
    return (
      <span style={styles.detail}>
        {row.search_term ? `검색어: “${row.search_term}”` : null}
        {/* [SEARCH-LOG-06] 조각 하나로 기준 이상 조회 = 넓은 검색. 특정인 조회가 아니라 훑어본 정황을 관리자에게 표시. */}
        {row.is_wide_search && (
          <span style={styles.wideSearch}>
            <AlertTriangle style={styles.wideSearchIcon} aria-hidden />
            넓은 검색
          </span>
        )}
      </span>
    )
  }
  // 병합 되돌림 사유는 적재 쪽(Task 21)이 붙으면 그대로 그린다 — 지금 계약엔 아직 없다.
  const reason = (row as { reason?: string }).reason
  if (row.resource_type === 'patient_merge_undo' && reason) {
    return <span style={styles.detail}>사유: {reason}</span>
  }
  return null
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <tr key={i} data-testid="skeleton-row" style={styles.row} aria-hidden="true">
          {COLUMNS.map((c) => (
            <td key={c} style={styles.cell}>
              <span style={styles.skeleton} />
            </td>
          ))}
        </tr>
      ))}
      <tr>
        <td colSpan={COLUMNS.length} style={styles.loadingCell} role="status">
          기록을 불러오는 중입니다
        </td>
      </tr>
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  table: { width: '100%', borderCollapse: 'collapse', background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)' },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: 'var(--fs-sm)',
    fontWeight: 700,
    color: 'var(--color-ink-muted)',
    borderBottom: '1px solid var(--color-divider)',
    background: 'var(--color-bg)',
    whiteSpace: 'nowrap',
  },
  row: { borderTop: '1px solid var(--color-divider)' },
  cell: { padding: '8px 12px', fontSize: 'var(--fs-base)', color: 'var(--color-ink)', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' },
  muted: { color: 'var(--color-ink-muted)' },
  kindWrap: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  detail: { color: 'var(--color-ink-muted)', fontSize: 'var(--fs-sm)' },
  wideSearch: {
    display: 'inline-flex', alignItems: 'center', gap: '3px', marginLeft: '8px',
    color: 'var(--color-warn)', fontWeight: 600, fontSize: 'var(--fs-sm)',
  },
  wideSearchIcon: { width: '0.85em', height: '0.85em' },
  patientLink: {
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    textAlign: 'left',
    cursor: 'pointer',
  },
  skeleton: { display: 'block', height: 12, width: '70%', borderRadius: 6, background: 'var(--color-divider)' },
  loadingCell: { padding: '10px 12px', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 'var(--fs-base)' },
}
