import type { CSSProperties } from 'react'

// [DOCTOR-CONTEXT-01~04] 가운데 「현재 환자·방문」 열. 이름·생년월일·성별만 상단 고정 —
//   진료에 필요 없는 전화번호는 끌어오지 않는다(CONTEXT-01·MASK-DETAIL-01). 예약 이유는 원문 그대로,
//   없으면 조회 오류처럼 보이지 않게 문장으로 말한다(CONTEXT-03·04). 사전문진 첫 답변과 병합하지 않는다.

export interface ConsolePatient {
  name: string
  birth_date: string
  gender: string | null
}

export interface ConsoleAppointmentMeta {
  date?: string | null
  time?: string | null
  department_name?: string | null
  doctor_name?: string | null
  status?: string | null
}

interface ContextPanelProps {
  patient: ConsolePatient | null
  meta?: ConsoleAppointmentMeta | null
  reason?: string | null
  loading?: boolean
}

export function ContextPanel({ patient, meta, reason, loading }: ContextPanelProps) {
  return (
    <section aria-label="현재 환자" style={styles.panel}>
      {loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : !patient ? (
        <div style={styles.hintBox}>
          <p style={styles.hint}>왼쪽에서 진료할 환자를 고르세요</p>
          {/* [DOCTOR-START-01] 행을 여는 것이 곧 진료 시작임을 미리 알린다. */}
          <p style={styles.hintSub}>환자를 누르면 진료가 시작됩니다</p>
        </div>
      ) : (
        <>
          <div style={styles.head}>
            <h2 style={styles.name}>{patient.name}</h2>
            <span style={styles.sub}>
              {patient.birth_date}{patient.gender ? ` · ${patient.gender}` : ''}
            </span>
          </div>
          {meta && (
            <p style={styles.meta}>
              {[meta.date, meta.time, meta.department_name, meta.doctor_name, meta.status]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <div style={styles.block}>
            <h3 style={styles.blockHead}>오늘 예약 이유</h3>
            {reason ? (
              <p style={styles.reason}>{reason}</p>
            ) : (
              <p style={styles.empty}>예약 이유를 작성하지 않았습니다</p>
            )}
          </div>
        </>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    display: 'flex', flexDirection: 'column', gap: 12, padding: 14, minHeight: 0, overflowY: 'auto',
    background: 'var(--color-bg)', borderRight: '1px solid var(--color-divider)',
  },
  skeleton: { height: 72, borderRadius: 8, background: 'var(--color-surface)' },
  hintBox: { display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 2px' },
  hint: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  hintSub: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-subtle, var(--color-ink-muted))' },
  head: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
    padding: 12, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  name: { margin: 0, fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  sub: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  meta: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  block: { padding: 12, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)' },
  blockHead: { margin: '0 0 6px', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  reason: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  empty: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
}
