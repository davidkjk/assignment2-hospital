import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Settings } from '../../../api/settings'

// [HSET-INFO-*] 병원 정보 — 주소·전화(환자 앱 노출, HSET-INFO-01·02). 예정 휴무는 읽기 전용이고
// 편집은 /admin/schedule 특정 날짜 변경으로만(HSET-INFO-03·04·HSETX-NAV-01) — 넣는 자리를 둘로 두지 않는다.

interface Props {
  draft: Settings
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

export function HospitalInfo({ draft, onChange }: Props) {
  return (
    <div style={styles.section}>
      <p style={styles.banner}>환자 앱에 그대로 보입니다</p>

      <label style={styles.field}>
        <span>주소</span>
        <input
          type="text"
          value={draft.hospital_address ?? ''}
          onChange={(e) => onChange('hospital_address', e.target.value)}
          aria-label="주소"
        />
      </label>
      <label style={styles.field}>
        <span>전화</span>
        <input
          type="text"
          value={draft.hospital_phone ?? ''}
          onChange={(e) => onChange('hospital_phone', e.target.value)}
          aria-label="전화"
        />
      </label>

      <div style={styles.closures}>
        <h3 style={styles.subhead}>예정 휴무 (읽기 전용)</h3>
        {draft.upcoming_closures.length === 0 ? (
          <p style={styles.hint}>예정된 휴무가 없습니다.</p>
        ) : (
          <ul style={styles.list}>
            {draft.upcoming_closures.map((c) => (
              <li key={c.closure_date}>
                {c.closure_date}
                {c.memo ? ` · ${c.memo}` : ''}
              </li>
            ))}
          </ul>
        )}
        <Link to="/admin/schedule">특정 날짜 변경에서 관리 ›</Link>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 12 },
  banner: { margin: 0, padding: '6px 10px', background: 'var(--color-surface-muted, #eef3f7)', borderRadius: 6, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 },
  closures: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 },
  subhead: { margin: 0, fontSize: 'var(--fs-base)', fontWeight: 700 },
  list: { margin: 0, paddingLeft: 18 },
  hint: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
}
