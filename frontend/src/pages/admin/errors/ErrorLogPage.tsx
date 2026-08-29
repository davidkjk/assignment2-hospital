import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../../components/EmptyState'
import { InlineError } from '../../../components/InlineError'
import { AlertCircle, AlertTriangle, Bell, Send, ShieldCheck } from '../../../components/icons'
import { ApiError } from '../../../api/httpClient'
import { getErrorLogs, type ErrorLogRow } from '../../../api/errorLogs'
import { formatAccessedAt } from '../logRows'

// [ERRADM-*] 시스템 오류 기록 /admin/errors — 관리자 전용 읽기 화면(결정 #19·#20).
//
// ⭐ 셸·권한은 RequireRole/AppShell이 지킨다(ERRADM-SHELL-*) — 비관리자는 이 그릇에 닿지 못한다.
//    이 컴포넌트는 admin이 들어왔다고 보고 본문(제목·읽기전용 고지·기간 필터·표·상태)만 담당한다.
// ⛔ 읽기 전용이라 행에 편집·삭제·재실행을 두지 않고, 눌러도 원문을 펼치지 않는다(ERRADM-HEAD-02·LIST-07).
// ⛔ notification_log를 읽지 않는다(ERRADM-NOTI-01) — 수신자별 실패·재시도는 /messages 소관.
// ⚠️ 오류 내용 칸은 서버가 준 안전 요약(summary)만 그린다 — 기술 상세·비밀키·환자 원문은 계약에 없다(결정 #20).
//
// 데모 정렬(S16, 2026-08-29): ①읽기전용 고지에 방패 아이콘 + 안전요약/redaction 설명 부제(ERRADM-LIST-04·결정#20)
//   ②이중기록 경계 안내(ERRADM-NOTI-01·결정#19) — 수신자별 발송 실패의 갈 길을 「안내 보내기」로 연결(막다른 길 방지).
//   ③필터·표를 콘솔 카드로.
// A2 서비스 전체 장애 배지(ERRADM-NOTI-02, 2026-08-28): is_service_outage 계약이 생겨(00070) 「서비스 전체 장애」
//   행을 amber 삼각형 아이콘 + 배지로 한 줄 구분한다(결정19 = 이 표엔 서비스 전체 장애만 한 줄). 개별 발송 실패는
//   여기 없다(ERRADM-NOTI-01). ⛔ 데모의 4칸 상태 모음판은 규칙 근거가 없어 계속 생략(S16 판정 유지).
// ⭐ 페이지: 첫 200건 + [더 오래된 기록 보기] 커서 이어보기(ERRADM-LIST-06). 접근 기록(ALOG-FILTER-06)과
//   같은 공용 부품을 서버가 쓰고, 화면은 접근 기록 화면과 같은 누적 방식(첫 페이지 + append + tailCursor)을 쓴다.

const COLUMNS = ['발생 시각', '기능', '오류 내용'] as const

export function ErrorLogPage() {
  const navigate = useNavigate()
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

  // 이어보기 누적 — 접근 기록 화면과 같은 방식(첫 페이지 + append + tailCursor).
  const [appended, setAppended] = useState<ErrorLogRow[]>([])
  const [tailCursor, setTailCursor] = useState<string | null | undefined>(undefined)
  const [loadingMore, setLoadingMore] = useState(false)

  const filter = { from: urlFrom || null, to: urlTo || null }
  const query = useQuery({
    queryKey: ['error-logs', urlFrom, urlTo],
    queryFn: () => getErrorLogs(filter),
  })

  // 필터(기간)가 바뀌면 누적을 비운다 — 이전 기간의 행을 새 결과와 섞지 않는다(ERRADM-STATE-01).
  useEffect(() => {
    setAppended([])
    setTailCursor(undefined)
  }, [urlFrom, urlTo])

  const firstPage = query.data
  const rows = useMemo(
    () => (firstPage ? [...firstPage.rows, ...appended] : []),
    [firstPage, appended],
  )
  const effectiveNext = tailCursor === undefined ? firstPage?.next_cursor ?? null : tailCursor

  async function loadMore() {
    if (!effectiveNext || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await getErrorLogs({ ...filter, cursor: effectiveNext })
      setAppended((prev) => [...prev, ...page.rows])
      setTailCursor(page.next_cursor)
    } finally {
      setLoadingMore(false)
    }
  }

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
  const isZero = !query.isError && !query.isPending && rows.length === 0

  return (
    <section aria-label="시스템 오류 기록" style={styles.page}>
      {/* 화면 제목은 셸 헤더가 그린다(`STAFF-SHELL-02` 개정, `ERRADM-HEAD-01` 서술형 제목은 헤더로 이관) — 본문엔 설명만. */}
      <header style={styles.header}>
        <p style={styles.lede}>오류가 발생한 시간과 기능을 확인합니다</p>
      </header>

      {/* [ERRADM-HEAD-02] 읽기 전용 고지 + [결정#20·ERRADM-LIST-04] 안전 요약/redaction 설명. */}
      <div style={styles.readonly} role="note">
        <ShieldCheck width={20} height={20} style={styles.readonlyIcon} aria-hidden="true" />
        <div style={styles.readonlyText}>
          <div style={styles.readonlyTitle}>이 기록은 수정하거나 삭제할 수 없습니다</div>
          <div style={styles.readonlyBody}>
            오류 내용은 사람이 읽는 안전한 요약입니다. 비밀 키·환자 정보를 지운 기술 상세는 개발자가 뒷단에서 확인합니다.
          </div>
        </div>
      </div>

      {/* [ERRADM-NOTI-01·결정#19] 이중기록 경계 — 수신자별 발송 실패는 여기 없고 발송 이력에 있다. 갈 길을 함께 준다(막다른 길 방지). */}
      <div style={styles.boundary} role="note">
        <Bell width={16} height={16} style={styles.boundaryIcon} aria-hidden="true" />
        <span>
          환자 한 명·한 채널의 <strong style={styles.strong}>발송 실패</strong>는 이 기록이 아니라{' '}
          <button type="button" style={styles.link} onClick={() => navigate('/messages')}>
            안내 보내기
          </button>
          의 발송 이력에 남습니다. 여기에는 <strong style={styles.strong}>서비스 전체 장애</strong>만 한 줄로 기록됩니다.
        </span>
      </div>

      {/* [ERRADM-FILTER-02·04·05] 기간 필터 카드 — [조회] 눌러야 재조회한다. */}
      <div style={styles.filterCard}>
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
          {/* [ERRADM-FILTER-01·LIST-02·LIST-05·LIST-06] 조회 계약 — 최근 200건·병원 시간대·최신순(200건 밖 부재는 주장 안 함). */}
          <span style={styles.scope}>최근 200건 · 병원 시간대 · 최신순</span>
        </div>
      </div>

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
        <>
        <div style={styles.tableCard}>
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
                  {/* [ERRADM-NOTI-02] 서비스 전체 장애만 amber 삼각형+배지로 한 줄 구분. 개별 실패는 여기 없다. */}
                  <td style={styles.td}>
                    <div style={styles.summaryRow}>
                      {r.is_service_outage ? (
                        <AlertTriangle width={16} height={16} style={styles.outageIcon} aria-hidden="true" />
                      ) : (
                        <AlertCircle width={16} height={16} style={styles.normalIcon} aria-hidden="true" />
                      )}
                      <div style={styles.summaryText}>
                        <span>{r.summary}</span>
                        {r.is_service_outage && (
                          <span style={styles.outageBadge}>
                            <Send width={12} height={12} aria-hidden="true" /> 서비스 전체 장애
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        {/* [ERRADM-LIST-06] 200건 이후 커서 이어보기. 끝(next_cursor=null)이면 버튼 없음 — 200건 밖 부재를 주장하지 않는다. */}
        {effectiveNext && (
          <div style={styles.moreWrap}>
            <button type="button" onClick={loadMore} disabled={loadingMore} style={styles.moreBtn}>
              {loadingMore ? '불러오는 중…' : '더 오래된 기록 보기'}
            </button>
          </div>
        )}
        </>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1360, margin: '0 auto' },
  header: { display: 'flex', flexDirection: 'column', gap: 2 },
  h1: { margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--color-ink)' },
  lede: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  readonly: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    margin: 0,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-primary-wash)',
  },
  readonlyIcon: { color: 'var(--color-primary)', flexShrink: 0, marginTop: 1 },
  readonlyText: { display: 'flex', flexDirection: 'column', gap: 2 },
  readonlyTitle: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink)' },
  readonlyBody: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  boundary: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    margin: 0,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-done-bg)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)',
    lineHeight: 1.5,
  },
  boundaryIcon: { color: 'var(--color-ink-muted)', flexShrink: 0, marginTop: 2 },
  strong: { fontWeight: 600, color: 'var(--color-ink)' },
  link: {
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  filterCard: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
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
  scope: { marginLeft: 'auto', paddingBottom: 4, fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--color-ink-muted)' },
  tableCard: {
    borderRadius: 10,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    background: 'var(--color-done-bg)',
    borderBottom: '1px solid var(--color-divider)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid var(--color-divider)' },
  td: { padding: '12px 14px', color: 'var(--color-ink)', verticalAlign: 'top' },
  summaryRow: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  outageIcon: { color: 'var(--color-warn)', flexShrink: 0, marginTop: 2 },
  normalIcon: { color: 'var(--color-ink-muted)', flexShrink: 0, marginTop: 2 },
  summaryText: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  outageBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '1px 8px',
    borderRadius: 6,
    background: 'color-mix(in srgb, var(--color-warn) 12%, var(--color-surface))',
    color: 'var(--color-warn)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  loadingCell: { padding: '12px' },
  skeleton: {
    height: 18,
    margin: '6px 0',
    borderRadius: 6,
    background: 'var(--color-bg)',
  },
  loadingText: { margin: '8px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  zeroHint: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  moreWrap: { display: 'flex', justifyContent: 'center' },
  moreBtn: {
    height: 36,
    padding: '0 20px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
