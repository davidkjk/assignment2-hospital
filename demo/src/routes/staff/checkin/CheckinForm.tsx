import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode, CheckCircle2, Users } from '@/components/icons'
import { NOW } from '../mockData'

// 접수 폼 (CHKIN-*) — 라우트(/checkin 전체화면)와 헤더 '접수' 문의 예약 확인 갈래(doors/panels)가 공유.
// QR 스캔이 주 경로, 6자리 예약번호 직접 입력이 보조.
// 유효 예약은 대기 목록과 같은 모델로 처리한다 — 예약 시각이 됐/지났으면 [진료 대기](바로 순번),
// 아직 일찍 오셨으면 [도착](보류, 예약 시각에 자동으로 진료 대기로). 순서 고정, 추천 동작만 색(딥틸).
// 데모라 실제 카메라 대신 '샘플 QR 인식' 버튼으로 시연한다.

interface Appt {
  code: string
  name: string
  dept: string
  doctor: string
  time: string
}
// 데모 유효 예약번호(0·O·1·I 제외). 실제 앱은 서버 find_by_booking_code.
const DEMO_APPTS: Record<string, Appt> = {
  K3M7P9: { code: 'K3M7P9', name: '이말녀', dept: '내과', doctor: '한서연', time: '09:00' },
  R4T6W2: { code: 'R4T6W2', name: '윤도현', dept: '피부과', doctor: '윤지호', time: '09:30' },
  X5Y8Z3: { code: 'X5Y8Z3', name: '조현우', dept: '안과', doctor: '오세림', time: '10:20' },
}

type Result = { kind: 'ok'; appt: Appt } | { kind: 'invalid' } | null

/** onClose: 패널로 열렸을 때 대기 목록으로 이동하기 전에 패널을 닫는다(라우트에선 undefined). */
export function CheckinForm({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate()
  const goQueue = (to: string) => {
    onClose?.()
    navigate(to)
  }
  const [scanning, setScanning] = useState(false)
  const [code, setCode] = useState('')
  const [formErr, setFormErr] = useState('')
  const [result, setResult] = useState<Result>(null)
  const [outcome, setOutcome] = useState<null | 'arrived' | 'waiting'>(null)

  function lookup(raw: string) {
    const norm = raw.trim().toUpperCase()
    setOutcome(null)
    const appt = DEMO_APPTS[norm]
    setResult(appt ? { kind: 'ok', appt } : { kind: 'invalid' })
  }

  function submitCode() {
    setFormErr('')
    const norm = code.trim().toUpperCase()
    if (norm.length !== 6) {
      setFormErr('예약번호 6자리를 입력하세요')
      return
    }
    lookup(norm)
  }

  function reset() {
    setResult(null)
    setOutcome(null)
    setCode('')
    setFormErr('')
  }

  return (
    <div className="space-y-4">
      {/* ── QR 스캔 (주 경로) ── */}
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        {!scanning ? (
          <button
            onClick={() => setScanning(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <QrCode className="h-5 w-5" />
            QR 스캔 시작
          </button>
        ) : (
          <div>
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
              <div className="text-center">
                <QrCode className="mx-auto mb-2 h-10 w-10 text-muted-foreground/50" />
                환자 QR을 카메라에 비춰 주세요
                <div className="mt-3">
                  <button
                    onClick={() => {
                      lookup('K3M7P9')
                      setScanning(false)
                    }}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted"
                  >
                    샘플 QR 인식 (데모)
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setScanning(false)}
              className="mt-3 w-full rounded-lg border border-border bg-card py-2.5 text-sm font-medium hover:bg-muted"
            >
              QR 스캔 중지
            </button>
          </div>
        )}
      </div>

      {/* ── 예약번호 직접 입력 (보조 경로) ── */}
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <label className="block text-sm font-medium">QR이 없나요? 예약번호 직접 입력</label>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">환자가 보여 준 6자리 예약번호를 입력하세요</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && submitCode()}
            maxLength={6}
            placeholder="영문·숫자 6자리"
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base tracking-widest outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
          <button
            onClick={submitCode}
            className="shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            찾기
          </button>
        </div>
        {formErr && <p className="mt-2 text-sm font-medium text-destructive">{formErr}</p>}

        {/* 예약번호 모르는 환자 — 이 화면이 못 하는 일을 안내 (CHKIN-CODE-07) */}
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">예약번호를 모르는 환자는 대기 목록에서 이름으로 찾을 수 있습니다</span>
          <button
            onClick={() => goQueue('/staff/queue?tab=not_arrived')}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Users className="h-3.5 w-3.5" />
            대기 목록으로
          </button>
        </div>

        <p className="mt-3 text-center text-[0.7rem] text-muted-foreground">데모 예약번호: K3M7P9 · R4T6W2 · X5Y8Z3</p>
      </div>

      {/* ── 조회 결과 카드 ── */}
      {result?.kind === 'invalid' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm font-medium text-destructive">
          만료되었거나 존재하지 않는 예약번호입니다
        </div>
      )}
      {result?.kind === 'ok' && (() => {
        const early = result.appt.time > NOW // 예약 시각보다 일찍 오심 → 도착(보류) 추천
        const statusLabel = outcome === 'arrived' ? '도착' : outcome === 'waiting' ? '진료 대기' : '예약확정'
        const badgeColor = outcome === 'arrived' ? 'bg-violet-600' : outcome === 'waiting' ? 'bg-sky-600' : 'bg-primary'
        const primaryBtn = 'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90'
        const outlineBtn = 'rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted'
        const ghostBtn = 'rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted'
        return (
          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--elevation-card)]">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">{result.appt.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${badgeColor}`}>{statusLabel}</span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {result.appt.time} · {result.appt.dept} {result.appt.doctor}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">예약번호 {result.appt.code}</div>
              </div>
              {outcome && <CheckCircle2 className={`h-7 w-7 ${outcome === 'arrived' ? 'text-violet-600' : 'text-sky-600'}`} />}
            </div>

            {outcome === null ? (
              <>
                {/* 순서 고정 [진료 대기][도착], 추천 동작만 딥틸(색만 이동) — 대기 목록과 같은 모델 */}
                <div className="mt-4 flex gap-2">
                  <button onClick={() => setOutcome('waiting')} className={early ? outlineBtn : primaryBtn}>진료 대기</button>
                  <button onClick={() => setOutcome('arrived')} className={early ? primaryBtn : outlineBtn}>도착</button>
                  <button onClick={reset} className={ghostBtn}>다음 접수</button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {early
                    ? `예약 시각(${result.appt.time})보다 일찍 오셨습니다. [도착]으로 두면 예약 시각에 자동으로 진료 대기로 넘어갑니다.`
                    : '예약 시각이 되었습니다. [진료 대기]를 누르면 바로 순번을 받습니다.'}
                </p>
              </>
            ) : (
              <>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => goQueue('/staff/queue')} className={outlineBtn}>대기 목록에서 보기</button>
                  <button onClick={reset} className={ghostBtn}>다음 접수</button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {outcome === 'arrived'
                    ? '도착 처리했습니다 · 예약 시각에 자동으로 진료 대기로 넘어갑니다. 다음 환자를 QR/예약번호로 접수하세요'
                    : '진료 대기로 접수했습니다 · 순번이 부여됐습니다. 다음 환자를 QR/예약번호로 접수하세요'}
                </p>
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}
