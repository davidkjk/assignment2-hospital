import { useEffect, useRef, type CSSProperties } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { formatHospitalDateTime } from '../../lib/clock'
import { getStatsDetail, type DrilldownRow } from '../../api/stats'

// [STAT-DRILL-01~04][결정21·24] 셀·지표를 눌러 여는 마스킹 명단.
//
// ⭐ 명단은 서버가 마스킹해 보낸 값만 보인다(홍*동·010-****-5678·1990-**-**) — 원본은 응답에
//    아예 없다(MASK-SRV-01). 훑어보기용이고, 전체가 필요하면 행을 눌러 그 환자 상세로 간다
//    (내부 patient_id, 마스킹 값 재검색 아님) — 거기서 PTDET-HEAD-04 열람 기록이 남는다.
// ⭐ 이 명단 조회 자체가 stats_drilldown 감사를 남긴다(결정22) — 서버가 /stats/detail 안에서
//    남기므로 여기서 따로 감사 요청을 보내지 않는다(이중 기록 방지).

interface DrilldownModalProps {
  target: { metric: string; label: string; dept?: string; dim?: 'department' | 'doctor' }
  period: { from: string; to: string }
  onClose: () => void
}

export function DrilldownModal({ target, period, onClose }: DrilldownModalProps) {
  const navigate = useNavigate()
  const closeRef = useRef<HTMLButtonElement>(null)

  // [L15] 서버는 커서 페이징(20건/쪽·next_cursor)을 이미 준다 — 「더보기」로 다음 쪽을 이어 붙인다.
  const query = useInfiniteQuery({
    queryKey: ['stats-detail', target.metric, target.dim ?? null, target.dept ?? null, period.from, period.to],
    queryFn: ({ pageParam }) =>
      getStatsDetail(target.metric, period.from, period.to, {
        dept: target.dept,
        dim: target.dim,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const page = query.data
  const rows = page?.pages.flatMap((p) => p.rows) ?? []
  const total = page?.pages[0]?.total
  // 전체 건수를 알고 아직 다 못 불러왔으면 「N건 중 M건」으로, 다 봤으면 「M건」으로 밝힌다.
  const partial = total != null && total > rows.length

  return (
    <div style={styles.scrim} data-testid="drilldown-scrim">
      <div role="dialog" aria-modal="true" aria-label={`${target.label} 상세 명단`} style={styles.dialog}>
        <header style={styles.head}>
          <div>
            <h2 style={styles.title}>{target.label} 상세 명단</h2>
            <p style={styles.sub} data-testid="drilldown-scope">
              {period.from} ~ {period.to}
              {partial ? ` · ${total}건 중 ${rows.length}건` : rows.length > 0 ? ` · ${rows.length}건` : ''}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" style={styles.close}>
            ✕
          </button>
        </header>

        <div style={styles.notice}>
          훑어보기용 마스킹 명단입니다. 전체 정보가 필요하면 행을 눌러 환자 상세로 이동하세요 —
          그 열람은 접근 기록에 남습니다.
        </div>

        <div style={styles.body}>
          {query.isPending && <p role="status" style={styles.status}>명단을 불러오는 중입니다</p>}
          {query.isError && <EmptyState kind="error" onRetry={() => query.refetch()} />}
          {page && rows.length === 0 && (
            <EmptyState kind="zero" message="이 기간·지표에 해당하는 명단이 없습니다" />
          )}
          {page && rows.length > 0 && (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>환자</th>
                  <th style={styles.th}>전화 · 생년월일</th>
                  <th style={styles.th}>시각</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.id ?? r.patient_id} row={r} onOpen={() => navigate(`/patients/${r.patient_id}`)} />
                ))}
              </tbody>
            </table>
          )}
          {query.hasNextPage && (
            <div style={styles.moreWrap}>
              <button
                type="button"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                style={styles.moreBtn}
              >
                {query.isFetchingNextPage ? '불러오는 중…' : '더보기'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ row, onOpen }: { row: DrilldownRow; onOpen: () => void }) {
  // [G4/L16] occurred_at은 절대 순간 ISO(…Z) — 원본을 그대로 보이면 UTC·마이크로초가 노출된다. 병원 시각으로 포맷.
  const when = row.occurred_at
    ? formatHospitalDateTime(row.occurred_at)
    : row.wait_minutes != null ? `대기 ${row.wait_minutes}분` : ''
  // [STAT-DRILL-04] 안내문("행을 눌러")과 맞게 **행 어디를 눌러도** 환자 상세로 간다(2026-08-31 손검수 ②).
  //   이름 버튼은 키보드 초점을 위해 남기되(그리고 마스킹 이름의 링크색으로 눌러도 됨을 알리고), 클릭이
  //   행과 겹쳐 두 번 이동하지 않게 버블링을 멈춘다.
  return (
    <tr style={styles.trClickable} onClick={onOpen}>
      <td style={styles.td}>
        <button
          type="button"
          aria-label={`${row.masked_name ?? '환자'} 환자 상세 보기`}
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          style={styles.rowBtn}
        >
          {row.masked_name ?? '—'}
        </button>
      </td>
      <td style={styles.tdMuted}>
        {row.masked_phone ?? '—'} · {row.masked_birth_date ?? '—'}
      </td>
      <td style={styles.tdMuted}>{when}</td>
    </tr>
  )
}

const styles: Record<string, CSSProperties> = {
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--sp-4)',
    background: 'rgba(16,36,58,.30)',
  },
  dialog: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: 640,
    maxHeight: '80vh',
    overflow: 'hidden',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 'var(--sp-3) var(--sp-4)',
    borderBottom: '1px solid var(--color-divider)',
  },
  title: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  sub: { margin: 'var(--sp-0-5) 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  close: {
    border: 'none',
    background: 'none',
    fontSize: 16,
    color: 'var(--color-ink-muted)',
    cursor: 'pointer',
    lineHeight: 1,
  },
  notice: {
    padding: 'var(--sp-2) var(--sp-4)',
    background: 'var(--color-primary-wash)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-caption)',
  },
  body: { minHeight: 0, flex: 1, overflowY: 'auto' },
  status: { padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--color-ink-muted)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' },
  th: {
    position: 'sticky',
    top: 0,
    padding: 'var(--sp-2) var(--sp-4)',
    textAlign: 'left',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    color: 'var(--color-ink-muted)',
    background: 'var(--color-bg)',
    borderBottom: '1px solid var(--color-divider)',
  },
  trClickable: { borderBottom: '1px solid var(--color-divider)', cursor: 'pointer' },
  td: { padding: 'var(--sp-2) var(--sp-4)' },
  tdMuted: { padding: 'var(--sp-2) var(--sp-4)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  rowBtn: {
    border: 'none',
    background: 'none',
    padding: 0,
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  moreWrap: { padding: 'var(--sp-3) var(--sp-4)', textAlign: 'center', borderTop: '1px solid var(--color-divider)' },
  moreBtn: {
    padding: 'var(--sp-2) var(--sp-5)',
    border: '1px solid var(--color-divider)',
    borderRadius: 7,
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
}
