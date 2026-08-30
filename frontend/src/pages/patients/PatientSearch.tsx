import { useCallback, type CSSProperties, type UIEvent } from 'react'
import iconSpriteUrl from '../../shell/icons.svg?url'
import { SelectableList } from '../../components/SelectableList'
import { useSearchPatients } from './useSearchPatients'
import { SearchResultRow, SearchRowActions } from './SearchResultRow'
import { UsageHints, ZeroResult } from './SearchEmptyStates'
import type { SearchPatientRow } from '../../api/patients'

// ⭐ 전역 환자 검색의 공유 부품(SEARCH-BOX-03). 두 곳에서 같은 부품·같은 서버 창구를 쓴다:
//   • mode="page" — /patients 화면. 줄마다 오늘 상태별 동작(ACT-*), 머리에 여러 명 [선택](PICK-*).
//   • mode="pick" — 워크인·전화예약 패널 왼쪽 본문(Task 9·14). 줄 전체가 고르기 하나(ACT-08).
// 검색은 목록이 아니라 「동작의 입구」다 — 찾은 줄에서 바로 접수·예약·방문 등록으로 갈라진다.

const NEAR_BOTTOM_PX = 120

interface PatientSearchProps {
  mode?: 'page' | 'pick'
  /** pick 모드에서 줄을 고르면 부른다(Task 9·14가 넘긴다).
   *  ⭐ 줄 전체를 함께 준다 — 부르는 쪽이 이름·가린 값을 다시 조회하지 않게(`MASK-SRV-01`).
   *  D3 워크인 패널이 고른 환자 카드를 그리려면 id만으로는 부족하다. */
  onPick?: (patientId: string, row: SearchPatientRow) => void
}

export function PatientSearch({ mode = 'page', onPick }: PatientSearchProps) {
  const s = useSearchPatients()

  const showHints = s.query.trim() === ''
  const showCount = s.query.trim() !== '' && (s.hasSearched || s.searching)
  const showZero = s.hasSearched && !s.searching && s.rows.length === 0 && s.query.trim() !== ''
  const showList = s.rows.length > 0

  // 아래로 내리면 다음 20건이 자동으로 이어 붙는다(RESULT-03) — [더 보기] 버튼을 두지 않는다.
  const onScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      if (el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX) s.loadMore()
    },
    [s],
  )

  return (
    <section data-testid="patient-search" data-component="PatientSearch" style={styles.root}>
      {/* [데모 뼈대] 검색창 앞에 돋보기 아이콘 — 이 상자가 검색임을 한눈에. */}
      <div style={styles.boxWrap}>
        <svg style={styles.boxIcon} width="18" height="18" aria-hidden="true">
          <use href={`${iconSpriteUrl}#search`} />
        </svg>
        <input
          type="text"
          aria-label="환자 검색"
          value={s.query}
          placeholder="이름 · 전화번호 · 생년월일 중 아는 것을 넣어 주세요"
          onChange={(e) => s.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') s.onEnter()
          }}
          style={styles.box}
        />
      </div>

      {showCount && (
        <div data-testid="search-count" style={styles.count}>
          <span style={styles.countNum}>
            {s.rows.length}명{s.hasMore ? ' 이상' : ''}
          </span>
          {s.searching && (
            <span aria-label="찾는 중" role="status" style={styles.spinner}>
              ◌
            </span>
          )}
        </div>
      )}

      {showHints && <UsageHints />}
      {showZero && <ZeroResult onDropLast={s.dropLastFragment} onClear={s.clearQuery} />}

      {showList && (
        <div data-testid="search-results" style={styles.results} onScroll={onScroll}>
          {mode === 'pick' ? (
            <PickList rows={s.rows} onPick={onPick} />
          ) : (
            <SelectableList<SearchPatientRow>
              rows={s.rows}
              getId={(r) => r.patient_id}
              getRowLabel={(r) => r.name}
              getStatus={(r) => r.today_status ?? 'none'}
              filterKey={s.query}
              renderRow={(r) => <SearchResultRow row={r} />}
              renderRowActions={(r) => <SearchRowActions row={r} />}
              // 여러 명에게 보내기·내려받기(PICK-ACT-01b)는 전역 부품의 몫 — 붙이기만 하고 실행은 위임한다.
              // TODO(PICK bulk): onSend/onDownload 실제 동작과 상태별 묶음(groupActionFor)은 Task 7/후속.
              groupActionFor={() => null}
              onSend={() => {}}
              onDownload={() => {}}
            />
          )}

          {/* 이어받기 꼬리 한 줄(RESULT-04·05·06) — 이미 뜬 줄을 가리지 않는다. */}
          {s.loadingMore && <div style={styles.footNote}>◌ 불러오는 중…</div>}
          {s.loadMoreFailed && (
            <div style={styles.footRetry}>
              <button type="button" style={styles.retryBtn} onClick={s.loadMore}>
                다시 시도
              </button>
            </div>
          )}
          {!s.hasMore && !s.loadingMore && !s.loadMoreFailed && (
            <div style={styles.footNote}>처음부터 모두 보여드렸습니다</div>
          )}
        </div>
      )}
    </section>
  )
}

// pick 모드 목록 — 줄 전체가 고르기 버튼 하나(ACT-08). 1명이어도 자동으로 골라두지 않는다(ONE-01).
function PickList({ rows, onPick }: { rows: SearchPatientRow[]; onPick?: (id: string, row: SearchPatientRow) => void }) {
  return (
    <ul style={styles.pickList}>
      {rows.map((r) => (
        <li key={r.patient_id}>
          <button
            type="button"
            aria-label={`${r.name} 선택`}
            style={styles.pickRow}
            onClick={() => onPick?.(r.patient_id, r)}
          >
            <SearchResultRow row={r} />
          </button>
        </li>
      ))}
    </ul>
  )
}

const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  boxWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  boxIcon: {
    position: 'absolute', left: 14, color: 'var(--color-ink-muted)', pointerEvents: 'none',
  },
  box: {
    width: '100%',
    height: 40,
    padding: '0 var(--sp-4) 0 var(--sp-10)',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-section)',
    boxSizing: 'border-box',
  },
  count: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: 'var(--sp-0-5) var(--sp-0-5)' },
  countNum: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  spinner: { fontSize: 'var(--fs-caption)', color: 'var(--color-primary)' },
  results: { maxHeight: '60vh', overflow: 'auto' },
  pickList: { listStyle: 'none', margin: 0, padding: 0 },
  pickRow: {
    width: '100%',
    display: 'flex',
    padding: 'var(--sp-2) var(--sp-2)',
    border: 'none',
    borderBottom: '1px solid var(--color-divider)',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
  },
  footNote: { padding: 'var(--sp-2) var(--sp-1)', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', textAlign: 'center' },
  footRetry: { padding: 'var(--sp-2) var(--sp-1)', textAlign: 'center' },
  retryBtn: {
    height: 28,
    padding: '0 var(--sp-3)',
    borderRadius: 6,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
}
