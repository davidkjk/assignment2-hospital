import type { CSSProperties } from 'react'
import type { Role } from '../../auth/roles'
import { ROLE_LABEL } from '../../auth/roles'
import type { PatientDetail } from '../../api/patients'
import { mdHm } from './format'

// [PTDET-HEAD-01~06] 상세 머리 — 목록이 아니므로 전화번호·생년월일을 전체 노출한다(MASK-DETAIL-01).
// 열람은 화면 진입 자체가 서버 기록이라(HEAD-04) 여기서 토스트를 띄우지 않는다.
// 딥틸 콘솔의 결: 각진 촘촘한 한 덩어리에 신원을 모으고, 관계·역할은 이름 곁 칩으로 붙인다.

// 상세는 relation을 항상 주지는 않는다(BLOCKED — 상세 응답에 관계 없음). 있으면 본인/가족을 가른다.
type HeaderPatient = PatientDetail & { relation?: string | null }

interface HeaderProps {
  patient?: HeaderPatient
  role: Role
  loading?: boolean
  onChangePhone: () => void
}

export function Header({ patient, role, loading, onChangePhone }: HeaderProps) {
  return (
    <header aria-label="환자 머리" style={styles.wrap}>
      {loading || !patient ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : (
        <>
          <div style={styles.identity}>
            <div style={styles.nameRow}>
              <span style={styles.name}>{patient.name}</span>
              <RelationChip relation={patient.relation} />
            </div>
            <div style={styles.meta}>
              <span style={styles.metaItem}>{patient.birth_date}</span>
              {patient.gender && <span style={styles.metaItem}>{patient.gender}</span>}
            </div>
          </div>

          <div style={styles.contact}>
            <PhoneBlock phone={patient.phone} onChangePhone={onChangePhone} />
            {/* [PTDET-HEAD-05][SEND-DEAD-01] 죽은 번호 표식 — 서비스 장애가 아니라 「이 번호로는 안 간다」.
                고치는 자리(SEND-DEAD-02)에 표식이 붙는다 — 번호 고치기가 원래 여기서 일어난다. */}
            {patient.sms_dead && (
              <div data-testid="contact-status" style={styles.deadRow}>
                <span style={styles.deadText}>이 번호로 문자가 가지 않습니다</span>
                {patient.sms_dead_checked_at && (
                  <span style={styles.deadTime}>{mdHm(patient.sms_dead_checked_at)} 확인</span>
                )}
                <button type="button" onClick={onChangePhone} style={styles.fixBtn}>
                  번호 고치기
                </button>
              </div>
            )}
          </div>

          {/* [PTDET-HEAD-03] 역할별로 덜 보인다는 사실 자체를 숨기지 않는다 — 셸의 역할 칩을 이 화면에도 둔다. */}
          <span style={styles.roleChip}>{ROLE_LABEL[role]}</span>
        </>
      )}
    </header>
  )
}

// [PTDET-HEAD-02] 본인인지 가족인지를 이름 옆에서 바로 알 수 있다.
function RelationChip({ relation }: { relation?: string | null }) {
  const label = relation ? `가족 · ${relation}` : '본인'
  return <span style={styles.relationChip}>{label}</span>
}

// [PTDET-HEAD-06][MASK-TEL-02] tel: 링크를 만들지 않는다 — PC라 연동이 없으면 죽은 버튼이 된다.
//   대신 정확히 보여주고 복사까지 준다.
function PhoneBlock({ phone, onChangePhone }: { phone: string | null; onChangePhone: () => void }) {
  async function copy() {
    if (phone) {
      try {
        await navigator.clipboard?.writeText(phone)
      } catch {
        /* 클립보드가 막혀도 번호는 화면에 그대로 보인다. */
      }
    }
  }
  return (
    <div style={styles.phoneRow}>
      <span data-testid="phone" style={styles.phone}>
        {phone ?? '—'}
      </span>
      {phone && (
        <button type="button" onClick={copy} style={styles.copyBtn}>
          복사
        </button>
      )}
      <button type="button" onClick={onChangePhone} style={styles.copyBtn}>
        전화번호 변경
      </button>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--sp-4)',
    flexWrap: 'wrap',
    padding: 'var(--sp-4)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
  },
  skeleton: { height: 44, flex: 1, borderRadius: 6, background: 'var(--color-bg)' },
  identity: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', minWidth: 0 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' },
  name: { fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  relationChip: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)',
    background: 'var(--color-primary-wash)', borderRadius: 6, padding: 'var(--sp-0-5) var(--sp-2)',
  },
  meta: { display: 'flex', gap: 'var(--sp-3)', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  metaItem: {},
  contact: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', minWidth: 0 },
  phoneRow: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' },
  phone: { fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  copyBtn: {
    height: 26, padding: '0 var(--sp-3)', borderRadius: 6, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  deadRow: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' },
  deadText: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-warn)' },
  deadTime: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  fixBtn: {
    height: 26, padding: '0 var(--sp-3)', borderRadius: 6, border: '1px solid var(--color-warn)',
    background: 'var(--color-surface)', color: 'var(--color-warn)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  roleChip: {
    marginLeft: 'auto', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)',
    background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 6, padding: 'var(--sp-0-5) var(--sp-2)',
  },
}
