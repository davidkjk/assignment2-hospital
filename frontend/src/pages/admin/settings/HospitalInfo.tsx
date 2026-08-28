import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Settings } from '../../../api/settings'
import { SettingRow } from './SettingRow'

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

      <SettingRow label="주소">
        <input
          type="text"
          value={draft.hospital_address ?? ''}
          onChange={(e) => onChange('hospital_address', e.target.value)}
          aria-label="주소"
          style={styles.input}
        />
      </SettingRow>
      <SettingRow label="대표 전화">
        <input
          type="text"
          value={draft.hospital_phone ?? ''}
          onChange={(e) => onChange('hospital_phone', e.target.value)}
          aria-label="대표 전화"
          style={styles.phoneInput}
        />
      </SettingRow>

      <SettingRow label="예정 휴무 (읽기 전용)" hint="휴무일 등록·변경은 진료 일정 › 특정 날짜 변경에서 합니다.">
        <div style={styles.closures}>
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
      </SettingRow>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 20 },
  banner: { margin: 0, padding: '8px 12px', background: 'var(--color-surface-muted, #eef3f7)', borderRadius: 6, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  input: { minWidth: 320 },
  phoneInput: { minWidth: 220 },
  closures: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, textAlign: 'right' },
  list: { margin: 0, paddingLeft: 0, listStyle: 'none' },
  hint: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
}
