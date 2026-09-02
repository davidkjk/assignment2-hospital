import { LockKeyhole } from '../../../components/icons'
import { EmptyState, btnGhost } from '../../../components/staff-ui'
import type { KbDoc, KbQuery, KbStatus } from '../../../api/kbAdmin'
import { KB_CATEGORIES, STATUS_LABELS } from './constants'
import type { Phase } from './useKbList'

// 안내자료 목록(KBADM-LIST-*) — 분류·상태 필터 + 목록 카드. 승인/제한 구분, 0건↔로딩↔오류를 각각 구분한다.
// 표현형 — 상태 기계(useKbList)가 주는 phase·docs·filters만 읽는다. 행 선택은 편집 상세를 별도 전체 화면으로 연다.

const STATUSES: KbStatus[] = ['draft', 'approved', 'archived']

export interface KbListProps {
  docs: KbDoc[]
  phase: Phase
  filters: KbQuery
  onFilter: (patch: Partial<KbQuery>) => void
  onOpen: (target: { id: string; fullscreen: true; restore: KbQuery }) => void
  onRetry?: () => void
  statusContract?: 'unknown'
  selectedId?: string | null
}

export function KbList({ docs, phase, filters, onFilter, onOpen, onRetry, statusContract = 'unknown', selectedId = null }: KbListProps) {
  // 현재 필터 값이 표준 목록에 없어도 활성 필터를 잃지 않도록 선택지에 얹는다(서버가 준 분류 보존).
  const categoryOptions = filters.category && !KB_CATEGORIES.includes(filters.category as (typeof KB_CATEGORIES)[number])
    ? [filters.category, ...KB_CATEGORIES]
    : [...KB_CATEGORIES]

  return (
    <div
      data-testid="kb-list"
      data-status-contract={statusContract}
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]"
    >
      {/* 필터 바 — 로딩·오류·0건에도 항상 유지해 직전 조건을 잃지 않는다(LIST-07) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          분류
          <select
            aria-label="분류"
            value={filters.category ?? ''}
            onChange={(e) => onFilter({ category: e.target.value || undefined })}
            className={selectCls}
          >
            <option value="">전체</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          상태
          <select
            aria-label="상태"
            value={filters.status ?? ''}
            onChange={(e) => onFilter({ status: (e.target.value || undefined) as KbStatus | undefined })}
            className={selectCls}
          >
            <option value="">전체</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {phase === 'loading' && (
          <div aria-label="목록 로딩" className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
            안내자료를 불러오는 중…
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-sm font-medium">안내자료를 불러오지 못했습니다</p>
            <button className={btnGhost} onClick={() => onRetry?.()}>
              다시 시도
            </button>
          </div>
        )}

        {phase === 'empty' && (
          <div className="flex flex-col items-center gap-3">
            <EmptyState title="조건에 맞는 안내자료가 없습니다" hint="필터를 바꾸거나 해제해 보세요." />
            <button className={btnGhost} onClick={() => onFilter({ category: undefined, status: undefined })}>
              필터 해제
            </button>
          </div>
        )}

        {phase === 'ready' && (
          <ul className="space-y-1.5">
            {docs.map((k) => (
              <li key={k.id} data-doc={k.id}>
                <button
                  onClick={() => onOpen({ id: k.id, fullscreen: true, restore: filters })}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left ${
                    k.id === selectedId ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:bg-muted'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{k.title || '(제목 없음)'}</span>
                    {k.status === 'approved' && (
                      <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">승인됨</span>
                    )}
                    {k.status === 'draft' && (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">초안</span>
                    )}
                    {k.status === 'archived' && (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">보관</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{k.category}</span>
                    {k.hasPendingEdit && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">수정본 대기</span>
                    )}
                    {k.isRestricted && (
                      <span className="inline-flex items-center gap-0.5 text-rose-600">
                        <LockKeyhole className="h-3 w-3" /> 답하면 안 되는 내용
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const selectCls = 'rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'
