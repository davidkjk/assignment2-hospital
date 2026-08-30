import type { CSSProperties } from 'react'

// [ALOG-LIST-05·06·07·12·13][ALOG-AUDIT-01] 자료 종류(resource_type) → 사람이 읽는 배지.
//
// ⭐ 이 화면이 기록하는 것은 「읽었다」이다 — 「수정」·「작성」으로 읽힐 라벨을 쓰지 않는다(ALOG-LIST-06).
// ⭐ 모르는 미래 값이 와도 행을 버리지 않고 raw 식별자도 노출하지 않는다(ALOG-LIST-07) —
//    「새 기록 종류 · 확인 필요」는 화면에 찍는 라벨이지 미결 표시가 아니다.
// 색은 정본 토큰만 쓴다(하드코딩 hex 금지). 종류를 몇 갈래 톤으로만 나눈다 — 팔레트가 좁아서가
// 아니라, 배지가 시끄러우면 기록장이 안 읽히기 때문이다.

type Tone = 'read' | 'search' | 'reveal' | 'merge' | 'undo' | 'stats' | 'unknown'

interface KindMeta {
  label: string
  tone: Tone
}

const UNKNOWN_LABEL = '새 기록 종류 · 확인 필요'

// 서버·마이그레이션이 계약한 종류만 라벨을 갖는다. 그 밖은 전부 UNKNOWN으로 떨어진다.
const KIND: Record<string, KindMeta> = {
  patient_detail: { label: '환자정보', tone: 'read' },
  medical_record: { label: '진료기록', tone: 'read' },
  search: { label: '검색', tone: 'search' },
  phone_reveal: { label: '번호 열람', tone: 'reveal' },
  patient_merge: { label: '병합', tone: 'merge' },
  patient_merge_undo: { label: '병합 되돌림', tone: 'undo' },
  stats_drilldown: { label: '통계 상세 열람', tone: 'stats' },
  stats_export: { label: '통계 CSV 내보내기', tone: 'stats' },
}

/** [ALOG-LIST-05·06·07·12·13] raw 종류 → 화면 라벨. 모르는 값은 「새 기록 종류 · 확인 필요」. */
export function kindLabel(resourceType: string): string {
  return KIND[resourceType]?.label ?? UNKNOWN_LABEL
}

function kindTone(resourceType: string): Tone {
  return KIND[resourceType]?.tone ?? 'unknown'
}

/** [ALOG-LIST-03] 이름 없는·탈퇴 직원에게 식별자를 지어내지 않는다 — 행은 보존하고 칸만 대체한다. */
export function staffDisplay(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed ? trimmed : '직원 정보 없음'
}

export function LogKindBadge({ resourceType }: { resourceType: string }) {
  const tone = kindTone(resourceType)
  return (
    <span style={{ ...styles.badge, ...TONE_STYLE[tone] }} data-testid="log-kind-badge">
      {kindLabel(resourceType)}
    </span>
  )
}

const TONE_STYLE: Record<Tone, CSSProperties> = {
  read: { background: 'var(--color-done-bg)', color: 'var(--color-ink)', borderColor: 'var(--color-divider)' },
  search: { background: 'var(--color-primary-wash)', color: 'var(--color-primary)', borderColor: 'var(--color-primary-wash)' },
  reveal: { background: 'var(--color-primary-wash)', color: 'var(--color-warn)', borderColor: 'var(--color-primary-wash)' },
  merge: { background: 'var(--color-primary-wash)', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' },
  undo: { background: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderColor: 'var(--color-danger-bg)' },
  stats: { background: 'var(--color-done-bg)', color: 'var(--color-done)', borderColor: 'var(--color-divider)' },
  unknown: { background: 'var(--color-danger-bg)', color: 'var(--color-warn)', borderColor: 'var(--color-warn)' },
}

const styles: Record<string, CSSProperties> = {
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 22,
    padding: '0 8px',
    borderRadius: 6,
    border: '1px solid transparent',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    whiteSpace: 'nowrap',
  },
}
