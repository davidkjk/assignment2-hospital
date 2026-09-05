import { useMemo, useState } from 'react'
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileText,
  HelpCircle,
  History,
  Layers3,
  Phone,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from '@/components/icons'
import { EmptyState, PageHead, StaffPage, Tag, btnGhost, btnLink } from '../../_ui'
import { maskBirth, maskPhone } from '../../mockData'

// 환자정보 열람 기록 (/staff/admin/access-logs) — ALOG-*.
// 관리자 전용 읽기 화면: 누가·언제·누구의·무엇을 열었는지. 삭제·수정·되돌리기 없음(ALOG-HEAD-02).
// 자료 종류를 분리 표시 — 환자정보/진료기록/검색 1회/번호 열람/대량 묶음/병합·되돌림/통계 상세·CSV/미래값.
// data-testid="staff-access-logs".

// ── 자료 종류(resource_type) → 라벨·배지색·아이콘 (ALOG-LIST-05·06·07·12·13, ALOG-AUDIT-*, ALOG-GROUP-*) ──
type Kind =
  | 'patient_detail'
  | 'medical_record'
  | 'search'
  | 'phone_reveal'
  | 'bulk_phone_reveal'
  | 'patient_merge'
  | 'patient_merge_undo'
  | 'stats_drilldown'
  | 'stats_export'
  | 'unknown'

const KIND: Record<Kind, { label: string; tone: string; Icon: typeof FileText }> = {
  patient_detail: { label: '환자정보', tone: 'bg-slate-100 text-slate-700', Icon: UserRound },
  medical_record: { label: '진료기록', tone: 'bg-violet-100 text-violet-700', Icon: FileText },
  search: { label: '검색', tone: 'bg-sky-100 text-sky-700', Icon: Search },
  phone_reveal: { label: '번호 열람', tone: 'bg-amber-100 text-amber-800', Icon: Phone },
  bulk_phone_reveal: { label: '대량 번호 열람', tone: 'bg-amber-100 text-amber-800', Icon: Send },
  patient_merge: { label: '병합', tone: 'bg-primary/12 text-primary', Icon: Layers3 },
  patient_merge_undo: { label: '병합 되돌림', tone: 'bg-rose-100 text-rose-700', Icon: History },
  stats_drilldown: { label: '통계 상세 열람', tone: 'bg-indigo-100 text-indigo-700', Icon: BarChart3 },
  stats_export: { label: '통계 CSV 내보내기', tone: 'bg-indigo-100 text-indigo-700', Icon: BarChart3 },
  unknown: { label: '확인 필요', tone: 'bg-muted text-muted-foreground', Icon: HelpCircle },
}

interface LogRow {
  id: string
  at: string // 병원 시간대 절대시각 YYYY.MM.DD HH:mm:ss (ALOG-LIST-02)
  staff: string // 열람 직원 (없으면 '' → 직원 정보 없음, ALOG-LIST-03)
  kind: Kind
  patientId?: string // 환자 필터용
  patientName?: string // 단건 대상 (마스킹 식별자와 함께)
  birth?: string
  phone?: string
  detail: string // 열람 자료 보조 설명(사유·범위·지표 등)
  count?: number // 대량 묶음 대상 수
  reason?: string // 병합 되돌림 사유 (ALOG-LIST-12)
  suppressed?: boolean // 통계 CSV 소수집계 억제 (ALOG-LIST-13)
  members?: { name: string; birth: string; at: string }[] // 묶음 개별 행 (ALOG-GROUP-02)
}

// 정보 밀도: 14행 · 자료 종류·직원·상태를 다양하게 (품질기준 #3)
const LOGS: LogRow[] = [
  { id: 'l1', at: '2026.08.22 10:14:32', staff: '박지민', kind: 'phone_reveal', patientId: 'p1', patientName: '홍길동', birth: '1990-03-14', phone: '010-2211-5678', detail: '예약 변경 상담 연락' },
  { id: 'l2', at: '2026.08.22 10:11:08', staff: '김서연', kind: 'search', detail: '검색 1회 실행 · 이름 조각 조회 (검색어 원문은 남기지 않음)' },
  { id: 'l3', at: '2026.08.22 09:58:44', staff: '이정훈', kind: 'medical_record', patientId: 'p2', patientName: '김민서', birth: '1978-11-02', phone: '010-8842-1130', detail: '오늘 진료 전 과거 기록 확인' },
  {
    id: 'l4', at: '2026.08.22 09:42:15', staff: '김서연', kind: 'bulk_phone_reveal', count: 3000,
    detail: '검진 안내 발송 명단 번호 열람',
    members: [
      { name: '홍길동', birth: '1990-03-14', at: '09:42:15' },
      { name: '김민서', birth: '1978-11-02', at: '09:42:15' },
      { name: '박서준', birth: '1965-07-21', at: '09:42:15' },
    ],
  },
  { id: 'l5', at: '2026.08.22 09:30:51', staff: '박지민', kind: 'patient_detail', patientId: 'p3', patientName: '박서준', birth: '1965-07-21', phone: '010-3390-7742', detail: '접수 확인' },
  { id: 'l6', at: '2026.08.21 17:22:09', staff: '김서연', kind: 'stats_export', detail: '2026.08.01~08.21 운영 통계 · 428행', count: 428, suppressed: true },
  { id: 'l7', at: '2026.08.21 16:40:33', staff: '김서연', kind: 'stats_drilldown', detail: '예약 부도 지표 상세 · 2026.08 · 12건', count: 12 },
  { id: 'l8', at: '2026.08.21 15:03:20', staff: '한지우', kind: 'patient_merge', patientName: '이수현', detail: '대표 이수현(1982-05) ← 합쳐진 이수현(1982-05)' },
  { id: 'l9', at: '2026.08.21 14:51:47', staff: '한지우', kind: 'patient_merge_undo', patientName: '이수현', detail: '이수현 병합 되돌림', reason: '다른 사람으로 확인되어 정정' },
  { id: 'l10', at: '2026.08.21 11:18:02', staff: '이정훈', kind: 'medical_record', patientId: 'p4', patientName: '최유나', birth: '2001-09-30', phone: '010-5567-2098', detail: '재진 기록 확인' },
  { id: 'l11', at: '2026.08.21 10:05:39', staff: '박지민', kind: 'phone_reveal', patientId: 'p5', patientName: '정도현', birth: '1959-01-08', phone: '010-7781-4420', detail: '진료 결과 안내 연락' },
  { id: 'l12', at: '2026.08.20 18:12:55', staff: '', kind: 'patient_detail', patientId: 'p6', patientName: '강하늘', birth: '1994-12-19', phone: '010-2245-8890', detail: '예약 확인' },
  { id: 'l13', at: '2026.08.20 16:44:10', staff: '김서연', kind: 'unknown', detail: '서버가 보낸 새 기록 종류 · 마이그레이션 계약 확인 필요' },
  { id: 'l14', at: '2026.08.20 09:20:31', staff: '박지민', kind: 'search', detail: '검색 1회 실행 · 생년월일 조회 (검색어 원문은 남기지 않음)' },
]

const STAFF_OPTIONS = ['전체', '김서연', '박지민', '이정훈', '한지우']
const TYPE_OPTIONS: { key: 'all' | Kind; label: string }[] = [
  { key: 'all', label: '전체 종류' },
  { key: 'patient_detail', label: '환자정보' },
  { key: 'medical_record', label: '진료기록' },
  { key: 'search', label: '검색' },
  { key: 'phone_reveal', label: '번호 열람' },
  { key: 'bulk_phone_reveal', label: '대량 번호 열람' },
  { key: 'patient_merge', label: '병합·되돌림' },
  { key: 'stats_drilldown', label: '통계 열람' },
]

function typeMatch(row: LogRow, t: 'all' | Kind): boolean {
  if (t === 'all') return true
  if (t === 'patient_merge') return row.kind === 'patient_merge' || row.kind === 'patient_merge_undo'
  if (t === 'stats_drilldown') return row.kind === 'stats_drilldown' || row.kind === 'stats_export'
  return row.kind === t
}

// 환자 열: 단건은 마스킹 식별자, 검색·통계는 환자 없음 (ALOG-LIST-04·13, ALOG-AUDIT-01)
function patientCell(row: LogRow) {
  if (row.kind === 'search') return { label: '환자 없는 검색 사건', sub: null as string | null, muted: true }
  if (row.kind === 'stats_drilldown' || row.kind === 'stats_export') return { label: '관리자 활동', sub: '환자 없음', muted: true }
  if (row.kind === 'patient_merge' || row.kind === 'patient_merge_undo') return { label: row.patientName ?? '—', sub: '두 환자 계보', muted: false }
  if (!row.patientName) return { label: '—', sub: null, muted: true }
  const bits = [row.birth ? maskBirth(row.birth) : null, row.phone ? maskPhone(row.phone) : null].filter(Boolean)
  return { label: row.patientName, sub: bits.join(' · ') || null, muted: false }
}

export function AccessLogs() {
  const [from, setFrom] = useState('2026-08-01')
  const [to, setTo] = useState('2026-08-22')
  const [staff, setStaff] = useState('전체')
  const [type, setType] = useState<'all' | Kind>('all')
  const [query, setQuery] = useState('')
  const [patientFilter, setPatientFilter] = useState<{ id: string; label: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim()
    return LOGS.filter((row) => {
      if (patientFilter && row.patientId !== patientFilter.id) return false
      if (staff !== '전체' && row.staff !== staff) return false
      if (!typeMatch(row, type)) return false
      if (q && !(row.detail.includes(q) || (row.staff && row.staff.includes(q)) || (row.patientName ?? '').includes(q))) return false
      return true
    })
  }, [staff, type, query, patientFilter])

  const filtering = !!patientFilter || staff !== '전체' || type !== 'all' || !!query.trim()

  return (
    <StaffPage testid="staff-access-logs" max="max-w-[1360px]">
      <PageHead title="환자정보 열람 기록" />

      {/* 읽기 전용 고지 — ALOG-HEAD-02 */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm">
          <div className="font-semibold text-foreground">이 기록은 삭제하거나 수정할 수 없습니다</div>
          <div className="mt-0.5 text-muted-foreground">
            검색은 실행 1회당 한 줄, 번호 보기는 실제로 마스킹을 해제한 환자마다 별도로 기록됩니다. 최신 첫 페이지 최대 200건까지 보여 줍니다.
          </div>
        </div>
      </div>

      {/* 조회 필터 — 기간(from포함·to제외)·직원·유형·검색 (ALOG-FILTER-01·07) */}
      <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          조회 기간
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
            <span className="text-muted-foreground">~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          열람 직원
          <select value={staff} onChange={(e) => setStaff(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40">
            {STAFF_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          자료 종류
          <select value={type} onChange={(e) => setType(e.target.value as 'all' | Kind)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40">
            {TYPE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          검색
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="직원·마스킹 식별자·사유" className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
          </div>
        </label>
      </div>

      {/* 환자 필터 칩 + [필터 지우기] — ALOG-FILTER-02·03·05 */}
      {patientFilter && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">환자 필터</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
            {patientFilter.label}
            <button onClick={() => setPatientFilter(null)} className="rounded-full p-0.5 hover:bg-primary/15" aria-label="환자 필터 지우기"><X className="h-3.5 w-3.5" /></button>
          </span>
          <button onClick={() => setPatientFilter(null)} className={btnLink}>필터 지우기</button>
        </div>
      )}

      {/* 결과 수 — 전체/필터 구분 (ALOG-FILTER-01·03, ALOG-LIST-09) */}
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div className="text-sm">
          <span className="font-semibold text-foreground">최근 200건</span>
          <span className="text-muted-foreground"> 중 </span>
          <span className="font-semibold tabular-nums text-foreground">{rows.length}건</span>
          <span className="text-muted-foreground">{filtering ? ' (조건 적용)' : ' 표시'}</span>
        </div>
        <div className="text-xs text-muted-foreground">병원 시간대 · 최신순</div>
      </div>

      {/* 감사 표 — 4열 고정: 열람 시각·열람 직원·환자·열람 자료 (ALOG-LIST-01) */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
              <th className="w-[168px] px-4 py-2.5 font-semibold">열람 시각</th>
              <th className="w-[120px] px-4 py-2.5 font-semibold">열람 직원</th>
              <th className="w-[220px] px-4 py-2.5 font-semibold">환자</th>
              <th className="px-4 py-2.5 font-semibold">열람 자료</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={<Search className="h-6 w-6" />}
                    title={patientFilter ? '이 환자의 접근 기록이 없습니다' : '조건에 맞는 기록이 없습니다'}
                    hint={patientFilter ? '다른 환자를 선택하거나 전체 기록으로 돌아가세요' : '기간·직원·종류 조건을 바꿔 보세요'}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const meta = KIND[row.kind]
                const pc = patientCell(row)
                const isGroup = row.kind === 'bulk_phone_reveal' && row.members
                const open = expanded === row.id
                return (
                  <RowFragment
                    key={row.id}
                    row={row}
                    meta={meta}
                    pc={pc}
                    isGroup={!!isGroup}
                    open={open}
                    onToggle={() => setExpanded(open ? null : row.id)}
                    onPickPatient={row.patientId && row.patientName ? () => setPatientFilter({ id: row.patientId!, label: `${row.patientName} · ${row.birth ? maskBirth(row.birth) : ''}` }) : undefined}
                  />
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 200건 이후 이어보기 — 월 1회 점검 (ALOG-FILTER-06·07) */}
      <div className="mt-3 flex justify-center">
        <button className={btnGhost} disabled>
          <ChevronDown className="h-4 w-4" /> 더 오래된 기록 200건 더 보기
        </button>
      </div>
    </StaffPage>
  )
}

function RowFragment({
  row,
  meta,
  pc,
  isGroup,
  open,
  onToggle,
  onPickPatient,
}: {
  row: LogRow
  meta: { label: string; tone: string; Icon: typeof FileText }
  pc: { label: string; sub: string | null; muted: boolean }
  isGroup: boolean
  open: boolean
  onToggle: () => void
  onPickPatient?: () => void
}) {
  const Icon = meta.Icon
  return (
    <>
      <tr className="group align-top transition-colors hover:bg-muted/40">
        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{row.at}</td>
        <td className="px-4 py-3">{row.staff || <span className="text-muted-foreground">직원 정보 없음</span>}</td>
        <td className="px-4 py-3">
          {onPickPatient ? (
            <button onClick={onPickPatient} className="text-left font-medium text-foreground hover:text-primary hover:underline">
              {pc.label}
            </button>
          ) : (
            <span className={pc.muted ? 'text-muted-foreground' : 'font-medium text-foreground'}>{pc.label}</span>
          )}
          {pc.sub && <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">{pc.sub}</div>}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${meta.tone}`}>
              <Icon className="h-3.5 w-3.5" />{meta.label}
            </span>
            {isGroup && <Tag>{row.count?.toLocaleString()}명</Tag>}
            {row.kind === 'stats_export' && row.suppressed && <Tag>소수 집계 억제 적용</Tag>}
          </div>
          <div className="mt-1 text-sm text-foreground">{row.detail}</div>
          {row.reason && <div className="mt-0.5 text-xs text-muted-foreground">사유 · {row.reason}</div>}
          {isGroup && (
            <button onClick={onToggle} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              개별 기록 보기
            </button>
          )}
        </td>
      </tr>
      {isGroup && open && row.members && (
        <tr className="bg-muted/30">
          <td colSpan={4} className="px-4 py-2">
            <div className="rounded-lg border border-border/60 bg-card">
              <div className="border-b border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                환자별 개별 열람 · 실제 번호는 다시 표시하지 않습니다
              </div>
              <ul className="divide-y divide-border/50 text-sm">
                {row.members.map((m, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2">
                    <span className="font-medium">{m.name} <span className="text-xs font-normal tabular-nums text-muted-foreground">{maskBirth(m.birth)}</span></span>
                    <span className="tabular-nums text-xs text-muted-foreground">{m.at}</span>
                  </li>
                ))}
                <li className="px-3 py-2 text-xs text-muted-foreground">… 외 {(row.count ?? 0) - row.members.length}명 (같은 시각·직원)</li>
              </ul>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
