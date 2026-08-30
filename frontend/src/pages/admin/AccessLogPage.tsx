import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ApiError } from '../../api/httpClient'
import { getAccessLogs, type AccessLogPatientRef, type AccessLogRow } from '../../api/accessLogs'
import { LogFilterBar } from './LogFilterBar'
import { LogTable } from './LogTable'
import { TextButton, PageNotice } from '@/components/staff-ui'
import { ShieldCheck } from '../../components/icons'

// [ALOG-*] 환자정보 열람 기록 /admin/access-logs — 관리자 전용 읽기 화면.
//
// ⭐ 셸·권한은 RequireRole/AppShell이 지킨다(ALOG-SHELL-*) — 비관리자는 이 그릇에 닿지 못한다.
//    이 컴포넌트는 admin이 들어왔다고 보고 본문(필터·표·이어보기)만 담당한다.
// ⭐ 이 화면을 여는 것 자체는 감사 행을 만들지 않는다(결정3) — 읽기 전용이라 흔적을 남기지 않는다.
// ⛔ 되돌릴 수 없는 감사 기록이라 행에 편집·삭제·되돌리기를 두지 않고, 그 사실을 표 위에 적는다.

/** 'YYYY-MM-DD' → 병원 시간대 ISO8601 그날 00:00. 시작일(포함 경계)에 쓴다. */
function toIso(date: string): string {
  return `${date}T00:00:00+09:00`
}

/** 종료일 → 서버에 넘길 제외 경계(`< to`).
 *  사람은 종료일을 「그날까지 포함」으로 읽고 프리셋도 종료일=오늘로 채우므로(PERIOD-BOX-02),
 *  고른 날의 **다음날 00:00**을 보내 그날 23:59까지 포함시킨다 — 오류로그(ERRADM-FILTER-02)·
 *  통계(between)와 같은 「그날 끝까지」 규약으로 통일(ALOG-FILTER-07 개정, 2026-08-30).
 *  ⚠️ 날짜 더하기는 UTC 자리에서 — 로컬 Date로 옮기면 서머타임 지역에서 하루가 샌다. */
function toIsoEnd(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  const s = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
  return `${s}T00:00:00+09:00`
}

/** [ALOG-FILTER-07] 조회 기간을 사람 말로. 딱 한 달(1일~말일)이면 「N년 M월」, 아니면 시작~끝(둘 다 포함). */
function rangeLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const lastDay = new Date(Date.UTC(fy, fm, 0)).getUTCDate() // fm월의 말일(Date.UTC 다음달 0일)
  if (fd === 1 && fy === ty && fm === tm && td === lastDay) return `${fy}년 ${fm}월 기록을 보고 있습니다`
  return `${from} ~ ${to} 기록을 보고 있습니다`
}

export function AccessLogPage() {
  const [params, setParams] = useSearchParams()
  const patientId = params.get('patient_id')

  // 기간 — 초안(입력)과 적용(조회) 분리. 비면 최신 200건이다.
  const [draft, setDraft] = useState({ from: '', to: '' })
  const [applied, setApplied] = useState({ from: '', to: '' })
  const [rangeError, setRangeError] = useState<string>()

  // 페이지네이션 — 첫 페이지는 쿼리가, 이후는 로컬 누적이 맡는다(같은 필터 유지).
  const [appended, setAppended] = useState<AccessLogRow[]>([])
  const [tailCursor, setTailCursor] = useState<string | null | undefined>(undefined)
  const [loadingMore, setLoadingMore] = useState(false)

  // 칩에 즉시 보일 마스킹 식별자(선택 순간 확보). 새로고침 땐 행에서 파생한다.
  const [pickedRef, setPickedRef] = useState<AccessLogPatientRef | null>(null)
  const [overallTotal, setOverallTotal] = useState<number | null>(null)

  const filter = {
    patientId,
    from: applied.from ? toIso(applied.from) : null,
    to: applied.to ? toIsoEnd(applied.to) : null,
  }

  const query = useQuery({
    queryKey: ['access-logs', patientId ?? '', filter.from ?? '', filter.to ?? ''],
    queryFn: () => getAccessLogs(filter),
  })

  // 필터가 바뀌면 누적을 비운다 — 이전 환자·기간의 행을 섞지 않는다(ALOG-STATE-01).
  useEffect(() => {
    setAppended([])
    setTailCursor(undefined)
  }, [patientId, filter.from, filter.to])

  const firstPage = query.data
  useEffect(() => {
    if (firstPage && !patientId) setOverallTotal(firstPage.total_hint)
  }, [firstPage, patientId])

  const rows = useMemo(
    () => (firstPage ? [...firstPage.rows, ...appended] : []),
    [firstPage, appended],
  )
  const effectiveNext = tailCursor === undefined ? firstPage?.next_cursor ?? null : tailCursor

  const chipPatient: AccessLogPatientRef | null = patientId
    ? pickedRef?.patient_id === patientId
      ? pickedRef
      : rows.find((r) => r.patient?.patient_id === patientId)?.patient ?? { patient_id: patientId }
    : null

  function applyPatient(ref: AccessLogPatientRef) {
    setPickedRef(ref)
    setParams({ patient_id: ref.patient_id })
  }

  function clearFilter() {
    // [ALOG-FILTER-05] 같은 화면에서 전체 최신 200건으로. 환자·기간 필터를 함께 지운다.
    setPickedRef(null)
    setParams({})
    setDraft({ from: '', to: '' })
    setApplied({ from: '', to: '' })
    setRangeError(undefined)
  }

  function applyRange() {
    if (!draft.from || !draft.to) {
      setRangeError('시작일과 종료일을 모두 선택해주세요')
      return
    }
    if (draft.from > draft.to) {
      setRangeError('종료일은 시작일 이후로 선택해주세요')
      return
    }
    setRangeError(undefined)
    setApplied({ from: draft.from, to: draft.to })
  }

  async function loadMore() {
    if (!effectiveNext || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await getAccessLogs({ ...filter, cursor: effectiveNext })
      setAppended((prev) => [...prev, ...page.rows])
      setTailCursor(page.next_cursor)
    } finally {
      setLoadingMore(false)
    }
  }

  const isOffline = query.error instanceof ApiError && query.error.status === 0
  const showTable = !query.isError && !query.isPending && rows.length > 0
  const isEmpty = !query.isError && !query.isPending && rows.length === 0

  return (
    <section aria-label="환자정보 열람 기록" style={styles.page}>
      {/* [ALOG-HEAD-02] 읽기 전용 고지 — 감사 기록이 고쳐질 수 있으면 감사가 아니다. 공용 PageNotice로 통일(2026-08-30).
          설명은 무엇이 어떻게 적히는지: 검색 1줄(ALOG-AUDIT-01)·번호열람 환자별 별도(ALOG-AUDIT-02)·200건(ALOG-LIST-09). */}
      <PageNotice icon={<ShieldCheck width={20} height={20} />} title="이 기록은 삭제하거나 수정할 수 없습니다">
        검색은 실행 1회당 한 줄, 번호 보기는 마스킹을 해제한 환자마다 별도로 기록됩니다. 최신 첫 페이지 최대 200건까지 보여 줍니다.
      </PageNotice>

      <LogFilterBar
        selectedPatient={chipPatient}
        onSelectPatient={applyPatient}
        onClearPatient={clearFilter}
        from={draft.from}
        to={draft.to}
        onRangeChange={setDraft}
        onApplyRange={applyRange}
        rangeError={rangeError}
        overallTotal={overallTotal}
        filteredTotal={patientId ? firstPage?.total_hint ?? null : null}
      />

      {/* 조회 범위 안내 — 필터 없으면 「최근 200건」, 기간이면 「N년 M월」(ALOG-LIST-09·FILTER-07). */}
      {!isOffline && !query.isError && !chipPatient && (
        <p style={styles.scope}>
          {applied.from && applied.to ? rangeLabel(applied.from, applied.to) : '최근 200건'}
        </p>
      )}

      {isOffline ? (
        <EmptyState kind="offline" screen="열람 기록" onRetry={() => query.refetch()} />
      ) : query.isError ? (
        <EmptyState
          kind="error"
          onRetry={() => query.refetch()}
          action={
            <Link to="/today" style={styles.todayLink}>
              오늘의 현황으로 가기
            </Link>
          }
        />
      ) : isEmpty ? (
        <EmptyState
          kind="zero"
          message={
            chipPatient ? '이 환자의 접근 기록이 없습니다' : '아직 환자정보 열람 기록이 없습니다'
          }
          action={
            chipPatient ? (
              <TextButton onClick={clearFilter}>
                다른 환자를 선택하거나 전체 기록으로 돌아가세요
              </TextButton>
            ) : undefined
          }
        />
      ) : (
        <div style={styles.tableWrap}>
          <LogTable
            rows={rows}
            loading={query.isPending}
            onSelectPatient={(id) => {
              const ref = rows.find((r) => r.patient?.patient_id === id)?.patient
              applyPatient(ref ?? { patient_id: id })
            }}
            nextCursor={effectiveNext}
          />
          {effectiveNext && (
            <div style={styles.moreWrap}>
              <button type="button" onClick={loadMore} disabled={loadingMore} style={styles.moreBtn}>
                {loadingMore ? '불러오는 중…' : '더 보기'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', maxWidth: 1360, margin: '0 auto' },
  header: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-0-5)' },
  h1: { margin: 0, fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  lede: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  readonly: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--sp-3)',
    margin: 0,
    padding: 'var(--sp-3) var(--sp-4)',
    borderRadius: 10,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-primary-wash)',
  },
  readonlyIcon: { color: 'var(--color-primary)', flexShrink: 0, marginTop: 1 },
  readonlyText: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-0-5)' },
  readonlyTitle: {
    margin: 0,
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
  },
  readonlyDesc: {
    margin: 0,
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-caption)',
    lineHeight: 1.5,
  },
  scope: { margin: 0, fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  tableWrap: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  moreWrap: { display: 'flex', justifyContent: 'center' },
  moreBtn: {
    height: 34,
    padding: '0 var(--sp-5)',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  todayLink: { color: 'var(--color-primary)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], textDecoration: 'none' },
}
