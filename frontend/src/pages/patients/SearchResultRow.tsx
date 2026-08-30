import { useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePanel } from '../../components/PanelHost'
import { UndoControl } from '../../components/UndoControl'
import { UserRound } from '../../components/icons'
import type { SearchMatch, SearchPatientRow, SearchTodayStatus } from '../../api/patients'

// 검색 결과 한 줄 — 접수 업무 셋의 갈림길(SEARCH-ACT-*). 왼쪽에 마스킹된 신원 + 왜 걸렸는지 배지,
// 오른쪽에 「오늘 상태」에 맞는 동작 하나. ⛔ 네 상태의 버튼을 한 줄에 늘어놓지 않는다(ACT-01).
//
// ⚠️ 경계(HANDOFF 이월) — 24a 응답에는 appointment_id가 없다. 그래서 도착·진료대기 처리의 실제
//    서버 호출(transitionStatus)과 [대기 목록에서 보기]의 highlight= 는 Task 9/13이 채운다.
//    여기서는 규칙이 요구하는 「무엇이 보이고 어디로 가는가」만 못박는다(호출 지점 + TODO).

const MATCH_LABEL: Record<SearchMatch, string> = {
  name: '이름 일치',
  phone: '전화 일치',
  birth: '생일 일치',
}

// 왜 걸렸는지 배지(WHY-01·03). ⛔ 글자를 <mark>로 굵게 칠하지 않는다(WHY-02) — 가려진 자리가
//    드러나는 순간을 막는다. 배지로만 「무엇이 맞았나」를 알린다.
function WhyBadges({ matched }: { matched: SearchMatch[] }) {
  if (matched.length === 0) return null
  return (
    <span style={styles.badges}>
      {matched.map((m) => (
        <span key={m} style={styles.badge}>
          {MATCH_LABEL[m]}
        </span>
      ))}
    </span>
  )
}

export function SearchResultRow({ row }: { row: SearchPatientRow }) {
  return (
    <div style={styles.identity}>
      <span style={styles.name}>{row.name}</span>
      <span style={styles.meta}>{row.masked_birth_date}</span>
      <span style={styles.meta}>{row.masked_phone}</span>
      <WhyBadges matched={row.matched} />
      {row.today_status === 'booked' && row.today_appointment_time && (
        <span style={styles.today}>
          오늘 예약 {row.today_appointment_time}
          {(row.today_department_name || row.today_doctor_name) && (
            <span style={styles.todayWhere}>
              {' · '}
              {[row.today_department_name, row.today_doctor_name].filter(Boolean).join(' ')}
            </span>
          )}
        </span>
      )}
      {row.today_status === 'arrived' && <span style={styles.today}>대기 중</span>}
      {row.today_status === 'done' && <span style={styles.todayDone}>진료 완료</span>}
    </div>
  )
}

// 오늘 상태에 맞는 동작 묶음(ACT-02~05). 선택 모드에서는 목록(SelectableList)이 이 묶음을 숨긴다(PICK-ACT-02).
export function SearchRowActions({ row }: { row: SearchPatientRow }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { openPanel } = usePanel()
  const [processed, setProcessed] = useState<string | null>(null) // ACT-09 낙관적 처리 표시

  // [환자 상세] = '이 환자 기록 열기' 공통 동작. 옆 상태 처리 버튼과 섞이므로 외곽선 + 사람 아이콘으로
  // 늘 같은 모습을 유지해 한눈에 구분한다(사용자 지시 2026-08-30 · Today·Queue와 동일 처리).
  const detailLink = (
    <Link to={`/patients/${row.patient_id}`} style={styles.detailLink} className="btn q">
      <UserRound width={14} height={14} aria-hidden="true" style={styles.detailIcon} />
      환자 상세
    </Link>
  )

  // 도착/진료대기는 그 자리에서 처리하고 화면을 옮기지 않는다(ACT-02). 확인창 대신 되돌리기(ACT-09).
  // TODO(Task 9/13): 실제 transitionStatus 호출 — 24a DTO에 appointment_id·updated_at이 없어 여기선 낙관적 표시만.
  if (processed) {
    return (
      <div style={styles.actions}>
        <span style={styles.processed}>{processed} 처리됨</span>
        <UndoControl onUndo={() => setProcessed(null)} />
        {detailLink}
      </div>
    )
  }

  if (row.today_status === 'booked') {
    return (
      <div style={styles.actions}>
        <button type="button" style={styles.action} onClick={() => setProcessed('진료 대기')}>
          진료 대기
        </button>
        <button type="button" style={styles.actionPrimary} onClick={() => setProcessed('도착')}>
          도착
        </button>
        {detailLink}
      </div>
    )
  }

  if (row.today_status === 'arrived') {
    return (
      <div style={styles.actions}>
        {/* TODO(Task 13): /queue?highlight=<appointment_id> — 24a가 appointment_id를 주면 강조를 잇는다. */}
        <button type="button" style={styles.action} onClick={() => navigate('/queue')}>
          대기 목록에서 보기
        </button>
        {detailLink}
      </div>
    )
  }

  if (row.today_status === 'done') {
    // 오늘 할 일이 끝난 사람 — 동작 없이 상세만(ACT-04).
    return <div style={styles.actions}>{detailLink}</div>
  }

  // 오늘 아무것도 없음 — 예약을 시작하는 두 갈래(ACT-05·06).
  return (
    <div style={styles.actions}>
      <button
        type="button"
        style={styles.action}
        onClick={() =>
          // [예약 잡기]는 캘린더로 옮겨 가며 환자가 채워진 채 패널이 열린다(CAL-BOOK-03, 캘린더 소유).
          navigate('/calendar', { state: { patientId: row.patient_id, intent: 'book' } })
        }
      >
        예약 잡기
      </button>
      <button
        type="button"
        style={styles.actionPrimary}
        onClick={() =>
          // [당일 방문 등록]은 그 자리에서 패널(QUEUE-WALK-02). origin으로 돌아올 자리를 기억(PANEL-HOME-01).
          // TODO(Task 9): WalkInPanel 콘텐츠 — 아직 없어 자리표시자를 담는다. 조립은 이 태스크 이후.
          openPanel({
            title: `${row.name} 님 당일 방문`,
            origin: location.pathname + location.search,
            content: <WalkInPlaceholder patientId={row.patient_id} />,
          })
        }
      >
        당일 방문 등록
      </button>
      {detailLink}
    </div>
  )
}

function WalkInPlaceholder({ patientId }: { patientId: string }) {
  return (
    <p style={styles.placeholder} data-walkin-patient={patientId}>
      당일 방문 등록 패널은 준비 중입니다.
    </p>
  )
}

export const TODAY_LABEL: Record<Exclude<SearchTodayStatus, null>, string> = {
  booked: '예약',
  arrived: '대기 중',
  done: '진료 완료',
}

const styles: Record<string, CSSProperties> = {
  identity: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', minWidth: 0 },
  name: { fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  meta: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  badges: { display: 'inline-flex', gap: 4 },
  badge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 4,
    background: 'var(--color-primary-wash)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
  },
  today: {
    padding: '1px 6px',
    borderRadius: 4,
    background: 'var(--color-bg)',
    color: 'var(--color-warn)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    fontVariantNumeric: 'tabular-nums',
  },
  todayWhere: { color: 'var(--color-ink-muted)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  todayDone: {
    padding: '1px 6px',
    borderRadius: 4,
    background: 'var(--color-done-bg)',
    color: 'var(--color-done)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
  },
  actions: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  action: {
    height: 28,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  actionPrimary: {
    height: 28,
    padding: '0 12px',
    borderRadius: 6,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-primary)',
    color: 'var(--color-surface)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  detailLink: {
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  detailIcon: { color: 'var(--color-ink-muted)', flexShrink: 0 },
  processed: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)' },
  placeholder: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
}
