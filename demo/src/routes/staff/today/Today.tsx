import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from '@/components/icons'
import {
  doctorWaits,
  maskBirth,
  problemCards,
  problemTotal,
  summaryTiles,
  type ProblemCard,
  type ProblemRow,
  type SummaryTile,
} from '../mockData'

// 오늘의 현황 (/today) — TODAY-*.
// 정본이 요구하는 순서: 「지금 처리할 것」(문제 우선)이 맨 위, 「오늘 요약」 숫자는 그 아래.
// 요구사항 3.2: "숫자만 보여주는 화면보다 지금 처리해야 할 환자와 문제가 먼저".

const TONE_TEXT: Record<SummaryTile['tone'], string> = {
  teal: 'text-primary',
  amber: 'text-amber-600',
  sky: 'text-sky-600',
  violet: 'text-violet-600',
  gray: 'text-slate-500',
  neutral: 'text-foreground',
}

/** 작은 버튼 — 데모용 공통 스타일 */
function Btn({
  children,
  variant = 'ghost',
  onClick,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'outline' | 'ghost' | 'quiet'
  onClick?: () => void
}) {
  const base = 'rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors'
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-border bg-card hover:bg-muted',
    ghost: 'text-primary hover:bg-primary/8',
    quiet: 'border border-border text-muted-foreground hover:bg-muted', // '그대로 두기'처럼 주된 길 아닌 것
  }[variant]
  return (
    <button onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  )
}

function Row({ card, row }: { card: ProblemCard; row: ProblemRow }) {
  const navigate = useNavigate()
  const [processed, setProcessed] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const stamp = (
    <span className="text-sm text-muted-foreground">
      처리함 ·{' '}
      <button onClick={() => setProcessed(false)} className="font-medium text-primary hover:underline">
        되돌리기
      </button>
    </span>
  )

  const buttons = () => {
    switch (card.kind) {
      case 'wait':
        return (
          <>
            <Btn variant="outline" onClick={() => navigate('/staff/queue')}>
              대기 목록에서 보기
            </Btn>
            <Btn onClick={() => navigate('/staff/patients/p1')}>환자 상세</Btn>
          </>
        )
      case 'noshow':
        return (
          <>
            <Btn variant="primary" onClick={() => setProcessed(true)}>
              도착 처리
            </Btn>
            <Btn variant="ghost" onClick={() => setRevealed((v) => !v)}>
              번호 보기
            </Btn>
            <Btn onClick={() => navigate('/staff/patients/p1')}>환자 상세</Btn>
          </>
        )
      case 'yday':
        return (
          <>
            <Btn variant="primary" onClick={() => setProcessed(true)}>
              진료 완료로 마감
            </Btn>
            <Btn onClick={() => navigate('/staff/patients/p1')}>환자 상세</Btn>
          </>
        )
      case 'resched':
        if (row.reason.includes('상담')) {
          return (
            <Btn variant="outline" onClick={() => navigate('/staff/tickets')}>
              예약·상담 보기
            </Btn>
          )
        }
        return (
          <>
            <Btn variant="outline" onClick={() => setProcessed(true)}>
              예약 옮기기
            </Btn>
            <Btn variant="ghost" onClick={() => setProcessed(true)}>
              취소
            </Btn>
            <Btn variant="quiet" onClick={() => setProcessed(true)}>
              그대로 두기
            </Btn>
          </>
        )
    }
  }

  return (
    <div className={`flex items-center gap-4 px-4 py-2.5 ${processed ? 'opacity-45' : ''}`}>
      {/* 시각 레일 (시그니처) — 미접수·미래는 옅은 회색 (TODAY-ROW-02) */}
      <div className="flex w-14 shrink-0 flex-col items-end border-r border-border pr-3">
        <span
          className={`text-sm font-semibold tabular-nums ${
            row.future ? 'text-muted-foreground/60' : 'text-foreground'
          }`}
        >
          {row.time}
        </span>
      </div>

      {/* 이름 + 생년월일·과/의사 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold">{row.name}</span>
          {row.emergency && (
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[0.7rem] font-bold text-white">응급</span>
          )}
          {row.smsFailed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {row.smsFailed}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {revealed ? (
            <span className="font-medium text-foreground">{row.tel}</span>
          ) : (
            maskBirth(row.birth)
          )}
          {' · '}
          {row.dept} {row.doctor}
          {revealed && row.tel && (
            <button
              onClick={() => navigator.clipboard?.writeText(row.tel!)}
              className="ml-2 text-xs font-medium text-primary hover:underline"
            >
              복사
            </button>
          )}
        </div>
      </div>

      {/* 사유 (주의색) */}
      <div className="hidden w-40 shrink-0 text-sm font-medium text-amber-600 sm:block">{row.reason}</div>

      {/* 버튼 or 처리 도장 */}
      <div className="flex shrink-0 items-center gap-2">{processed ? stamp : buttons()}</div>
    </div>
  )
}

function ProblemCardView({ card }: { card: ProblemCard }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      {/* 카드 제목 — 좌측 4px 주의색 바 + 주의색 건수, 배경 안 칠함 (TODAY-CARD-01) */}
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-2.5">
        <span className="h-4 w-1 rounded-full bg-amber-500" />
        <h3 className="text-sm font-semibold">{card.title}</h3>
        <span className="text-sm font-bold text-amber-600 tabular-nums">{card.rows.length}</span>
      </div>
      <div className="divide-y divide-border/60">
        {card.rows.map((r) => (
          <Row key={r.id} card={card} row={r} />
        ))}
      </div>
    </section>
  )
}

export function Today() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      {/* ── 지금 처리할 것 (맨 위) ── */}
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-base font-bold">지금 처리할 것</h2>
        <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-bold text-amber-700 tabular-nums">
          {problemTotal}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {problemCards.map((c) => (
          <ProblemCardView key={c.kind} card={c} />
        ))}
      </div>

      {/* ── 오늘 요약 (아래) ── */}
      <h2 className="mb-2.5 mt-8 text-base font-bold">오늘 요약</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {summaryTiles.map((t) => (
          <button
            key={t.key}
            onClick={() => navigate('/staff/queue')}
            className="rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(16,45,50,0.04)] transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
          >
            <div className={`text-2xl font-bold tabular-nums ${TONE_TEXT[t.tone]}`}>{t.count}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t.label}</div>
          </button>
        ))}
      </div>

      {/* 의사별 대기 인원 (TODAY-DOC-01: 진료과 생략 안 함) */}
      <div className="mt-3 rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">의사별 대기 인원</h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {doctorWaits.map((d) => (
            <button
              key={d.dept + d.doctor}
              onClick={() => navigate('/staff/queue')}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-muted"
            >
              <span>
                <span className="text-muted-foreground">{d.dept}</span> {d.doctor}
              </span>
              <span className="font-semibold tabular-nums">
                {d.waiting}
                <span className="ml-0.5 text-sm font-normal text-muted-foreground">명</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        데모 화면입니다 · 가짜 데이터로 정상 흐름을 보여 줍니다
      </p>
    </div>
  )
}
