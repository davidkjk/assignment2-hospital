import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, BarChart3, ExternalLink, FileText, ShieldCheck, X } from '@/components/icons'
import { PageHead, StaffPage, Tag, btnGhost, btnPrimary } from '../../_ui'

// 운영 통계 (/staff/admin/stats) — STAT-*.
// 관리자 전용 읽기 집계. 화면은 소수 억제 안 함(전부 공개·모든 셀 클릭 가능, 결정21) — CSV만 k=5 억제.
// 드릴다운 명단=마스킹 값, 행 클릭→환자 상세(정식 문). 집계·필터는 감사 안 함, 드릴다운·CSV만 감사(결정22).
// 지표별 기준일 분리(결정5). data-testid="staff-stats".

interface Metric {
  key: string
  label: string
  value: number
  basis: string // 기준일 (STAT-SCOPE-03)
  drill?: boolean // 목록형 = 드릴다운 가능 (STAT-DRILL-01)
  unit?: string
}

const METRICS: Metric[] = [
  { key: 'booked', label: '예약', value: 428, basis: '생성일 기준', drill: true },
  { key: 'visited', label: '실제 방문', value: 351, basis: '상태 전이일 기준', drill: true },
  { key: 'cancelled', label: '취소', value: 31, basis: '상태 전이일 기준', drill: true },
  { key: 'noshow', label: '예약 부도', value: 12, basis: '상태 전이일 기준', drill: true },
  { key: 'wait', label: '평균 대기', value: 18, basis: '대기 시작일 기준', unit: '분' },
  { key: 'longwait', label: '오래 기다린 사례', value: 17, basis: '대기 시작일 기준', drill: true },
  { key: 'handoff', label: '직원 연결 상담', value: 26, basis: '생성일 기준', drill: true },
  { key: 'done', label: '진료 완료', value: 329, basis: '상태 전이일 기준', drill: true },
]

const SOURCES = [
  { label: '환자 앱', n: 244, pct: 57 },
  { label: '직원 등록', n: 150, pct: 35 },
  { label: '상담봇', n: 34, pct: 8 },
]
const STATUS_DIST = [
  { label: '진료 완료', n: 329, pct: 77 },
  { label: '예약확정', n: 56, pct: 13 },
  { label: '취소', n: 31, pct: 7 },
  { label: '예약 부도', n: 12, pct: 3 },
]
const BY_DEPT = [
  { name: '내과', booked: 182, visited: 154, noshow: 5 },
  { name: '피부과', booked: 121, visited: 98, noshow: 3 },
  { name: '정형외과', booked: 89, visited: 71, noshow: 3 },
  { name: '이비인후과', booked: 36, visited: 28, noshow: 1 },
]
const BY_DOCTOR = [
  { name: '이정훈 · 내과', booked: 96, visited: 82, noshow: 2 },
  { name: '한서연 · 내과', booked: 86, visited: 72, noshow: 3 },
  { name: '윤지호 · 피부과', booked: 121, visited: 98, noshow: 3 },
  { name: '박강우 · 정형외과', booked: 89, visited: 71, noshow: 3 },
]
const BY_HOUR = [
  { h: '09시', n: 61 }, { h: '10시', n: 74 }, { h: '11시', n: 52 },
  { h: '14시', n: 48 }, { h: '15시', n: 39 }, { h: '16시', n: 24 },
  { h: '시간 미기록', n: 3, unrecorded: true },
]
// 드릴다운 명단 = 마스킹 값 (STAT-DRILL-02). '상세 명단'이라 표본 5줄이 아니라 실제 분량(스크롤)으로 생성한다.
const DRILL_ROWS = (() => {
  const sur = ['홍', '김', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권']
  const gv = ['동', '서', '준', '나', '현', '우', '연', '민', '호', '지', '아', '윤', '수', '빈', '결']
  let seed = 20260822
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  const rows: { id: string; name: string; phone: string; birth: string; when: string }[] = []
  for (let i = 0; i < 36; i++) {
    const yy = 1948 + Math.floor(rnd() * 62)
    const day = 14 + Math.floor(rnd() * 3)
    const hh = 9 + Math.floor(rnd() * 9)
    const mm = Math.floor(rnd() * 6) * 10
    rows.push({
      id: `p${i + 1}`,
      name: `${sur[Math.floor(rnd() * sur.length)]}*${gv[Math.floor(rnd() * gv.length)]}`,
      phone: `010-****-${String(1000 + Math.floor(rnd() * 8999))}`,
      birth: `${yy}-**-**`,
      when: `08.${day} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    })
  }
  return rows
})()

function Bar({ pct }: { pct: number }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Stats() {
  const navigate = useNavigate()
  const [from, setFrom] = useState('2026-08-01')
  const [to, setTo] = useState('2026-08-22')
  const [applied, setApplied] = useState({ from: '2026-08-01', to: '2026-08-22' })
  const [rangeErr, setRangeErr] = useState('')
  const [by, setBy] = useState<'dept' | 'doctor'>('dept')
  const [drill, setDrill] = useState<Metric | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)

  const rangeLabel = useMemo(() => `${applied.from} ~ ${applied.to}`, [applied])
  const rows = by === 'dept' ? BY_DEPT : BY_DOCTOR
  const maxHour = Math.max(...BY_HOUR.map((h) => h.n))

  function runQuery() {
    if (from > to) { setRangeErr('종료일은 시작일 이후로 선택해주세요'); return }
    setRangeErr('')
    setApplied({ from, to })
  }

  return (
    <StaffPage testid="staff-stats" max="max-w-[1360px]">
      <PageHead
        title="운영 통계"
        action={<button onClick={() => setCsvOpen(true)} className={btnGhost}><FileText className="h-4 w-4" /> CSV 내려받기</button>}
      />

      {/* 기간 선택 (STAT-SCOPE-01·02) */}
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          조회 기간
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
            <span className="text-muted-foreground">~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
          </div>
        </label>
        <button onClick={runQuery} className={btnPrimary}>통계 보기</button>
        {rangeErr && <span className="pb-1.5 text-xs text-rose-600">{rangeErr}</span>}
        {/* 감사 경계 안내 (STAT-AUDIT-01·02) */}
        <span className="ml-auto pb-1.5 text-xs text-muted-foreground">집계 표·필터 변경은 별도 감사 사건을 만들지 않습니다</span>
      </div>

      {/* 운영 지표 — 모든 셀 클릭 가능(화면 억제 없음, STAT-DRILL-01) + 기준일 표시(STAT-SCOPE-03) */}
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{rangeLabel} 운영 지표</h3>
        <span className="text-xs text-muted-foreground">숫자를 누르면 마스킹된 상세 명단이 열립니다</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {METRICS.map((m) => {
          const inner = (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                {m.drill && <BarChart3 className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{m.value.toLocaleString()}<span className="ml-0.5 text-sm font-normal text-muted-foreground">{m.unit ?? ''}</span></div>
              <div className="mt-0.5 text-[0.7rem] text-muted-foreground">{m.basis}</div>
            </>
          )
          return m.drill ? (
            <button key={m.key} onClick={() => setDrill(m)} className="group rounded-xl border border-border/70 bg-card p-4 text-left shadow-[0_1px_2px_rgba(16,45,50,0.04)] transition-colors hover:border-primary/40 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring/40">
              {inner}
            </button>
          ) : (
            <div key={m.key} className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">{inner}</div>
          )
        })}
      </div>

      {/* 유입원 3분류 + 상태 분포 (STAT-METRIC-05) */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">예약 유입원</h3><Tag>생성일 기준</Tag></div>
          <div className="mt-3 space-y-2.5">
            {SOURCES.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-sm"><span>{s.label}</span><span className="tabular-nums text-muted-foreground">{s.n}건 · {s.pct}%</span></div>
                <Bar pct={s.pct} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">앱·직원·상담봇을 서로 섞지 않고 별도 유입원으로 집계합니다.</p>
        </section>
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">예약 상태 분포</h3><Tag>상태 전이일 기준</Tag></div>
          <div className="mt-3 space-y-2.5">
            {STATUS_DIST.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-sm"><span>{s.label}</span><span className="tabular-nums text-muted-foreground">{s.n}건 · {s.pct}%</span></div>
                <Bar pct={s.pct} />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 진료과·의사별 표 (STAT-METRIC-02) */}
      <section className="mt-3 rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">진료과·의사별 예약 현황</h3>
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
            {(['dept', 'doctor'] as const).map((k) => (
              <button key={k} onClick={() => setBy(k)} className={`rounded-md px-3 py-1 font-medium transition-colors ${by === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {k === 'dept' ? '진료과별' : '의사별'}
              </button>
            ))}
          </div>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs font-semibold text-muted-foreground">
              <th className="py-2 font-semibold">{by === 'dept' ? '진료과' : '의사'}</th>
              <th className="py-2 text-right font-semibold">예약</th>
              <th className="py-2 text-right font-semibold">방문</th>
              <th className="py-2 text-right font-semibold">부도</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((r) => (
              <tr key={r.name} className="hover:bg-muted/40">
                <td className="py-2">{r.name}</td>
                <td className="py-2 text-right tabular-nums">{r.booked}</td>
                <td className="py-2 text-right tabular-nums">{r.visited}</td>
                <td className="py-2 text-right tabular-nums">{r.noshow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 시간대별 방문 (STAT-METRIC-03) + 상담봇 지표 (STAT-METRIC-06) */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">시간대별 방문</h3><Tag>슬롯 시작 시각 기준</Tag></div>
          <div className="mt-3 space-y-1.5">
            {BY_HOUR.map((h) => (
              <div key={h.h} className="flex items-center gap-3 text-sm">
                <span className={`w-20 shrink-0 ${h.unrecorded ? 'text-muted-foreground' : ''}`}>{h.h}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                  <div className={`h-full rounded ${h.unrecorded ? 'bg-slate-400' : 'bg-primary'}`} style={{ width: `${(h.n / maxHour) * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{h.n}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <h3 className="text-sm font-semibold">상담봇 지표</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">예약 수와 섞지 않고 별도로 집계합니다.</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between"><dt className="text-muted-foreground">총 문의</dt><dd className="tabular-nums font-medium">312건</dd></div>
            <div className="flex items-center justify-between"><dt className="text-muted-foreground">상담봇 자체 안내</dt><dd className="tabular-nums font-medium">248건</dd></div>
            <div className="flex items-center justify-between"><dt className="text-muted-foreground">직원 연결</dt><dd className="tabular-nums font-medium">64건</dd></div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">많이 들어온 질문 순위</dt>
              <dd className="text-xs text-muted-foreground">현재 집계할 수 없음</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">일부 지표는 집계 계약이 아직 없어 0으로 위장하지 않고 그대로 표시합니다.</p>
        </section>
      </div>

      {/* 드릴다운 모달 (STAT-DRILL-01~04) */}
      {drill && (
        <div role="dialog" aria-modal="true" aria-labelledby="drill-title" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--elevation-card)]">
            <div className="flex items-start justify-between border-b border-border/60 px-5 py-3">
              <div>
                <h2 id="drill-title" className="text-base font-bold">{drill.label} 상세 명단</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {rangeLabel} · {drill.basis} · 총 {drill.value.toLocaleString()}건
                  {drill.value > DRILL_ROWS.length && ` 중 ${DRILL_ROWS.length}건 표시`}
                </p>
              </div>
              <button onClick={() => setDrill(null)} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex items-start gap-2 bg-primary/5 px-5 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>훑어보기용 마스킹 명단입니다. 전체 정보가 필요하면 행을 눌러 환자 상세로 이동하세요 — 이 상세 열람은 접근 기록에 남습니다.</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 border-b border-border/60 bg-muted/60 text-left text-xs font-semibold text-muted-foreground">
                    <th className="px-5 py-2 font-semibold">환자</th>
                    <th className="px-5 py-2 font-semibold">전화 · 생년월일</th>
                    <th className="px-5 py-2 font-semibold">시각</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {DRILL_ROWS.slice(0, drill.value).map((r) => (
                    <tr key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/staff/patients/${r.id}`)}>
                      <td className="px-5 py-2.5 font-medium">{r.name}</td>
                      <td className="px-5 py-2.5 tabular-nums text-muted-foreground">{r.phone} · {r.birth}</td>
                      <td className="px-5 py-2.5 tabular-nums text-muted-foreground">{r.when}</td>
                      <td className="px-5 py-2.5 text-right"><ExternalLink className="ml-auto h-4 w-4 text-muted-foreground" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border/60 px-5 py-2 text-xs text-muted-foreground">이 상세 명단 열람은 <strong className="font-medium text-foreground">통계 상세 열람</strong> 감사 사건으로 남습니다.</div>
          </div>
        </div>
      )}

      {/* CSV 억제 안내 — 다운로드 직전 (STAT-MASK-03 · STAT-EXPORT-02) */}
      {csvOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="csv-title" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--elevation-card)]">
            <div className="mb-1 flex items-start justify-between">
              <h2 id="csv-title" className="text-lg font-bold">CSV로 내려받기</h2>
              <button onClick={() => setCsvOpen(false)} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground">{rangeLabel} 집계 표를 CSV 파일로 내려받습니다.</p>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>화면은 전부 보이지만, 병원 밖으로 나가는 <strong className="font-semibold">파일에서는 5명 미만 칸을 «소수 인원 보호로 비공개»로 가립니다.</strong> 전체 숫자는 이 화면에서 확인하세요.</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">이 내려받기는 <strong className="font-medium text-foreground">통계 CSV 내보내기</strong> 감사 사건으로 남습니다.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setCsvOpen(false)} className={btnGhost}>취소</button>
              <button onClick={() => setCsvOpen(false)} className={btnPrimary}><FileText className="h-4 w-4" /> 내려받기</button>
            </div>
          </div>
        </div>
      )}
    </StaffPage>
  )
}
