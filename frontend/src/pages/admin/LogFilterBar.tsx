import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AccessLogPatientRef } from '../../api/accessLogs'
import { searchPatients } from '../../api/patients'
import { PeriodPicker } from './PeriodPicker'

// [ALOG-FILTER-02·03] 조회 필터 — 환자 찾기(같은 화면 검색 결과를 patient_id로 연결)·기간.
//
// ⭐ 이 화면이 검색 규칙을 새로 만들지 않는다(ALOG-FILTER-02) — SEARCH-*·MASK-* 원본을 그대로
//    부른다. 결과·칩·URL 어디에도 원문 이름·전화를 넣지 않고 마스킹 식별자만 쓴다.
// ⛔ 칩만 있고 지울 길이 없으면 막다른 길 — [필터 지우기]를 늘 함께 둔다(ALOG-FILTER-03·05).

interface PatientHit {
  patient_id: string
  name?: string
  masked_birth_date?: string
  masked_phone?: string
}

interface LogFilterBarProps {
  /** 선택된 환자 칩(patient_id + 마스킹 식별자). null이면 필터 없음. */
  selectedPatient: AccessLogPatientRef | null
  onSelectPatient: (p: PatientHit) => void
  onClearPatient: () => void
  from: string
  to: string
  onRangeChange: (r: { from: string; to: string }) => void
  onApplyRange: () => void
  rangeError?: string
  /** 필터 없을 때 전체 건수(전체 N건). 환자 필터가 걸리면 그 환자 M건과 함께 보인다. */
  overallTotal: number | null
  filteredTotal: number | null
}

function identity(p: AccessLogPatientRef): string {
  return [p.name, p.masked_birth_date, p.masked_phone].filter(Boolean).join(' · ')
}

export function LogFilterBar({
  selectedPatient,
  onSelectPatient,
  onClearPatient,
  from,
  to,
  onRangeChange,
  onApplyRange,
  rangeError,
  overallTotal,
  filteredTotal,
}: LogFilterBarProps) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PatientHit[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setHits([])
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        // searchPatients는 이제 커서 페이지({rows,…})를 준다(24a 계약) — 필터 칩은 첫 페이지만 쓴다.
        const page = await searchPatients(term)
        setHits(page.rows as unknown as PatientHit[])
      } catch {
        setHits([])
      }
    }, 180)
    return () => clearTimeout(timer.current)
  }, [q])

  function pick(hit: PatientHit) {
    setQ('')
    setHits([])
    onSelectPatient(hit)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        {!selectedPatient ? (
          <div style={styles.searchBox}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>환자 찾기</span>
              <input
                type="text"
                aria-label="환자 찾기"
                value={q}
                placeholder="이름·전화·생년월일로 찾기"
                onChange={(e) => setQ(e.target.value)}
                style={styles.input}
              />
            </label>
            {hits.length > 0 && (
              <ul role="listbox" aria-label="환자 검색 결과" style={styles.results}>
                {hits.map((h) => (
                  <li key={h.patient_id}>
                    <button type="button" onClick={() => pick(h)} style={styles.resultItem}>
                      <span style={styles.resultName}>{h.name ?? '이름 미상'}</span>
                      <span style={styles.resultSub}>
                        {[h.masked_birth_date, h.masked_phone].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div style={styles.chipRow}>
            <span data-testid="filter-chip" style={styles.chip}>
              환자: {identity(selectedPatient)}
            </span>
            <button type="button" onClick={onClearPatient} style={styles.clearBtn}>
              필터 지우기
            </button>
          </div>
        )}

        <PeriodPicker
          from={from}
          to={to}
          onChange={onRangeChange}
          onApply={onApplyRange}
          error={rangeError}
          applyLabel="기간 조회"
        />
      </div>

      {selectedPatient && (
        <p data-testid="filter-count" style={styles.count}>
          전체 {overallTotal != null ? overallTotal.toLocaleString('en-US') : '—'}건 중 이 환자{' '}
          {filteredTotal != null ? filteredTotal.toLocaleString('en-US') : '—'}건
        </p>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  searchBox: { position: 'relative', minWidth: 240 },
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
    minWidth: 240,
  },
  results: {
    listStyle: 'none',
    position: 'absolute',
    zIndex: 10,
    top: 62,
    left: 0,
    right: 0,
    margin: 0,
    padding: 4,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    boxShadow: 'var(--shadow-card)',
  },
  resultItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    width: '100%',
    padding: '7px 8px',
    border: 'none',
    borderRadius: 6,
    background: 'none',
    textAlign: 'left',
    cursor: 'pointer',
  },
  resultName: { fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--color-ink)' },
  resultSub: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  chipRow: { display: 'flex', alignItems: 'center', gap: 8 },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 30,
    padding: '0 12px',
    borderRadius: 8,
    background: 'var(--color-primary-wash)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
  },
  clearBtn: {
    height: 30,
    padding: '0 12px',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  count: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
}
