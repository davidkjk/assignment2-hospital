import type { CSSProperties, ReactNode } from 'react'
import type { Role } from '../../auth/roles'
import { ROLE_LABEL } from '../../auth/roles'
import type { PatientDetail } from '../../api/patients'
import { mdHm } from './format'

// [PTDET-HEAD-01~06] 상세 머리 — 목록이 아니므로 전화번호·생년월일을 전체 노출한다(MASK-DETAIL-01).
// 열람은 화면 진입 자체가 서버 기록이라(HEAD-04) 여기서 토스트를 띄우지 않는다.
// 딥틸 콘솔의 결: 각진 촘촘한 한 덩어리에 신원을 모으고, 관계·역할은 이름 곁 칩으로 붙인다.
//
// [PTDET-HEAD-07] 맨 윗 카드는 2단이다(2026-08-31 손검수 ⑥) — 왼쪽은 신원(이름·전화·생년월일·역할),
//   오른쪽 rightSlot에 가족 관계를 얹어 한 카드로 합친다. 좁아지면 오른쪽 단이 아래로 접힌다.

// 상세는 relation을 항상 주지는 않는다(BLOCKED — 상세 응답에 관계 없음). 있으면 본인/가족을 가른다.
type HeaderPatient = PatientDetail & { relation?: string | null }

// [PTDET-HEAD-01] 성별은 DB 원본이 'F'/'M'으로 올 수 있다 — 화면엔 우리말로(손검수 2026-08-31, "F로 나옴").
//   이미 '남'/'여'로 온 값은 그대로 통과시킨다.
const GENDER_LABEL: Record<string, string> = { F: '여', M: '남', female: '여', male: '남' }
function genderLabel(g: string): string {
  return GENDER_LABEL[g] ?? g
}

// 생년월일에서 만 나이 — 접수·진료에서 자주 눈으로 확인하는 값이라 머리에 함께 둔다(정보=구조).
function ageFrom(birth?: string | null): number | null {
  const m = birth ? /(\d{4})-(\d{2})-(\d{2})/.exec(birth) : null
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1
  return age >= 0 && age < 200 ? age : null
}

interface HeaderProps {
  patient?: HeaderPatient
  role: Role
  loading?: boolean
  onChangePhone: () => void
  /** [PTDET-HEAD-07] 카드 오른쪽 단(가족 관계). 없으면 한 단으로 그린다. */
  rightSlot?: ReactNode
}

export function Header({ patient, role, loading, onChangePhone, rightSlot }: HeaderProps) {
  return (
    <header aria-label="환자 머리" style={styles.wrap}>
      <div style={styles.main}>
      {loading || !patient ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : (
        <>
          <div style={styles.topLine}>
          <div style={styles.identity}>
            <div style={styles.nameRow}>
              <span style={styles.name}>{patient.name}</span>
              <RelationChip relation={patient.relation} />
            </div>
            <div style={styles.meta}>
              <span style={styles.metaItem}>{patient.birth_date}</span>
              {ageFrom(patient.birth_date) != null && (
                <>
                  <span style={styles.metaDot} aria-hidden="true">·</span>
                  <span style={styles.metaItem}>만 {ageFrom(patient.birth_date)}세</span>
                </>
              )}
              {patient.gender && (
                <>
                  <span style={styles.metaDot} aria-hidden="true">·</span>
                  <span style={styles.metaItem}>{genderLabel(patient.gender)}</span>
                </>
              )}
            </div>
          </div>
            {/* [PTDET-HEAD-03] 역할별로 덜 보인다는 사실 자체를 숨기지 않는다 — 셸의 역할 칩을 여기 오른쪽 위에. */}
            <span style={styles.roleChip}>{ROLE_LABEL[role]}</span>
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

        </>
      )}
      </div>
      {rightSlot && <div style={styles.side}>{rightSlot}</div>}
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
    alignItems: 'stretch',
    gap: 'var(--sp-4)',
    flexWrap: 'wrap',
    padding: 'var(--sp-4)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
  },
  // 왼쪽 신원 단 — 위→아래로 [이름+역할] · [생년·나이·성별] · [전화]. 역할 칩은 맨 윗줄 오른쪽에 고정한다.
  main: { flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  topLine: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-3)' },
  // 오른쪽 가족 단 — 세로 실선으로 신원과 가른다. 좁아지면 아래로 접힌다(flexWrap).
  side: {
    flex: '1 1 240px', minWidth: 220,
    borderLeft: '1px solid var(--color-divider)', paddingLeft: 'var(--sp-4)',
  },
  skeleton: { height: 44, flex: 1, borderRadius: 6, background: 'var(--color-bg)' },
  identity: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', minWidth: 0 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' },
  name: { fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  relationChip: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)',
    background: 'var(--color-primary-wash)', borderRadius: 6, padding: 'var(--sp-0-5) var(--sp-2)',
  },
  meta: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  metaItem: {},
  metaDot: { color: 'var(--color-divider)' },
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
    flexShrink: 0, alignSelf: 'flex-start', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)',
    background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 6, padding: 'var(--sp-0-5) var(--sp-2)',
  },
}
