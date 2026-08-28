import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, QrCode, Users } from '@/components/icons'
import { ApiError } from '../../api/httpClient'
import { findByCode, transitionStatus, type BookingLookupResult } from '../../api/appointments'
import { useConnectivity } from '../../lib/connectivity'
import { InlineError } from '../../components/InlineError'
import { QrScanner, type QrScannerFactory } from './QrScanner'

// 접수 폼 (`CHKIN-*`) — 데모 `routes/staff/checkin/CheckinForm.tsx` 뼈대 + 실 조회·상태전이 배선.
// ⭐ 한 컴포넌트를 **두 곳이 쓴다**: `/checkin` 전체화면(`CheckInPage`)과 헤더 「접수」 문의
//    「예약 확인」 갈래(`shell/doors/panels.tsx`). 데모가 그렇게 짜여 있고, 둘이 갈라지면
//    같은 일을 두 번 고치게 된다.
// QR 스캔이 주 경로(`CHKIN-SCAN-01`), 6자리 예약번호 직접 입력이 보조(`CHKIN-CODE-01`).
// ⛔ 데모의 「샘플 QR 인식(데모)」 버튼은 가져오지 않는다 — 실물은 진짜 카메라를 쓴다.

const STATUS_LABEL: Record<string, string> = {
  예약신청: '미도착',
  예약확정: '예약 확정',
  도착: '도착',
  진료대기: '진료 대기',
  진료중: '진료 중',
  진료완료: '진료 완료',
}

// 배지 색 — 도착(보류)=보라 · 진료대기(순번 받음)=하늘 · 그 밖=딥틸(데모 뼈대 그대로).
function badgeClass(status: string): string {
  if (status === '도착') return 'bg-violet-600'
  if (status === '진료대기') return 'bg-sky-600'
  return 'bg-primary'
}

// ⚠️ slot_at의 **글자를 그대로 읽으면 안 된다** — asyncpg가 timestamptz를 UTC로 돌려주므로
//    서버는 `2026-08-28T01:30:00+00:00`(=KST 10:30)을 보낸다. 문자로 읽으면 10:30 예약이
//    「01:30」으로 뜬다(2026-08-28 브라우저 대조에서 발견). 이 병원은 전부 KST로 도니까
//    (`app/db/pool.py` C6-#10) **시간대를 KST로 못박아** 옮긴다 — 러너·기기 TZ에 흔들리지 않는다.
const KST = 'Asia/Seoul'

function kstParts(at: Date): { y: string; mo: string; d: string; hh: string; mm: string } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const got = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]))
  return { y: got.year, mo: got.month, d: got.day, hh: got.hour === '24' ? '00' : got.hour, mm: got.minute }
}

function whenLabel(slotAt: string): string {
  const at = new Date(slotAt)
  if (Number.isNaN(at.getTime())) return slotAt
  const s = kstParts(at)
  const t = kstParts(new Date())
  const day = `${s.y}-${s.mo}-${s.d}` === `${t.y}-${t.mo}-${t.d}` ? '오늘' : `${Number(s.mo)}월 ${Number(s.d)}일`
  return `${day} ${s.hh}:${s.mm}`
}

/** 예약 시각이 됐는가 — 됐으면 `[진료 대기]`가 추천색, 아직이면 `[도착]`이 추천색(`QUEUE-ARRIVE-02·03`). */
function slotReached(slotAt: string): boolean {
  const t = new Date(slotAt).getTime()
  return Number.isNaN(t) ? true : t <= Date.now()
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

/**
 * @param onClose 문(패널)으로 열렸을 때 — 다른 화면으로 떠나기 전에 패널을 닫는다(라우트에선 undefined).
 */
export function CheckinForm({
  scannerFactory,
  onClose,
}: {
  scannerFactory?: QrScannerFactory
  onClose?: () => void
}) {
  const [code, setCode] = useState('')
  // undefined = 카드 없음(초기·조회 전) · null = 찾지 못함 · 객체 = 유효 예약.
  const [result, setResult] = useState<BookingLookupResult | null | undefined>(undefined)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null) // 조회 실패 → 입력 카드에
  const [actionError, setActionError] = useState<string | null>(null) // 처리 실패·409 → 결과 카드에
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  // 방금 이 화면에서 처리했는가 — 「도착 처리했습니다」류 안내는 그때만 뜬다(이미 도착한 예약을
  // 다시 조회한 경우와 구분한다).
  const [justDone, setJustDone] = useState(false)

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
    onSuccess: (updated) => { setActionError(null); setJustDone(true); setResult(updated) },
    onError: (error) => setActionError(messageOf(error)),
  })

  // [CHKIN-SCAN-02][CHKIN-CODE-03] QR 디코드와 직접 입력이 같은 조회로 들어온다.
  async function runLookup(raw: string) {
    const value = raw.trim().toUpperCase()
    setActionError(null)
    setJustDone(false)
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

  function submitCode() {
    void runLookup(code)
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

  /** [CHKIN-RESULT-04] 다음 환자 — 카드·오류·입력값을 비워 빈손으로 되돌린다. */
  function reset() {
    setResult(undefined)
    setActionError(null)
    setLookupError(null)
    setFieldError(null)
    setJustDone(false)
    setCode('')
  }

  function goToQueue(tab: string, appointmentId?: string) {
    onClose?.() // 문으로 열렸으면 떠나기 전에 패널을 닫는다
    const query = appointmentId ? `?tab=${tab}&appointment=${appointmentId}` : `?tab=${tab}`
    navigate(`/queue${query}`)
  }

  const pendingLookup = lookupMut.isPending
  const cardCls = 'rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(16,45,50,0.04)]'
  const primaryBtn = 'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40'
  const outlineBtn = 'rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40'
  const ghostBtn = 'rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted'

  return (
    <div className="space-y-4">
      {/* ── QR 스캔 (주 경로, CHKIN-SCAN-01) ── */}
      <div className={cardCls}>
        {!scanning ? (
          <>
            {/* [CHKIN-SCAN-04] 카메라가 안 켜져도 아래 예약번호 입력은 계속 살아 있다. */}
            {cameraError && <p className="mb-3 border-l-4 border-destructive pl-3 text-sm font-medium text-destructive">{cameraError}</p>}
            <button
              onClick={() => { setCameraError(null); setScanning(true) }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <QrCode className="h-5 w-5" />
              {cameraError ? '다시 QR 스캔' : 'QR 스캔 시작'}
            </button>
          </>
        ) : (
          <div>
            <QrScanner onDecoded={handleDecoded} onError={handleCameraError} factory={scannerFactory} />
            <button
              onClick={() => setScanning(false)}
              className="mt-3 w-full rounded-lg border border-border bg-card py-2.5 text-sm font-medium hover:bg-muted"
            >
              QR 스캔 중지
            </button>
          </div>
        )}
      </div>

      {/* ── 예약번호 직접 입력 (보조 경로, CHKIN-CODE-01) ── */}
      <div className={cardCls}>
        <label htmlFor="booking-code" className="block text-sm font-medium">QR이 없나요? 예약번호 직접 입력</label>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">환자가 보여 준 6자리 예약번호를 입력하세요</p>
        <div className="flex gap-2">
          <input
            id="booking-code"
            ref={fieldRef}
            value={code}
            // [CHKIN-CODE-02] 정규화는 여기서 한 번 — 붙여넣기·타이핑 모두 대문자·공백제거로 들어온다.
            //  ⛔ 허용 문자 목록(0/O 제외 등)은 늘어놓지 않는다 — 서버가 지키는 규칙을 화면이 베끼면 어긋난다.
            onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitCode() } }}
            autoComplete="off"
            maxLength={6}
            aria-invalid={fieldError ? true : undefined}
            placeholder="영문·숫자 6자리"
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base tracking-widest outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
          {/* [CHKIN-CODE-05] 라벨만 바뀐다 — 글자를 지우지 않고, 처리 중 다시 눌러도 두 번 가지 않는다. */}
          <button
            onClick={submitCode}
            disabled={pendingLookup || !online}
            aria-busy={pendingLookup}
            className="shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {pendingLookup ? '예약번호 확인 중…' : '예약번호로 찾기'}
          </button>
        </div>
        {fieldError && <InlineError message={fieldError} />}

        {/* [CHKIN-CODE-07] 이 화면이 못 하는 일을 화면 안에서 말한다 — 막다른 길을 열어 준다. ⛔ 오류가 아니다. */}
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">예약번호를 모르는 환자는 대기 목록에서 이름으로 찾을 수 있습니다</span>
          <button
            onClick={() => goToQueue('not_arrived')}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Users className="h-3.5 w-3.5" />
            대기 목록으로
          </button>
        </div>
      </div>

      {/* ── 조회 결과 ── */}
      {lookupError && <InlineError message={lookupError} />}
      {result === null && (
        // [CHKIN-RESULT-02] 만료·취소·없는 번호를 한 문장으로. 사유·환자 존재 여부는 드러내지 않는다.
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm font-medium text-destructive">
          만료되었거나 존재하지 않는 예약번호입니다
        </div>
      )}
      {result && (
        <ResultCard
          result={result}
          justDone={justDone}
          busy={arriveMut.isPending}
          actionError={actionError}
          classes={{ primaryBtn, outlineBtn, ghostBtn }}
          onArrive={(target) => arriveMut.mutate({ appt: result, target })}
          onGoToQueue={() => goToQueue(tabForStatus(result.status), result.appointment_id)}
          onRetry={() => void runLookup(lastCodeRef.current)}
          onNext={reset}
        />
      )}
    </div>
  )
}

/** [CHKIN-RESULT-01·03·04] 같은 카드에서 확인하고 그 자리에서 접수를 끝낸다 — 상세로 끌고 가지 않는다.
 *  ⛔ 전화·생년월일은 카드에 없다 — 서버가 아예 안 보낸다(`MASK-SRV-01`). */
function ResultCard({
  result,
  justDone,
  busy,
  actionError,
  classes,
  onArrive,
  onGoToQueue,
  onRetry,
  onNext,
}: {
  result: BookingLookupResult
  justDone: boolean
  busy: boolean
  actionError: string | null
  classes: { primaryBtn: string; outlineBtn: string; ghostBtn: string }
  onArrive: (target: '도착' | '진료대기') => void
  onGoToQueue: () => void
  onRetry: () => void
  onNext: () => void
}) {
  const { primaryBtn, outlineBtn, ghostBtn } = classes
  const pending = result.status === '예약확정' || result.status === '예약신청'
  const reached = slotReached(result.slot_at)

  return (
    <div data-testid="lookup-result" className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--elevation-card)]">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{result.patient_name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${badgeClass(result.status)}`}>
              {STATUS_LABEL[result.status] ?? result.status}
            </span>
          </div>
          <div className="mt-1 text-sm tabular-nums text-muted-foreground">
            {whenLabel(result.slot_at)} · {result.department_name} {result.doctor_name}
          </div>
        </div>
        {justDone && <CheckCircle2 className={`h-7 w-7 ${result.status === '도착' ? 'text-violet-600' : 'text-sky-600'}`} />}
      </div>

      {/* 처리 실패·409는 대상 카드를 지우지 않고 그 자리에 해결 문구를 붙인다(CHKIN-RESULT-03). */}
      {actionError && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <InlineError message={actionError} />
          <button type="button" className={outlineBtn} onClick={onRetry}>다시 확인</button>
        </div>
      )}

      {pending ? (
        <>
          {/* 자리는 [진료 대기][도착]로 고정 — 예약 시각이 됐으면 [진료 대기]가 추천색(QUEUE-ARRIVE-02·03). */}
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy} className={reached ? primaryBtn : outlineBtn} onClick={() => onArrive('진료대기')}>
              {busy ? '처리 중…' : '진료 대기'}
            </button>
            <button type="button" disabled={busy} className={reached ? outlineBtn : primaryBtn} onClick={() => onArrive('도착')}>
              {busy ? '처리 중…' : '도착'}
            </button>
            <button type="button" className={ghostBtn} onClick={onNext}>다음 접수</button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {reached
              ? '예약 시각이 되었습니다. [진료 대기]를 누르면 바로 순번을 받습니다.'
              : `예약 시각(${whenLabel(result.slot_at)})보다 일찍 오셨습니다. [도착]으로 두면 예약 시각에 자동으로 진료 대기로 넘어갑니다.`}
          </p>
        </>
      ) : (
        <>
          <div className="mt-4 flex gap-2">
            <button type="button" className={outlineBtn} onClick={onGoToQueue}>대기 목록에서 보기</button>
            <button type="button" className={ghostBtn} onClick={onNext}>다음 접수</button>
          </div>
          {justDone && (
            <p className="mt-2 text-xs text-muted-foreground">
              {result.status === '도착'
                ? '도착 처리했습니다 · 예약 시각에 자동으로 진료 대기로 넘어갑니다. 다음 환자를 QR·예약번호로 접수하세요'
                : '진료 대기로 접수했습니다 · 순번이 부여됐습니다. 다음 환자를 QR·예약번호로 접수하세요'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
