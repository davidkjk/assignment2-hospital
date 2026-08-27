import type { CSSProperties } from 'react'
import type { BookingLookupResult } from '../../api/appointments'
import { InlineError } from '../../components/InlineError'

// [CHKIN-RESULT-01·03·04] 같은 화면 카드에서 확인하고 그 자리에서 접수를 끝낸다 — 상세로 끌고 가지 않는다.
// ⭐ `예약확정`이면 행동은 두 갈래 [진료 대기]·[도착](하이브리드 QUEUE-ARRIVE-02·03, /queue·/today와 같은
//    두 버튼). 이미 처리된 예약이면 [대기 목록에서 보기] 하나(SEARCH-ACT-03).
// ⛔ 전화·생년월일은 카드에 없다 — 서버가 아예 안 보낸다(MASK-SRV-01, 먼저 정한 것 #1).

const STATUS_LABEL: Record<string, string> = {
  예약신청: '미도착',
  예약확정: '예약 확정',
  도착: '도착',
  진료대기: '진료 대기',
  진료중: '진료 중',
  진료완료: '진료 완료',
}

// slot_at은 시간대 오프셋이 붙을 수 있어 Date로 넘기면 러너 TZ에 흔들린다 — 벽시계 값을 문자로 읽는다.
function whenLabel(slotAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(slotAt)
  if (!m) return slotAt
  const [, y, mo, d, hh, mm] = m
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const day = `${y}-${mo}-${d}` === today ? '오늘' : `${Number(mo)}월 ${Number(d)}일`
  return `${day} ${hh}:${mm}`
}

function slotReached(slotAt: string): boolean {
  const t = new Date(slotAt).getTime()
  return Number.isNaN(t) ? true : t <= Date.now()
}

export function LookupResultCard({
  result,
  busy,
  actionError,
  onArrive,
  onGoToQueue,
  onRetry,
}: {
  result: BookingLookupResult
  busy: boolean
  actionError: string | null
  onArrive: (target: '도착' | '진료대기') => void
  onGoToQueue: () => void
  onRetry: () => void
}) {
  const pending = result.status === '예약확정' || result.status === '예약신청'
  const reached = slotReached(result.slot_at)

  return (
    <div data-testid="lookup-result" style={styles.card}>
      <div style={styles.name}>{result.patient_name}</div>
      <div style={styles.meta}>
        {whenLabel(result.slot_at)} · {result.department_name} · {result.doctor_name}
      </div>
      <span style={styles.status}>{STATUS_LABEL[result.status] ?? result.status}</span>

      {/* 처리 실패·409는 대상 카드를 지우지 않고 그 자리에 해결 문구를 붙인다(CHKIN-RESULT-03). */}
      {actionError && (
        <div style={styles.errorRow}>
          <InlineError message={actionError} />
          <button type="button" style={styles.quiet} onClick={onRetry}>
            다시 확인
          </button>
        </div>
      )}

      <div style={styles.actions}>
        {pending ? (
          <>
            {/* 자리는 [진료 대기][도착]로 고정 — 예약 시각이 됐으면 [진료 대기]가 추천색(QUEUE-ARRIVE-02·03). */}
            <button
              type="button"
              disabled={busy}
              style={reached ? styles.primary : styles.quiet}
              onClick={() => onArrive('진료대기')}
            >
              {busy ? '처리 중…' : '진료 대기'}
            </button>
            <button
              type="button"
              disabled={busy}
              style={reached ? styles.quiet : styles.primary}
              onClick={() => onArrive('도착')}
            >
              {busy ? '처리 중…' : '도착'}
            </button>
          </>
        ) : (
          <button type="button" style={styles.primary} onClick={onGoToQueue}>
            대기 목록에서 보기
          </button>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 16,
    borderRadius: 'var(--radius-card)',
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    boxShadow: 'var(--shadow-card)',
  },
  name: { fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--color-ink)' },
  meta: { fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  status: {
    alignSelf: 'flex-start',
    fontSize: 'var(--fs-sm)',
    fontWeight: 700,
    color: 'var(--color-primary)',
    background: 'var(--color-primary-wash)',
    borderRadius: 6,
    padding: '2px 8px',
  },
  errorRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  actions: { display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  primary: {
    height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-primary)', color: 'var(--color-surface)', fontSize: 'var(--fs-base)', fontWeight: 700, cursor: 'pointer',
  },
  quiet: {
    height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
}
