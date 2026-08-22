import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Search, UserPlus, UserRound, UserRoundSearch } from '@/components/icons'
import { maskBirth, maskPhone } from '../mockData'
import { StaffPage, PageHead, StatusBadge, Tag, btnPrimary, btnGhost, EmptyState } from '../_ui'
import { useStaff } from '../staffState'

// 환자 검색 (/patients) — SEARCH-*.
// 한 칸 통합검색: 이름 조각·전화·생년월일 아무거나(SEARCH-BOX-01/02). 부분 일치(SEARCH-MATCH-01),
// 숫자는 전화·생일 양쪽(-02), 하이픈 제거(-03), 공백 AND(-01). 자동 검색 전제.
// 결과 줄: 이름·생년월일(마스킹)·전화(마스킹) + 걸린 이유 배지(SEARCH-WHY-01) + 오늘 상태별 동작 하나(SEARCH-ACT-01).

type Today = 'not_arrived' | 'waiting' | 'in_progress' | 'done' | 'none'

interface P {
  id: string
  name: string
  birth: string
  tel: string
  lastVisit: string // 최근 방문(정렬 ②)
  today?: { status: Today; time?: string; dept?: string; doctor?: string }
}

const PATIENTS: P[] = [
  { id: 'p1', name: '김태호', birth: '1972-11-03', tel: '010-4821-9930', lastVisit: '2026-06-10', today: { status: 'waiting', time: '09:05', dept: '내과', doctor: '이정훈' } },
  { id: 'p2', name: '김하늘', birth: '1998-02-14', tel: '010-4821-2201', lastVisit: '2026-05-02', today: { status: 'not_arrived', time: '10:20', dept: '피부과', doctor: '윤지호' } },
  { id: 'p3', name: '김서준', birth: '1965-07-30', tel: '010-3311-8842', lastVisit: '2026-07-21' },
  { id: 'p4', name: '이수진', birth: '1975-09-08', tel: '010-2841-5678', lastVisit: '2026-08-01', today: { status: 'done', time: '08:30', dept: '내과', doctor: '이정훈' } },
  { id: 'p5', name: '이말녀', birth: '1955-08-17', tel: '010-2841-1043', lastVisit: '2026-03-15', today: { status: 'in_progress', time: '09:00', dept: '내과', doctor: '한서연' } },
  { id: 'p6', name: '박강우', birth: '1980-01-22', tel: '010-7734-2201', lastVisit: '2026-04-11' },
  { id: 'p7', name: '정순남', birth: '1948-05-21', tel: '010-5521-8834', lastVisit: '2026-08-20', today: { status: 'not_arrived', time: '11:00', dept: '정형외과', doctor: '박강우' } },
  { id: 'p8', name: '조현우', birth: '1982-06-04', tel: '010-9092-1043', lastVisit: '2025-12-30' },
  { id: 'p9', name: '한지아', birth: '1995-01-19', tel: '010-3092-7788', lastVisit: '2026-02-18' },
  { id: 'p10', name: '윤도현', birth: '1990-02-28', tel: '010-3092-1043', lastVisit: '2026-06-30' },
]

const strip = (s: string) => s.replace(/[-.\s]/g, '')

function matchBadges(p: P, tokens: string[]): string[] {
  const set = new Set<string>()
  for (const t of tokens) {
    const digits = strip(t)
    if (/[가-힣]/.test(t) && p.name.includes(t)) set.add('이름 일치')
    if (digits && /^\d+$/.test(digits)) {
      if (strip(p.tel).includes(digits)) set.add('전화 일치')
      if (strip(p.birth).includes(digits)) set.add('생일 일치')
    }
  }
  return [...set]
}

function tokenMatches(p: P, t: string): boolean {
  const digits = strip(t)
  if (/[가-힣]/.test(t)) return p.name.includes(t)
  if (digits && /^\d+$/.test(digits)) return strip(p.tel).includes(digits) || strip(p.birth).includes(digits)
  return p.name.includes(t)
}

const rank = (p: P) => (p.today && p.today.status !== 'none' ? 0 : 1) // ① 오늘 볼 사람 먼저

function ActionButton({ p }: { p: P }) {
  const navigate = useNavigate()
  const st = p.today?.status ?? 'none'
  if (st === 'not_arrived')
    return <button className={btnPrimary}>도착 처리</button>
  if (st === 'waiting' || st === 'in_progress')
    return <button onClick={() => navigate('/staff/queue')} className={btnGhost}>대기 목록에서 보기</button>
  if (st === 'done')
    return <button onClick={() => navigate(`/staff/patients/${p.id}`)} className={btnGhost}>환자 상세</button>
  return (
    <div className="flex gap-2">
      <button className={btnGhost}><CalendarPlus className="h-4 w-4 text-primary" />예약 잡기</button>
      <button className={btnGhost}><UserPlus className="h-4 w-4 text-primary" />당일 방문 등록</button>
    </div>
  )
}

export function PatientSearch() {
  const navigate = useNavigate()
  useStaff()
  const [q, setQ] = useState('')
  const tokens = q.trim().split(/\s+/).filter(Boolean)

  const results = useMemo(() => {
    if (tokens.length === 0) return []
    return PATIENTS.filter((p) => tokens.every((t) => tokenMatches(p, t))).sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b)
      if (a.lastVisit !== b.lastVisit) return a.lastVisit < b.lastVisit ? 1 : -1 // 최근 방문 위
      return a.name.localeCompare(b.name, 'ko')
    })
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <StaffPage testid="patient-search" max="max-w-4xl">
      <PageHead title="환자 검색" sub="이름 · 전화번호 · 생년월일 중 아는 것을 넣으면 찾습니다" />

      {/* 한 칸 통합 검색 */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 · 전화번호 · 생년월일 중 아는 것을 넣어 주세요"
          className="h-12 w-full rounded-xl border border-input bg-card pl-11 pr-4 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
      </div>

      {tokens.length > 0 && (
        <div className="mt-2 px-1 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{results.length}명</span>
          {tokens.length > 1 && <span className="ml-1">· 조각을 이어 치면 더 좁혀집니다</span>}
        </div>
      )}

      {/* 타자 전: 사용법 3줄 (SB-17) */}
      {tokens.length === 0 && (
        <div className="mt-8 space-y-3 rounded-xl border border-border/70 bg-card p-5 text-sm shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <UserRoundSearch className="h-4 w-4 text-primary" /> 이렇게 찾으세요
          </div>
          {[
            ['이름 일부만', '「김」만 넣어도 「김태호」가 나옵니다'],
            ['형태 자유', '전화·생일은 하이픈·점 없이 붙여 넣어도 됩니다 — 010-1234도, 0101234도'],
            ['이어 쳐서 좁히기', '결과가 많으면 뒤에 조각을 이어 치세요 — 「김 1234」'],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-3">
              <span className="w-24 shrink-0 font-medium">{t}</span>
              <span className="text-muted-foreground">{d}</span>
            </div>
          ))}
        </div>
      )}

      {/* 결과 */}
      {tokens.length > 0 && (
        <div className="mt-3">
          {results.length === 0 ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="조회된 환자가 없습니다"
              hint="조각을 줄여 다시 찾아보세요"
            />
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
              {results.map((p) => {
                const badges = matchBadges(p, tokens)
                return (
                  <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                    <button onClick={() => navigate(`/staff/patients/${p.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <UserRound className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{p.name}</span>
                          {badges.map((b) => (
                            <Tag key={b} className="!bg-primary/10 !text-primary">{b}</Tag>
                          ))}
                        </div>
                        <div className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                          {maskBirth(p.birth)} · {maskPhone(p.tel)}
                          {p.today && p.today.status !== 'none' && p.today.time && (
                            <span className="ml-2 text-primary">오늘 예약 {p.today.time} · {p.today.dept} {p.today.doctor}</span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {p.today && p.today.status === 'waiting' && <StatusBadge status="진료 대기" />}
                      {p.today && p.today.status === 'in_progress' && <StatusBadge status="진료 중" />}
                      {p.today && p.today.status === 'done' && <StatusBadge status="진료 완료" />}
                      <ActionButton p={p} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </StaffPage>
  )
}
