// [CAL-DOC-*] 의사 고르기 — ⭐ 드롭다운이 아니라 칩을 한 줄에 늘어놓는다(몇 명인지·지금 누구를
//   보는지가 펼치지 않아도 보인다). 여러 명을 함께 고를 수 있다(CAL-DOC-02b). 진료과 칩이 맨 왼쪽에서
//   의사 칩을 좁히고(CAL-DOC-04), 걸린 필터가 항상 보인다(CAL-DOC-05).

/** 캘린더가 열을 그리는 데 필요한 의사 한 명 — 이름·진료과·진료시간·팔레트 인덱스.
 *  ⚠️ 백엔드 /calendar 응답은 이 카탈로그를 담지 않는다(doctor_id만) — 상위(CalendarPage)가 채운다. */
export interface CalendarDoctor {
  id: string
  name: string
  departmentId: string
  departmentName: string
  slotMinutes: number
  /** 팔레트의 몇 번째(CAL-COLOR-09) — 색값이 아니라 인덱스. */
  paletteIndex: number
}

export interface DoctorChipsProps {
  doctors: CalendarDoctor[]
  departments: Array<{ id: string; name: string }>
  /** 빈 배열 = 전체(모든 의사). */
  selectedDoctorIds: string[]
  selectedDepartmentId: string | null
  onToggleDoctor(id: string): void
  onSelectAll(): void
  onSelectDepartment(id: string | null): void
}

export function DoctorChips({
  doctors,
  departments,
  selectedDoctorIds,
  selectedDepartmentId,
  onToggleDoctor,
  onSelectAll,
  onSelectDepartment,
}: DoctorChipsProps) {
  const visibleDoctors = selectedDepartmentId
    ? doctors.filter((d) => d.departmentId === selectedDepartmentId)
    : doctors
  const selectedDeptName = departments.find((d) => d.id === selectedDepartmentId)?.name

  return (
    <div className="cal-doctor-chips">
      {/* 진료과 칩 — 맨 왼쪽에서 의사 칩을 좁힌다(CAL-DOC-04). */}
      <div className="cal-dept-chips" role="group" aria-label="진료과">
        <button
          type="button"
          className="cal-chip"
          aria-pressed={selectedDepartmentId === null}
          onClick={() => onSelectDepartment(null)}
        >
          전체 과
        </button>
        {departments.map((dept) => (
          <button
            key={dept.id}
            type="button"
            className="cal-chip"
            aria-pressed={selectedDepartmentId === dept.id}
            onClick={() => onSelectDepartment(dept.id)}
          >
            {dept.name}
          </button>
        ))}
      </div>

      {/* 걸린 필터를 글자로 — 안 보이면 병원 전체가 그 과뿐인 줄 안다(CAL-DOC-05). */}
      {selectedDeptName && <span className="cal-filter-note">{selectedDeptName}만 보는 중</span>}

      {/* 의사 칩 — [전체] + 이름. 여러 명을 함께 고를 수 있다(CAL-DOC-02b). */}
      <div className="cal-name-chips" role="group" aria-label="의사">
        <button
          type="button"
          className="cal-chip"
          aria-pressed={selectedDoctorIds.length === 0}
          onClick={onSelectAll}
        >
          전체
        </button>
        {visibleDoctors.map((doc) => (
          <button
            key={doc.id}
            type="button"
            className="cal-chip"
            aria-pressed={selectedDoctorIds.includes(doc.id)}
            onClick={() => onToggleDoctor(doc.id)}
          >
            {/* 격자 예약 블록과 같은 색점 — 연한 fill 바탕 + 얇은 solid 테두리(블록의 미니 판, 2026-08-31). */}
            <span
              className="cal-chip-dot"
              style={{
                background: `var(--doctor-palette-${doc.paletteIndex}-fill)`,
                borderColor: `var(--doctor-palette-${doc.paletteIndex})`,
              }}
              aria-hidden
            />
            {doc.name}
          </button>
        ))}
      </div>
    </div>
  )
}
