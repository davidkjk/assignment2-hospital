import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode, CheckCircle2, Users } from '@/components/icons'

// 접수 (/checkin) — CHKIN-*.
// QR 스캔이 주 경로, 6자리 예약번호 직접 입력이 보조. 유효 예약은 같은 화면 결과 카드에서 [도착 처리].
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

export function Checkin() {
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [code, setCode] = useState('')
  const [formErr, setFormErr] = useState('')
  const [result, setResult] = useState<Result>(null)
  const [arrived, setArrived] = useState(false)

  function lookup(raw: string) {
    const norm = raw.trim().toUpperCase()
    setArrived(false)
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
    setArrived(false)
    setCode('')
    setFormErr('')
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
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
      <div className="mt-4 rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
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
            예약번호로 찾기
          </button>
        </div>
        {formErr && <p className="mt-2 text-sm font-medium text-destructive">{formErr}</p>}

        {/* 예약번호 모르는 환자 — 이 화면이 못 하는 일을 안내 (CHKIN-CODE-07) */}
        <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
          <span className="text-xs text-muted-foreground">예약번호를 모르는 환자는 대기 목록에서 이름으로 찾을 수 있습니다</span>
          <button
            onClick={() => navigate('/staff/queue?tab=not_arrived')}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Users className="h-3.5 w-3.5" />
            대기 목록으로
          </button>
        </div>

        <p className="mt-3 text-center text-[0.7rem] text-muted-foreground">데모 예약번호: K3M7P9 · R4T6W2 · X5Y8Z3</p>
      </div>

      {/* ── 조회 결과 카드 (같은 화면) ── */}
      {result?.kind === 'invalid' && (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm font-medium text-destructive">
          만료되었거나 존재하지 않는 예약번호입니다
        </div>
      )}
      {result?.kind === 'ok' && (
        <div className="mt-4 rounded-xl border border-border/70 bg-card p-5 shadow-[var(--elevation-card)]">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{result.appt.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${
                    arrived ? 'bg-violet-600' : 'bg-primary'
                  }`}
                >
                  {arrived ? '도착' : '예약확정'}
                </span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {result.appt.time} · {result.appt.dept} {result.appt.doctor}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">예약번호 {result.appt.code}</div>
            </div>
            {arrived && <CheckCircle2 className="h-7 w-7 text-violet-600" />}
          </div>

          <div className="mt-4 flex gap-2">
            {!arrived ? (
              <button
                onClick={() => setArrived(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                도착 처리
              </button>
            ) : (
              <button
                onClick={() => navigate('/staff/queue')}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                대기 목록에서 보기
              </button>
            )}
            <button onClick={reset} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
              다음 접수
            </button>
          </div>
          {arrived && <p className="mt-2 text-xs text-muted-foreground">도착 처리했습니다 · 다음 환자를 QR/예약번호로 접수하세요</p>}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">데모 화면입니다 · 카메라 대신 '샘플 QR 인식'으로 시연</p>
    </div>
  )
}
