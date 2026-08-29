import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from '../../../components/icons'
import type { CandidateRow } from '../../../api/patientMerge'

// [MERGE-COMPARE-01~06 · MERGE-REVIEW-01·02 · MERGE-STATE-04] 두 후보를 좌·우로 비교한다.
// ⭐ 대표를 자동으로 고르지 않는다(COMPARE-03은 '권고'만). 대표를 골라도 서버는 안 부른다 — 배지만 바뀐다.
// ⭐ 원문(전화·생일)을 여기서 펼치지 않는다(COMPARE-05) — 환자 상세 열람 감사 경로로 보낸다.
// ⭐ 두 기록 모두 계정 연결이면 [병합 내용 검토]를 잠근다(STATE-04) — 사람이 환자 상세에서 정한다.

interface ComparePanelProps {
  left: CandidateRow
  right: CandidateRow
  primaryId: string | null
  onPickPrimary: (id: string) => void
  onReview: () => void
  onBack: () => void
}

export function ComparePanel({ left, right, primaryId, onPickPrimary, onReview, onBack }: ComparePanelProps) {
  const bothLinked = left.account_linked && right.account_linked
  const canReview = !bothLinked && primaryId != null

  return (
    <section data-compare aria-label="후보 비교" style={styles.wrap}>
      <button type="button" onClick={onBack} style={styles.back}>‹ 후보 목록으로</button>

      {/* MERGE-COMPARE-03 — 많은 쪽을 권하되 자동으로 고르지 않는다. */}
      <p style={styles.recommend}>
        기록이 더 많은 쪽을 대표로 권합니다. 적은 쪽을 대표로 고르면 앱·이력에서 보이는 범위가 달라질 수 있습니다.
      </p>

      <div style={styles.cards}>
        <CompareCard side="좌" row={left} primaryId={primaryId} otherIsPrimary={primaryId === right.patient_id} onPick={onPickPrimary} />
        <CompareCard side="우" row={right} primaryId={primaryId} otherIsPrimary={primaryId === left.patient_id} onPick={onPickPrimary} />
      </div>

      {/* MERGE-COMPARE-06 — 원본이 어디 남는지. */}
      <p style={styles.lineage}>
        원본 예약·문진·진료기록·열람 기록은 원래 자리에 남고, 대표 조회가 계보를 따라 함께 읽습니다.
      </p>

      {/* MERGE-COMPARE-05 — 원문은 여기서 안 펼친다. 환자 상세 열람 감사 경로로. */}
      <p style={styles.detailNote}>
        원본 번호·생년월일을 확인해야 하면 <Link to="/patients" style={styles.link}>환자 상세에서 확인</Link>하세요.
      </p>

      {bothLinked && (
        // MERGE-STATE-04 / MERGE-COMPARE-04 — 자동 병합 잠금. 가족 연결과 혼동 금지.
        // 막다른 길 방지 — 각 기록을 새 탭 환자 상세로 열어 병합 화면을 떠나지 않고 확인한다(플랜 S17 ④).
        <div role="note" style={styles.lock}>
          <span>두 기록 모두 계정이 연결되어 있어 자동 병합할 수 없습니다. 가족 연결과 혼동하지 말고 환자 상세에서 별도 확인하세요.</span>
          <div style={styles.lockLinks}>
            <a href={`/patients/${left.patient_id}`} target="_blank" rel="noopener noreferrer" style={styles.lockLink}>
              <ExternalLink width={14} height={14} aria-hidden="true" /> {left.name} 환자 상세
            </a>
            <a href={`/patients/${right.patient_id}`} target="_blank" rel="noopener noreferrer" style={styles.lockLink}>
              <ExternalLink width={14} height={14} aria-hidden="true" /> {right.name} 환자 상세
            </a>
          </div>
        </div>
      )}

      {/* MERGE-REVIEW-02 — 회색 테두리 버튼 하나. 확인창을 여는 단계일 뿐 확정하지 않는다. */}
      <div style={styles.actions}>
        <button
          type="button"
          className="btn-outline"
          onClick={onReview}
          disabled={!canReview}
          style={canReview ? styles.review : { ...styles.review, ...styles.reviewOff }}
        >
          병합 내용 검토
        </button>
      </div>
    </section>
  )
}

interface CompareCardProps {
  side: string
  row: CandidateRow
  primaryId: string | null
  otherIsPrimary: boolean
  onPick: (id: string) => void
}

function CompareCard({ side, row, primaryId, otherIsPrimary, onPick }: CompareCardProps) {
  const isPrimary = primaryId === row.patient_id
  return (
    <div data-compare-card data-side={side} style={isPrimary ? { ...styles.card, ...styles.cardPrimary } : styles.card}>
      <div style={styles.cardHead}>
        <span style={styles.name}>{row.name}</span>
        {isPrimary && <span data-badge style={styles.badgePrimary}>대표 환자</span>}
        {otherIsPrimary && <span data-badge style={styles.badgeMerged}>병합되어 비활성화될 후보</span>}
      </div>

      <dl style={styles.items}>
        <Item label="계정 연결" value={row.account_linked ? '연결됨' : '연결 안 됨'} />
        <Item label="예약" value={`${row.counts.appointments}건`} />
        <Item label="문진 작성 예약" value={`${row.counts.questionnaires}건`} />
        <Item label="진료기록" value={`${row.counts.medical_records}건`} />
        <Item label="감사 기록" value={`${row.counts.access_logs}건`} />
        <Item label="마지막 방문" value={row.last_visit_at ? formatVisit(row.last_visit_at) : '방문 없음'} />
      </dl>

      <button type="button" onClick={() => onPick(row.patient_id)} style={styles.pick}>대표 검토</button>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div data-item data-item-label={label} style={styles.item}>
      <dt style={styles.itemLabel}>{label}</dt>
      <dd style={styles.itemValue}>{value}</dd>
    </div>
  )
}

function formatVisit(iso: string): string {
  return iso.slice(0, 10)
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  back: {
    alignSelf: 'flex-start',
    padding: '4px 0',
    border: 'none',
    background: 'none',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  recommend: {
    margin: 0,
    padding: '10px 14px',
    borderRadius: 10,
    borderLeft: '4px solid var(--color-warn)',
    background: 'var(--color-bg)',
    fontSize: 'var(--fs-base)',
    color: 'var(--color-ink)',
    lineHeight: 1.5,
  },
  cards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  card: {
    padding: 14,
    borderRadius: 'var(--radius-card)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-divider)',
    background: 'var(--color-surface)',
  },
  cardPrimary: { borderColor: 'var(--color-primary)', boxShadow: '0 0 0 1px var(--color-primary)' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 24 },
  name: { fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  badgePrimary: {
    fontSize: 'var(--fs-sm)', fontWeight: 700, padding: '2px 8px', borderRadius: 6,
    background: 'var(--color-primary)', color: '#fff',
  },
  badgeMerged: {
    fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '2px 8px', borderRadius: 6,
    background: 'var(--color-done-bg)', color: 'var(--color-done)',
  },
  items: { margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--fs-base)' },
  itemLabel: { margin: 0, color: 'var(--color-ink-muted)' },
  itemValue: { margin: 0, color: 'var(--color-ink)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  pick: {
    marginTop: 12, width: '100%', height: 32, borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-bg)',
    color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  lineage: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  detailNote: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  link: { color: 'var(--color-primary)', fontWeight: 600 },
  lock: {
    display: 'flex', flexDirection: 'column', gap: 8,
    margin: 0, padding: '10px 14px', borderRadius: 10,
    borderLeft: '4px solid var(--color-danger)', background: 'var(--color-danger-bg)',
    color: 'var(--color-danger)', fontSize: 'var(--fs-base)', fontWeight: 600, lineHeight: 1.5,
  },
  lockLinks: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  lockLink: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', borderRadius: 8,
    border: '1px solid var(--color-danger)', background: 'var(--color-surface)',
    color: 'var(--color-danger)', fontSize: 'var(--fs-sm)', fontWeight: 600,
    textDecoration: 'none',
  },
  actions: { display: 'flex', justifyContent: 'flex-end' },
  review: {
    height: 36, padding: '0 18px', borderRadius: 8,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--color-primary)', background: 'var(--color-surface)',
    color: 'var(--color-primary)', fontSize: 'var(--fs-base)', fontWeight: 700, cursor: 'pointer',
  },
  reviewOff: {
    borderColor: 'var(--color-divider)', color: 'var(--color-gray-past)', cursor: 'not-allowed',
  },
}
