// [DOCTOR-DRAFT-01~06] 브라우저 초안 보관 — 서버 자동 임시저장과 **병행**한다.
//   ⭐ 브라우저 쪽의 존재 이유는 「마지막 한 글자까지」다(서버만 두면 최대 30여 초치가 날아간다,
//      DRAFT-01). ⛔ 예약 id만으로 키를 만들지 않는다 — 같은 공용 PC를 다른 의사가 쓰면 남의 글이
//      자기 화면에 뜬다(DRAFT-02). 완료·로그아웃·자동 로그아웃 즉시 전부 지운다(DRAFT-03) — 안 지우면
//      환자의 증상·진단이 공용 PC에 평문으로 남는다.

export interface DraftFields {
  symptoms: string
  diagnosis: string
  treatment: string
  patient_visible_notes: string
}

export interface StoredDraft {
  fields: DraftFields
  /** 절대 시각(ISO). 서버 초안과 어느 쪽이 최신인지 비교하는 데 쓴다(DRAFT-04). */
  savedAt: string
}

const PREFIX = 'draft:'

export function emptyFields(): DraftFields {
  return { symptoms: '', diagnosis: '', treatment: '', patient_visible_notes: '' }
}

/** [DOCTOR-DRAFT-02] 계정 id + 예약 id를 함께 넣는다 — 계정이 다르면 없는 것으로 취급된다. */
export function draftKey(staffId: string, appointmentId: string): string {
  return `${PREFIX}${staffId}:${appointmentId}`
}

export function writeDraft(
  staffId: string,
  appointmentId: string,
  fields: DraftFields,
  at: Date = new Date(),
): void {
  const payload: StoredDraft = { fields, savedAt: at.toISOString() }
  try {
    localStorage.setItem(draftKey(staffId, appointmentId), JSON.stringify(payload))
  } catch {
    /* 저장소가 막혀도(사생활 모드 등) 서버 임시저장이 별도로 흐른다 — 화면은 멈추지 않는다. */
  }
}

export function readDraft(staffId: string, appointmentId: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(staffId, appointmentId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft
    if (!parsed || typeof parsed.savedAt !== 'string' || !parsed.fields) return null
    return parsed
  } catch {
    return null
  }
}

export function clearDraft(staffId: string, appointmentId: string): void {
  try {
    localStorage.removeItem(draftKey(staffId, appointmentId))
  } catch {
    /* 지우지 못해도 다음 clearAllDrafts에서 함께 지워진다. */
  }
}

/** [DOCTOR-DRAFT-03] 로그아웃·자동 로그아웃에서 부른다 — 이 브라우저의 모든 초안을 지운다. */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith(PREFIX)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    /* 저장소 접근 자체가 막힌 환경 — 애초에 쓴 것도 없다. */
  }
}
