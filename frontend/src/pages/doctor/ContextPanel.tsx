import type { CSSProperties } from 'react'
import { ClipboardList } from '../../components/icons'
import { ConsoleCard } from './ConsoleCard'

// [DOCTOR-CONTEXT-01~04] 가운데 「현재 환자·방문」 열. 이름·생년월일·성별만 상단 고정 —
//   진료에 필요 없는 전화번호는 끌어오지 않는다(CONTEXT-01·MASK-DETAIL-01). 예약 이유는 원문 그대로,
//   없으면 조회 오류처럼 보이지 않게 문장으로 말한다(CONTEXT-03·04). 사전문진 첫 답변과 병합하지 않는다.
//   ⭐ 이 컴포넌트는 자기 프레임(패딩·배경·경계)을 갖지 않는다 — 열(DoctorConsolePage `contextCol`)이
//   프레임을 소유해 네 카드가 한 열 안에서 같은 인셋·간격이 되게 한다(L65 데모정렬).

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
          {/* 기본정보 고정 카드 — 이름·생년월일은 첫 줄, 둘째 줄은 「시각 · 진료과」 맥락 줄(데모 정렬).
              ⛔ 상태 배지는 여기 두지 않는다(사용자 결정 L65) — 대기열에 이미 있고, 홀로 놓이면 조회
              오류처럼 보인다. 시각은 예약 슬롯 start, 진료과는 로그인 의사 본인 과. */}
          <div style={styles.head}>
            <div style={styles.headTop}>
              <h2 style={styles.name}>{patient.name}</h2>
              <span style={styles.sub}>
                {patient.birth_date}{patient.gender ? ` · ${patient.gender}` : ''}
              </span>
            </div>
            {meta && (meta.date || meta.time || meta.department_name || meta.doctor_name) && (
              <div style={styles.metaRow}>
                {[meta.date, meta.time, meta.department_name, meta.doctor_name].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          <ConsoleCard icon={<ClipboardList width={16} height={16} />} title="오늘 예약 이유">
            {reason ? (
              <p style={styles.reason}>{reason}</p>
            ) : (
              <p style={styles.empty}>예약 이유를 작성하지 않았습니다</p>
            )}
          </ConsoleCard>
        </>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  // ⭐ 프레임(패딩·배경·오른쪽 경계·스크롤)은 열이 소유한다 — 여기선 두 카드(기본정보·예약이유)를
  //   열의 다른 카드와 같은 sp-3 간격으로 쌓기만 한다.
  panel: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  skeleton: { height: 72, borderRadius: 8, background: 'var(--color-surface)' },
  hintBox: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', padding: 'var(--sp-3) var(--sp-0-5)' },
  hint: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  hintSub: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-subtle, var(--color-ink-muted))' },
  head: {
    display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)',
    padding: 'var(--sp-3)', background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-panel)',
  },
  headTop: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-2)' },
  name: { margin: 0, fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  sub: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  metaRow: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  reason: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  empty: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
}
