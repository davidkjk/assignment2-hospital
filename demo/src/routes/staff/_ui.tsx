import type { ReactNode } from 'react'

// 직원 콘솔 공용 프리미티브 — 각진 촘촘한 패널·업무 밀도(딥틸 잉크 사이드바와 짝).
// 색은 shadcn 의미 토큰만. 패널 = 얇은 경계선 + 미세 그림자(폭신한 환자앱 카드와 다른 '체급').

/** 화면 본문 래퍼 — 가운데 정렬 + 데모 꼬리말 */
export function StaffPage({
  children,
  max = 'max-w-6xl',
  footer = true,
  testid,
}: {
  children: ReactNode
  max?: string
  footer?: boolean
  testid?: string
}) {
  return (
    <div className={`mx-auto ${max} px-6 py-5`} data-testid={testid}>
      {children}
      {footer && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          데모 화면입니다 · 가짜 데이터로 정상 흐름을 보여 줍니다
        </p>
      )}
    </div>
  )
}

/** 화면 안내 머리 — 제목 + 부제 + 우측 액션 */
export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold leading-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/** 얇은 경계 + 미세 그림자 패널(= 환자상세 Section과 동일 체급) */
export function Panel({
  title,
  action,
  children,
  className = '',
  pad = 'p-4',
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  pad?: string
}) {
  return (
    <section
      className={`rounded-xl border border-border/70 bg-card ${pad} shadow-[0_1px_2px_rgba(16,45,50,0.04)] ${className}`}
    >
      {title && (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// ── 상태 배지 — 예약·티켓·직원·문서 상태를 색으로(색만으로 구분하지 않게 글자도 함께) ──
const TONE: Record<string, string> = {
  teal: 'bg-primary text-primary-foreground',
  sky: 'bg-sky-600 text-white',
  violet: 'bg-violet-600 text-white',
  amber: 'bg-amber-500 text-white',
  gray: 'bg-slate-500 text-white',
  slate: 'bg-slate-600 text-white',
  green: 'bg-emerald-600 text-white',
  red: 'bg-rose-600 text-white',
  soft: 'bg-muted text-muted-foreground',
}
export type BadgeTone = keyof typeof TONE

const STATUS_TONE: Record<string, BadgeTone> = {
  // 예약
  예약신청: 'amber',
  예약확정: 'teal',
  도착: 'violet',
  '진료 대기': 'sky',
  '진료 중': 'teal',
  '진료 완료': 'gray',
  '환자 취소': 'amber',
  '병원 취소': 'amber',
  '예약 부도': 'slate',
  // 티켓·처리
  '처리 전': 'amber',
  '처리 중': 'sky',
  '처리 완료': 'green',
  대기: 'amber',
  진행: 'sky',
  완료: 'green',
  // 문서·직원
  공개: 'green',
  '검토 중': 'amber',
  임시저장: 'soft',
  비공개: 'soft',
  활성: 'green',
  휴직: 'soft',
  정지: 'gray',
}

export function StatusBadge({ status, tone }: { status: string; tone?: BadgeTone }) {
  const t = tone ?? STATUS_TONE[status] ?? 'gray'
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[t]}`}>
      {status}
    </span>
  )
}

/** 옅은 태그(진료과·유형 등, 채도 낮은 안쪽 칩) */
export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground ${className}`}>
      {children}
    </span>
  )
}

/** 상단 필터/검색 툴바 (한 줄, 좌: 필터 · 우: 액션) */
export function Toolbar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
    </div>
  )
}

/** 세그먼트 탭 (상태별 필터 pill) */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  count,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (k: T) => void
  count?: (k: T) => number | undefined
}) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
      {options.map((o) => {
        const n = count?.(o.key)
        const active = o.key === value
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.label}
            {n != null && <span className="ml-1.5 tabular-nums text-muted-foreground">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** 빈 상태 — 막다른 길을 만들지 않는다(할 일 안내) */
export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{icon}</div>}
      <div className="font-medium">{title}</div>
      {hint && <div className="text-sm text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** 통계 숫자 타일 */
export function StatTile({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string
  value: ReactNode
  tone?: 'neutral' | 'teal' | 'amber' | 'sky' | 'violet' | 'green'
  hint?: string
}) {
  const ring: Record<string, string> = {
    neutral: 'text-foreground',
    teal: 'text-primary',
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    violet: 'text-violet-600',
    green: 'text-emerald-600',
  }
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${ring[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** 주 버튼 / 보조 버튼 클래스 (일관 사용) */
export const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50'
export const btnGhost =
  'inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted'
export const btnLink = 'text-xs font-medium text-primary hover:underline'

/** 검색 입력(아이콘 포함) */
export function SearchInput({
  value,
  onChange,
  placeholder,
  icon,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  icon?: ReactNode
}) {
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-9 w-full rounded-lg border border-input bg-card ${
          icon ? 'pl-9' : 'pl-3'
        } pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40`}
      />
    </div>
  )
}
