import { useRef, type CSSProperties } from 'react'
import { PatientSearch } from '../patients/PatientSearch'
import { Segmented } from '@/components/staff-ui'
import { Search } from '@/components/icons'

// [Task 28][SEND-WHO-02·03·04][SEND-BOX-03] 받는 사람 칸 — 두 갈래를 나란한 선택지로.
//   • 「환자 고르기」 / 「전 환자에게」를 세그먼트로 나란히 둔다(2026-08-31 손검수 ㉮ — 전 환자가
//     흐린 텍스트-링크라 옵션처럼 안 보이던 것). 전 환자 발송은 눌러도 바로 안 나가고, 보내기 때
//     미리보기(AllPatientsPreviewDialog)로 한 번 더 확인한다(SEND-ALL-04) — 그 안내를 칸에 적는다.
//   • 「환자 고르기」를 고르면 검색 표가 바로 펼쳐진다(SEND-WHO-03, 발견성). 한 명씩 고르면 쌓여
//     「N명 선택됨」이 된다(SEND-WHO-02, 여러 명). 이름은 안 보이고 인원만 센다(열거 방지, SEND-ADS-02).
// ⚠️ PatientSearch(mode="pick")의 onPick은 id만 준다.

/** 고른 한 명 — id와 이름을 함께 든다. 이름은 「받는 사람」 칩(SEND-WHO-05)에만 쓰고, 서버엔 id만 보낸다. */
export type Recipient = { id: string; name: string }
export type Recipients = { mode: 'pick'; patients: Recipient[] } | { mode: 'all' }

interface Props {
  value: Recipients
  onChange: (r: Recipients) => void
}

const MODES: { key: Recipients['mode']; label: string }[] = [
  { key: 'pick', label: '환자 고르기' },
  { key: 'all', label: '전 환자에게' },
]

export function RecipientField({ value, onChange }: Props) {
  // 「전 환자에게」로 잠깐 옮겼다 돌아와도 고르던 사람을 잃지 않게 마지막 선택을 기억한다.
  const lastPicked = useRef<Recipient[]>(value.mode === 'pick' ? value.patients : [])
  if (value.mode === 'pick') lastPicked.current = value.patients

  const setMode = (m: Recipients['mode']) => {
    onChange(m === 'all' ? { mode: 'all' } : { mode: 'pick', patients: lastPicked.current })
  }

  // [SEND-WHO-02] 같은 줄을 다시 누르면 뺀다(토글) — 고르기·빼기가 한 자리에서 일어난다.
  const toggle = (id: string, name: string) => {
    const list = value.mode === 'pick' ? value.patients : []
    const exists = list.some((p) => p.id === id)
    onChange({ mode: 'pick', patients: exists ? list.filter((p) => p.id !== id) : [...list, { id, name }] })
  }

  const count = value.mode === 'pick' ? value.patients.length : 0
  const selectedIds = new Set(value.mode === 'pick' ? value.patients.map((p) => p.id) : [])

  return (
    <div style={styles.wrap}>
      <span style={styles.label}>받는 사람</span>

      {/* [SEND-WHO-03·손검수 L56③] 세그먼트는 내용 폭만 — 열 전체로 늘어나면 회색 배경이 버튼처럼 안 보인다. */}
      <div style={styles.segRow}>
        <Segmented options={MODES} value={value.mode} onChange={setMode} />
      </div>

      {value.mode === 'pick' ? (
        <div data-testid="left-tool" style={styles.pick}>
          <p style={styles.pickHead}>
            <Search className="h-4 w-4 shrink-0" />
            <span>검색해서 고르기</span>
            {count > 0 && <span style={styles.count}>{count}명 선택됨</span>}
          </p>
          {/* 왼쪽 본화면이 「고르는 도구」가 된다(SEND-BOX-03) — 예약·워크인과 같은 검색 부품 재사용. */}
          <PatientSearch mode="pick" onPick={(id, row) => toggle(id, row.name)} selectedIds={selectedIds} />
        </div>
      ) : (
        <p style={styles.allNote}>
          등록된 <strong>전 환자에게</strong> 보냅니다. 보내기 전에 미리보기로 한 번 더 확인합니다.
        </p>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', minHeight: 0 },
  label: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  segRow: { display: 'flex' },
  pick: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)', minHeight: 0 },
  pickHead: {
    margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)',
  },
  count: {
    marginLeft: 'auto', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    color: 'var(--color-primary)', background: 'var(--color-primary-wash)', borderRadius: 6, padding: '1px var(--sp-2)',
  },
  allNote: {
    margin: 'var(--sp-1) 0 0', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 8,
    background: 'var(--color-surface-muted, #eef2f6)', color: 'var(--color-ink)',
    fontSize: 'var(--fs-caption)', lineHeight: 1.5,
  },
}
