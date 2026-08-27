import { useRef, useState, type CSSProperties } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/httpClient'
import { findByCode, transitionStatus, type BookingLookupResult } from '../../api/appointments'
import { useConnectivity } from '../../lib/connectivity'
import { QrScanner, type QrScannerFactory } from './QrScanner'
import { BookingCodeField } from './BookingCodeField'
import { LookupResultCard } from './LookupResultCard'

/**
 * `/checkin` QR·예약번호 접수 — 접수직원·관리자(셸 route guard가 막는다, CHKIN-HEAD-02·03).
 * 제목·오프라인 띠·세 문 헤더는 공통 셸이 그린다 — 이 화면은 본문만 만든다(QueuePage와 같은 결).
 *
 * ⭐ 결정 #5·#6: 유효 예약을 찾으면 상세로 떠나지 않고 **같은 카드에서 접수를 끝낸다.** 조회·상태 전이는
 *    react-query를 지나 셸의 ServerEffects(markServerOk·온라인 401 세션 만료)로 이어진다.
 * ⭐ 하이브리드(2026-08-24): `예약확정`이면 카드 행동은 두 갈래 [진료 대기]·[도착](CHKIN-RESULT-01·03).
 *    백엔드 전이표가 예약확정→도착→진료대기라, [진료 대기]는 도착을 거쳐 이어 붙인다(QueuePage와 같은 방식).
 */
export function CheckInPage({ scannerFactory }: { scannerFactory?: QrScannerFactory }) {
  const [code, setCode] = useState('')
  // undefined = 카드 없음(초기·조회 전) · null = 찾지 못함 · 객체 = 유효 예약.
  const [result, setResult] = useState<BookingLookupResult | null | undefined>(undefined)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null) // 조회 실패 → 입력 카드에
  const [actionError, setActionError] = useState<string | null>(null) // 처리 실패·409 → 결과 카드에
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const lastCodeRef = useRef('')
  const reqSeq = useRef(0)
  const fieldRef = useRef<HTMLInputElement>(null)

  const { online } = useConnectivity()
  const navigate = useNavigate()

  const lookupMut = useMutation({ mutationFn: (value: string) => findByCode(value) })

  const arriveMut = useMutation({
    // [CHKIN-RESULT-03] 도착 처리 API를 새로 만들지 않는다 — 1단계 상태 전이 + 낙관적 잠금(updated_at).
    mutationFn: async ({ appt, target }: { appt: BookingLookupResult; target: '도착' | '진료대기' }) => {
      await transitionStatus(appt.appointment_id, { new_status: '도착', expected_updated_at: appt.updated_at })
      if (target === '도착') return { ...appt, status: '도착' }
      // 진료 대기: 도착을 거친 뒤 최신 updated_at을 다시 읽어 이어 붙인다(둘 다 이미 허용된 전이).
      const fresh = await findByCode(lastCodeRef.current)
      if (fresh) {
        await transitionStatus(fresh.appointment_id, { new_status: '진료대기', expected_updated_at: fresh.updated_at })
        return { ...fresh, status: '진료대기' }
      }
      return { ...appt, status: '진료대기' }
    },
    onSuccess: (updated) => { setActionError(null); setResult(updated) },
    onError: (error) => setActionError(messageOf(error)),
  })

  // [CHKIN-SCAN-02][CHKIN-CODE-03] QR 디코드와 직접 입력이 같은 조회로 들어온다.
  async function runLookup(raw: string) {
    const value = raw.trim().toUpperCase()
    setActionError(null)
    if (value.length !== 6) {
      // [CHKIN-CODE-04] 6자리가 아니면 서버 조회를 부르지 않고 그 칸에서 고치게 한다.
      setResult(undefined)
      setLookupError(null)
      setFieldError('예약번호 6자리를 입력해 주세요')
      fieldRef.current?.focus()
      return
    }
    setFieldError(null)
    setLookupError(null)
    const seq = ++reqSeq.current
    setResult(undefined) // [CHKIN-RESULT-04] 새 조회는 이전 카드부터 지운다
    try {
      const found = await lookupMut.mutateAsync(value)
      if (seq !== reqSeq.current) return // 늦게 온 응답은 버린다(SEARCH-RUN-04·05)
      lastCodeRef.current = value
      setResult(found ?? null)
    } catch (error) {
      if (seq !== reqSeq.current) return
      // 온라인 401 세션 만료는 셸 ServerEffects가 처리한다 — 화면은 조회 실패 문구만 입력 카드에 붙인다.
      setLookupError(messageOf(error))
    }
  }

  function handleDecoded(text: string) {
    setScanning(false) // [CHKIN-SCAN-02] 첫 인식 뒤 카메라를 멈춘다(다음 환자 것을 자동으로 읽지 않게)
    const value = text.trim().toUpperCase()
    setCode(value)
    void runLookup(value)
  }

  function handleCameraError(message: string) {
    // [CHKIN-SCAN-04] 카메라가 안 켜져도 예약번호 입력은 계속 살아 있다.
    setScanning(false)
    setCameraError(message)
  }

  function goToQueue(tab: string, appointmentId?: string) {
    const query = appointmentId ? `?tab=${tab}&appointment=${appointmentId}` : `?tab=${tab}`
    navigate(`/queue${query}`)
  }

  const pendingLookup = lookupMut.isPending

  return (
    <section aria-label="QR·예약번호 접수" style={styles.page}>
      {/* ── QR 스캔: 주 경로 ─────────────────────────────────────────────── */}
      <div style={styles.scanArea}>
        {scanning ? (
          <>
            <QrScanner onDecoded={handleDecoded} onError={handleCameraError} factory={scannerFactory} />
            <button type="button" style={styles.quiet} onClick={() => setScanning(false)}>
              QR 스캔 중지
            </button>
          </>
        ) : (
          <>
            {cameraError && <p style={styles.cameraError}>{cameraError}</p>}
            <button
              type="button"
              style={styles.primary}
              onClick={() => { setCameraError(null); setScanning(true) }}
            >
              {cameraError ? '다시 QR 스캔' : 'QR 스캔 시작'}
            </button>
          </>
        )}
      </div>

      {/* ── 예약번호 직접 입력: 보조 경로 ────────────────────────────────── */}
      <BookingCodeField
        ref={fieldRef}
        value={code}
        onChange={setCode}
        onSubmit={() => void runLookup(code)}
        fieldError={fieldError}
        busy={pendingLookup}
        offline={!online}
        onGoToQueue={() => goToQueue('not_arrived')}
      />

      {/* ── 조회 결과 ────────────────────────────────────────────────────── */}
      {lookupError && <p role="alert" style={styles.cameraError}>{lookupError}</p>}
      {result === null && (
        // [CHKIN-RESULT-02] 만료·취소·없는 번호를 한 문장으로. 사유·환자 존재 여부는 드러내지 않는다.
        <p style={styles.notFound}>만료되었거나 존재하지 않는 예약번호입니다</p>
      )}
      {result && (
        <LookupResultCard
          result={result}
          busy={arriveMut.isPending}
          actionError={actionError}
          onArrive={(target) => arriveMut.mutate({ appt: result, target })}
          onGoToQueue={() => goToQueue(tabForStatus(result.status), result.appointment_id)}
          onRetry={() => void runLookup(lastCodeRef.current)}
        />
      )}
    </section>
  )
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
}

// 완료 카드의 [대기 목록에서 보기]가 그 줄이 실제로 보이는 탭으로 데려간다(QueuePage 탭 키와 일치).
function tabForStatus(status: string): string {
  if (status === '도착') return 'arrived'
  if (status === '진료대기') return 'waiting'
  return 'total'
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 },
  scanArea: { display: 'flex', flexDirection: 'column', gap: 8 },
  primary: {
    height: 44, padding: '0 16px', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-primary)', color: 'var(--color-surface)', fontSize: 'var(--fs-lg)', fontWeight: 700, cursor: 'pointer',
  },
  quiet: {
    height: 40, padding: '0 16px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  cameraError: {
    margin: 0, paddingLeft: 12, borderLeft: '4px solid var(--color-warn)',
    color: 'var(--color-warn)', fontSize: 'var(--fs-base)', fontWeight: 600,
  },
  notFound: {
    margin: 0, padding: '12px 16px', borderRadius: 'var(--radius-card)',
    border: '1px solid var(--color-divider)', background: 'var(--color-done-bg)',
    color: 'var(--color-ink-muted)', fontSize: 'var(--fs-base)', fontWeight: 600,
  },
}
