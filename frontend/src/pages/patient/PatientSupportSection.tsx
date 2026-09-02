import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import type { PatientSupportApi, PatientTicket, SupportStatus } from '../../api/patientSupport'

// 환자상세 상담 섹션(PTSUP-SECT) — staff-web PTDET-SUPPORT 카드를 그대로 소비하고 재정의하지 않는다(LINK-01).
//  ⭐ Task 2 마이그레이션·안정 정렬이 있어 BLOCK-01 해소 — 가짜 카드가 아니라 실제 patient-scoped 조회(BLOCK-01).
//  ⭐ Realtime 구독은 근거가 없어 unknown(LIVE-01, 티켓함과 같다고 추측 안 함), 수동 정합화는 현재 환자 범위 재조회(LIVE-02).
//  ⭐ 현재 환자 범위만(PRIV-01), 환자 전환 시 이전 결과 안 남기고 새 범위로 재조회(EXC-01).
//  카드 선택은 티켓·대화 상세를 별도 전체 화면으로 연다(NAV-01 → NAV-STFSUP-07).

// 원시 enum을 화면에 그대로 노출하지 않는다(PTDET-SUPPORT-02 번역).
const STATUS_LABEL: Record<SupportStatus, string> = {
  pending: '새 문의',
  in_progress: '처리 중',
  answered: '답변 완료',
}

// ORDER-01: 최신 생성 시각 위 + 동점은 티켓 ID를 마지막 키로(canonical PTDET-SUPPORT-03 = created_at desc, id desc).
function byLatest(a: PatientTicket, b: PatientTicket): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

type Phase = 'loading' | 'ready' | 'empty' | 'error'

export interface OpenTicket {
  ticketId: string
  fullscreen: true
}

export function PatientSupportSection({
  patientId,
  api,
  onOpenTicket,
  sibling,
}: {
  patientId: string
  api: PatientSupportApi
  onOpenTicket: (t: OpenTicket) => void
  sibling?: ReactNode // 다른 섹션이 이 섹션 로딩·오류에 안 지워짐을 보이는 자리(테스트 보조)
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [tickets, setTickets] = useState<PatientTicket[]>([])
  const apiRef = useRef(api)
  apiRef.current = api

  const load = useCallback(async () => {
    setPhase('loading') // LOAD-01: 섹션만 로딩(다른 상세는 안 지움)
    try {
      const rows = await apiRef.current.listPatientTickets(patientId)
      // PRIV-01: 현재 환자 티켓만 — 다른 환자 문의를 섞지 않는다(서버 신뢰하되 방어).
      const scoped = rows.filter((t) => t.patientId === patientId).slice().sort(byLatest)
      setTickets(scoped)
      setPhase(scoped.length === 0 ? 'empty' : 'ready')
    } catch {
      setTickets([])
      setPhase('error') // ERR-01: 섹션에만 실패
    }
  }, [patientId])

  useEffect(() => {
    // EXC-01: 환자가 바뀌면 이전 환자 결과를 남기지 않고 새 범위로 재조회.
    setTickets([])
    void load()
  }, [load])

  return (
    <>
      <section aria-label="상담 문의" data-live="unknown" style={{ display: 'contents' }}>
        <div style={styles.section}>
          <h2 style={styles.heading}>상담 문의</h2>
          {phase === 'loading' ? (
            <div aria-label="상담 문의 로딩" data-testid="ptsup-skeleton" style={styles.skeleton} />
          ) : phase === 'error' ? (
            <div style={styles.stateBox}>
              <p style={styles.stateText}>상담 문의를 불러오지 못했습니다</p>
              <button type="button" onClick={() => void load()} style={styles.retryBtn}>
                다시 시도
              </button>
            </div>
          ) : phase === 'empty' ? (
            <p style={styles.stateText}>직원에게 전달된 상담 문의가 없습니다</p>
          ) : (
            <>
              <div style={styles.head}>
                <span style={styles.count}>{tickets.length}건</span>
                <button type="button" onClick={() => void load()} style={styles.refreshBtn}>
                  새로고침
                </button>
              </div>
              <ul style={styles.list}>
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      data-testid="ptsup-card"
                      data-ticket={t.id}
                      onClick={() => onOpenTicket({ ticketId: t.id, fullscreen: true })}
                      style={styles.card}
                    >
                      <span style={styles.q}>{t.question}</span>
                      {t.botAnswer && (
                        <span style={styles.sub}>
                          <span style={styles.tag}>상담봇 안내</span>
                          {t.botAnswer}
                        </span>
                      )}
                      {t.handoffReason && (
                        <span style={styles.sub}>
                          <span style={styles.tag}>직원에게 넘어온 이유</span>
                          {t.handoffReason}
                        </span>
                      )}
                      <span style={styles.status}>{STATUS_LABEL[t.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
      {sibling}
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    padding: 16, background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  heading: { margin: '0 0 12px', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  count: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)' },
  refreshBtn: {
    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
    fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--color-primary)',
  },
  skeleton: { height: 72, borderRadius: 6, background: 'var(--color-bg)' },
  stateBox: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  stateText: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  retryBtn: {
    height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: 12, width: '100%', textAlign: 'left',
    background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 8, cursor: 'pointer',
  },
  q: { fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--color-ink)' },
  sub: { display: 'flex', gap: 8, fontSize: 'var(--fs-sm)', color: 'var(--color-ink)' },
  tag: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)', minWidth: 120 },
  status: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-primary)' },
}
