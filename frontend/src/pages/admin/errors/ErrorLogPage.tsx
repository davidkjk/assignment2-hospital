import { useEffect, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../../components/EmptyState'
import { InlineError } from '../../../components/InlineError'
import { ApiError } from '../../../api/httpClient'
import { getErrorLogs } from '../../../api/errorLogs'
import { formatAccessedAt } from '../logRows'

// [ERRADM-*] 시스템 오류 기록 /admin/errors — 관리자 전용 읽기 화면(결정 #19·#20).
//
// ⭐ 셸·권한은 RequireRole/AppShell이 지킨다(ERRADM-SHELL-*) — 비관리자는 이 그릇에 닿지 못한다.
//    이 컴포넌트는 admin이 들어왔다고 보고 본문(제목·읽기전용 고지·기간 필터·표·상태)만 담당한다.
// ⛔ 읽기 전용이라 행에 편집·삭제·재실행을 두지 않고, 눌러도 원문을 펼치지 않는다(ERRADM-HEAD-02·LIST-07).
// ⛔ notification_log를 읽지 않는다(ERRADM-NOTI-01) — 수신자별 실패·재시도는 /messages 소관.
// ⚠️ 오류 내용 칸은 서버가 준 안전 요약(summary)만 그린다 — 기술 상세·비밀키·환자 원문은 계약에 없다(결정 #20).

const COLUMNS = ['발생 시각', '기능', '오류 내용'] as const

export function ErrorLogPage() {
  const [params, setParams] = useSearchParams()
  const urlFrom = params.get('from') ?? ''
  const urlTo = params.get('to') ?? ''

  // 기간 — 초안(입력)과 적용(조회) 분리. 적용값은 URL에서 온다(새로고침·뒤로가기 복원, NAV-SHELL-09).
  const [draft, setDraft] = useState({ from: urlFrom, to: urlTo })
  const [rangeError, setRangeError] = useState<string>()

  // URL이 바뀌면(뒤로/새로고침) 초안도 그 기간으로 맞춘다.
  useEffect(() => {
    setDraft({ from: urlFrom, to: urlTo })
  }, [urlFrom, urlTo])

  const query = useQuery({
    queryKey: ['error-logs', urlFrom, urlTo],
    queryFn: () => getErrorLogs({ from: urlFrom || null, to: urlTo || null }),
  })

  function applyRange() {
    // [ERRADM-FILTER-05] 시작일>종료일이면 서버에 안 보내고 종료일 아래 인라인 오류.
    if (draft.from && draft.to && draft.from > draft.to) {
      setRangeError('종료일은 시작일 이후로 선택해주세요')
      return
    }
    setRangeError(undefined)
    // [ERRADM-FILTER-03] URL엔 from/to만 — 오류 문장·스택·환자정보는 넣지 않는다.
    const next: Record<string, string> = {}
    if (draft.from) next.from = draft.from
    if (draft.to) next.to = draft.to
    setParams(next)
  }

  const isOffline = query.error instanceof ApiError && query.error.status === 0
  const rows = query.data ?? []
  const showTable = !query.isError && !query.isPending && rows.length > 0
  const isZero = !query.isError && !query.isPending && rows.length === 0

  return (
    <section aria-label="시스템 오류 기록" style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>시스템 오류 기록</h1>
        <p style={styles.lede}>오류가 발생한 시간과 기능을 확인합니다</p>
      </header>

      {/* [ERRADM-HEAD-02] 읽기 전용 고지 — 행마다 재실행·삭제·해결 처리 버튼을 두지 않는다. */}
      <p style={styles.readonly} role="note">
        이 기록은 수정하거나 삭제할 수 없습니다
      </p>

      {/* [ERRADM-FILTER-02·04·05] 기간 필터 — [조회] 눌러야 재조회한다. */}
      <div style={styles.filterBar}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>시작일</span>
          <input
            type="date"
            aria-label="시작일"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            style={styles.input}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>종료일</span>
          <input
            type="date"
            aria-label="종료일"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            style={styles.input}
          />
          {rangeError && <InlineError message={rangeError} />}
        </label>
        <button
          type="button"
          onClick={applyRange}
          disabled={query.isFetching}
          style={styles.applyBtn}
        >
          {query.isFetching ? '불러오는 중…' : '조회'}
        </button>
      </div>

      {/* [ERRADM-FILTER-01][ERRADM-LIST-06] 조회 범위 — 최근 200건임을 밝힌다(200건 밖 부재는 주장 안 함). */}
      {!isOffline && !query.isError && (
        <p style={styles.scope}>최근 200건</p>
      )}

      {isOffline ? (
        <EmptyState kind="offline" screen="오류 기록" onRetry={() => query.refetch()} />
      ) : query.isError ? (
        // [ERRADM-STATE-02] 같은 화면 오류 + [다시 시도]. 기간 필터는 그대로 둔다.
        <EmptyState kind="error" onRetry={() => query.refetch()} />
      ) : isZero ? (
        // [ERRADM-STATE-04] 결과 0건은 실패가 아니므로 [다시 시도]를 붙이지 않는다.
        <EmptyState
          kind="zero"
          message="해당 기간에 오류 기록이 없습니다"
          action={<p style={styles.zeroHint}>기간을 넓혀 다시 조회해보세요</p>}
        />
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" style={styles.th}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.isPending ? (
              // [ERRADM-STATE-01] 열 머리 유지 + skeleton 4줄. 이전 필터 행을 안 섞는다.
              <tr>
                <td colSpan={COLUMNS.length} style={styles.loadingCell}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} data-testid="skeleton-row" style={styles.skeleton} />
                  ))}
                  <p style={styles.loadingText}>오류 기록을 불러오는 중입니다</p>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} data-testid="error-row" style={styles.tr}>
                  <td style={styles.td}>{formatAccessedAt(r.occurred_at)}</td>
                  <td style={styles.td}>{r.feature}</td>
                  <td style={styles.td}>{r.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {showTable && null}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1360, margin: '0 auto' },
  header: { display: 'flex', flexDirection: 'column', gap: 2 },
  h1: { margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--color-ink)' },
  lede: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  readonly: {
    margin: 0,
    padding: '8px 12px',
    borderRadius: 8,
    background: 'var(--color-done-bg)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
  },
  filterBar: { display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--color-ink-muted)' },
  input: {
    height: 34,
    padding: '0 10px',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
  },
  applyBtn: {
    height: 34,
    padding: '0 20px',
    border: '1px solid var(--color-primary)',
    borderRadius: 8,
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary, #fff)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  scope: { margin: 0, fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-divider)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid var(--color-divider)' },
  td: { padding: '10px 12px', color: 'var(--color-ink)', verticalAlign: 'top' },
  loadingCell: { padding: '12px' },
  skeleton: {
    height: 18,
    margin: '6px 0',
    borderRadius: 6,
    background: 'var(--color-bg)',
  },
  loadingText: { margin: '8px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  zeroHint: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
}
