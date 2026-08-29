import type { CSSProperties } from 'react'
import { EmptyState } from '../../../components/EmptyState'
import { btnPrimary } from '../../../components/staff-ui'
import { WEEKDAY_SHORT, type OverviewDoctor } from './types'

// [SCHED-GRID-01·02] 전체 현황 = 읽는 곳. 행=의사·열=요일 7. 한 칸에 진료 시간·한 칸 길이·하루 최대 인원.
//   ⛔ 여기서 고치지 않는다 — 입력칸(textbox)을 두지 않는다(칸 6개를 다 담으면 격자가 표가 된다).
// [SCHED-GRID-03] 칸을 누르면 「의사별 스케줄」로 옮겨가며 그 의사·그 요일이 선택된 채 열린다(막다른 길 금지).
// [SCHED-GRID-04] 정기 휴진은 빗금 + 「휴진」 글자 — 색만으로 구분하지 않는다.
// [SCHED-GRID-07] 활성 의사 0명이면 빈 격자만 두지 않고 갈 길(의사 관리로 가기)을 준다.

interface OverviewGridProps {
  doctors: OverviewDoctor[]
  onCellClick: (doctorId: string, weekday: number) => void
  onGoToStaff: () => void
}

function hourOf(value: string | null): string {
  return value ? value.slice(0, 2) : '--'
}

export function OverviewGrid({ doctors, onCellClick, onGoToStaff }: OverviewGridProps) {
  if (doctors.length === 0) {
    return (
      <EmptyState
        kind="zero"
        message="아직 등록된 의사가 없습니다"
        action={
          <button type="button" onClick={onGoToStaff} className={btnPrimary}>
            의사 관리로 가기
          </button>
        }
      />
    )
  }

  return (
    <div>
      {/* [SCHED-GRID-01·04] 범례 — 격자 셀의 「시각 / 한 칸·정원 / 휴진 빗금」이 무슨 뜻인지 + 눌러서 이동한다는 안내. */}
      <div style={styles.legend}>
        <span style={styles.legendItem}>
          <span style={styles.legendNum}>09–18</span> 진료 시간
        </span>
        <span style={styles.legendItem}>
          <span style={styles.legendNum}>15분 · 40명</span> 한 칸 길이 · 하루 최대 인원
        </span>
        <span style={styles.legendItem}>
          <span style={styles.legendSwatch} /> 휴진
        </span>
        <span style={styles.legendHint}>칸을 누르면 그 의사 스케줄로 이동합니다</span>
      </div>

      <div data-testid="overview-grid" style={styles.wrap}>
        <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, ...styles.thDoctor }}>의사</th>
            {WEEKDAY_SHORT.map((d, i) => (
              <th
                key={d}
                data-weekday={i}
                style={{ ...styles.th, ...(i === 5 ? styles.thSat : i === 6 ? styles.thSun : null) }}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {doctors.map((doc) => (
            <tr key={doc.doctor_id}>
              <td style={styles.tdDoctor}>
                <div style={styles.docName}>{doc.name}</div>
                {doc.department && <div style={styles.docDept}>{doc.department}</div>}
              </td>
              {doc.days.map((day) => {
                const off = day.is_day_off
                return (
                  <td key={day.weekday} style={styles.td}>
                    <button
                      type="button"
                      data-cell={`${doc.name}|${WEEKDAY_SHORT[day.weekday]}`}
                      className={off ? 'is-hatched' : undefined}
                      onClick={() => onCellClick(doc.doctor_id, day.weekday)}
                      title="눌러서 고치기"
                      style={{ ...styles.cell, ...(off ? styles.cellOff : null) }}
                    >
                      {off ? (
                        <span style={styles.hatch}>휴진</span>
                      ) : (
                        <>
                          <span style={styles.cellTime}>
                            {hourOf(day.start)}–{hourOf(day.end)}
                          </span>
                          <span style={styles.cellMeta}>
                            {day.slot_minutes}분 · {day.max_daily}명
                          </span>
                        </>
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  )
}

const HATCH = 'repeating-linear-gradient(45deg, rgba(90,108,123,0.16) 0 4px, transparent 4px 8px)'

const styles: Record<string, CSSProperties> = {
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 16,
    rowGap: 4,
    marginBottom: 8,
    fontSize: 'var(--fs-caption)',
    color: 'var(--color-ink-muted)',
  },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  legendNum: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink)' },
  legendSwatch: {
    display: 'block',
    width: 24,
    height: 12,
    borderRadius: 4,
    backgroundImage: HATCH,
  },
  legendHint: { color: 'var(--color-ink-muted)', opacity: 0.75 },
  wrap: {
    overflowX: 'auto',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    background: 'var(--color-surface)',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' },
  th: {
    padding: '6px 8px',
    textAlign: 'center',
    fontSize: 'var(--fs-caption)',
    fontWeight: 600,
    color: 'var(--color-ink-muted)',
    borderBottom: '1px solid var(--color-divider)',
  },
  thDoctor: { textAlign: 'left', minWidth: 120 },
  thSat: { color: 'var(--color-weekend-sat)' },
  thSun: { color: 'var(--color-weekend-sun)' },
  tdDoctor: { padding: '6px 8px', borderBottom: '1px solid var(--color-divider)' },
  td: { padding: 3, borderBottom: '1px solid var(--color-divider)', textAlign: 'center' },
  docName: { fontWeight: 600, color: 'var(--color-ink)' },
  docDept: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    width: '100%',
    minWidth: 58,
    padding: '4px 2px',
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--color-ink)',
    fontVariantNumeric: 'tabular-nums',
  },
  cellOff: { backgroundImage: HATCH },
  cellTime: { fontWeight: 600 },
  cellMeta: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  hatch: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
}
