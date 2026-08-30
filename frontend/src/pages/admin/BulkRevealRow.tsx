import { useState, type CSSProperties } from 'react'
import type { AccessLogRow } from '../../api/accessLogs'
import { LogKindBadge, staffDisplay } from './LogKindBadge'
import { formatAccessedAt, type GroupNode } from './logRows'

// [ALOG-GROUP-01·02] 대량 번호 열람 한 줄 접기 → [개별 기록 보기]로 하위 행 펼침.
//
// ⛔ 3,000행을 표에 그대로 깔지 않는다 — 기록장이 안 읽힌다. 저장은 환자별 전수이되(서버) 표에선
//    한 줄로 접는다(화면). ⛔ 별도 화면으로 보내지 않는다(NAV-SHELL-03) — 같은 화면 하위 행으로만.
// ⚠️ raw 번호를 다시 풀지 않는다(MASK-SRV-01) — 하위 행도 마스킹 식별자만.

type BulkNode = Extract<GroupNode, { kind: 'bulk' }>

interface BulkRevealRowProps {
  node: BulkNode
  /** 묶음이 cursor 페이지 경계를 넘어 이어질 때(ALOG-GROUP-01 꼬리) — 「이 묶음은 더 있습니다」. */
  hasMore?: boolean
}

export function BulkRevealRow({ node, hasMore = false }: BulkRevealRowProps) {
  const [open, setOpen] = useState(false)
  const count = node.children.length

  return (
    <>
      <tr data-testid="bulk-head" style={styles.headRow}>
        <td style={styles.cell}>{formatAccessedAt(node.accessedAt)}</td>
        <td style={styles.cell}>{staffDisplay(node.staffName)}</td>
        <td style={{ ...styles.cell, ...styles.muted }}>{count.toLocaleString('en-US')}명</td>
        <td style={styles.cell}>
          <div style={styles.kindWrap}>
            <LogKindBadge resourceType="phone_reveal" />
            <span style={styles.summary}>발송 명단 번호 열람 · {count.toLocaleString('en-US')}명</span>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              style={styles.expandBtn}
            >
              {open ? '개별 기록 접기' : '개별 기록 보기'}
            </button>
          </div>
          {hasMore && <p style={styles.more}>이 묶음은 더 있습니다</p>}
        </td>
      </tr>

      {open &&
        node.children.map((child) => (
          <tr key={child.id} data-testid="bulk-child" style={styles.childRow}>
            <td style={{ ...styles.cell, ...styles.childCell }}>{formatAccessedAt(child.accessed_at)}</td>
            <td style={styles.cell}>{staffDisplay(child.staff_name)}</td>
            <td style={styles.cell}>{patientText(child)}</td>
            <td style={styles.cell}>
              <LogKindBadge resourceType="phone_reveal" />
            </td>
          </tr>
        ))}
    </>
  )
}

/** 하위 행의 환자 칸 — 마스킹 식별자만(raw 번호 다시 안 풂). */
function patientText(row: AccessLogRow): string {
  const p = row.patient
  if (!p) return '—'
  return [p.name, p.masked_birth_date].filter(Boolean).join(' · ') || '—'
}

const styles: Record<string, CSSProperties> = {
  headRow: { borderTop: '1px solid var(--color-divider)', background: 'var(--color-done-bg)' },
  childRow: { borderTop: '1px solid var(--color-divider)', background: 'var(--color-bg)' },
  cell: { padding: 'var(--sp-2) var(--sp-3)', fontSize: 'var(--fs-body)', color: 'var(--color-ink)', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' },
  childCell: { paddingLeft: 'var(--sp-7)' },
  muted: { color: 'var(--color-ink-muted)' },
  kindWrap: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' },
  summary: { color: 'var(--color-ink)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  expandBtn: {
    height: 26,
    padding: '0 var(--sp-3)',
    border: '1px solid var(--color-divider)',
    borderRadius: 7,
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  more: { margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
}
