import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Settings } from '../../../api/settings'
import { TextField } from '../../../components/staff-ui'
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
        <TextField
          value={draft.hospital_address ?? ''}
          onChange={(v) => onChange('hospital_address', v)}
          ariaLabel="주소"
          placeholder="예: 서울시 강남구 …"
          className="min-w-80"
        />
      </SettingRow>
      <SettingRow label="대표 전화">
        <TextField
          value={draft.hospital_phone ?? ''}
          onChange={(v) => onChange('hospital_phone', v)}
          ariaLabel="대표 전화"
          placeholder="예: 02-000-0000"
          className="min-w-56"
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
  section: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' },
  banner: { margin: 0, padding: 'var(--sp-3) var(--sp-4)', background: 'var(--color-done-bg)', borderRadius: 8, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  closures: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--sp-2)', textAlign: 'right' },
  list: { margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 'var(--fs-body)' },
  hint: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
}
