import { useState, type CSSProperties } from 'react'
import { PatientSearch } from '../patients/PatientSearch'
import { TextButton } from '@/components/staff-ui'

// [Task 28][SEND-WHO-03·04][SEND-BOX-03] 받는 사람 칸.
//   • 칸을 누르면 왼쪽이 「고르는 도구」(검색 표)가 된다(PANEL-WORK-02 — 여기서는 패널 안에 인라인).
//   • [전 환자에게 보내기]는 검색으로 넣을 수 없는 전체(SEND-WHO-04) — 별도 버튼.
// ⚠️ PatientSearch(mode="pick")의 onPick은 id만 준다 → 이름 없이 「N명 선택됨」으로 센다.
//   (개인정보 열거 없이 인원만 보이는 것은 SEND-ADS-02의 태도와도 맞다.)

export type Recipients = { mode: 'pick'; ids: string[] } | { mode: 'all' }

interface Props {
  value: Recipients
  onChange: (r: Recipients) => void
}

export function RecipientField({ value, onChange }: Props) {
  const [picking, setPicking] = useState(false)

  const addId = (id: string) => {
    const ids = value.mode === 'pick' ? value.ids : []
    if (!ids.includes(id)) onChange({ mode: 'pick', ids: [...ids, id] })
  }

  return (
    <div style={styles.wrap}>
      <span style={styles.label}>받는 사람</span>

      {value.mode === 'all' ? (
        <div style={styles.summary}>
          <span style={styles.allTag}>전 환자</span>
          <TextButton onClick={() => onChange({ mode: 'pick', ids: [] })}>
            다시 고르기
          </TextButton>
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-label="받는 사람 고르기"
            style={styles.pickField}
            onClick={() => setPicking((v) => !v)}
          >
            {value.ids.length > 0 ? `${value.ids.length}명 선택됨` : '환자를 고르세요'}
          </button>
          <TextButton style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ mode: 'all' })}>
            전 환자에게 보내기
          </TextButton>
          {picking && (
            <div data-testid="left-tool" style={styles.tool}>
              <p style={styles.toolHead}>환자를 고르는 중</p>
              <PatientSearch mode="pick" onPick={addId} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  label: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  pickField: {
    height: 36,
    padding: '0 var(--sp-3)',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
    textAlign: 'left',
    cursor: 'pointer',
  },
  summary: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' },
  allTag: {
    padding: 'var(--sp-1) var(--sp-3)',
    borderRadius: 6,
    background: 'var(--color-surface-muted, #eef2f6)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    color: 'var(--color-ink)',
  },
  tool: { marginTop: 'var(--sp-2)', border: '1px solid var(--color-divider)', borderRadius: 8, padding: 'var(--sp-2)' },
  toolHead: { margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
}
