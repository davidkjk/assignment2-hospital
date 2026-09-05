import { useState, type CSSProperties } from 'react'
import { BusyButton } from '../../components/BusyButton'
import { InlineError } from '../../components/InlineError'
import { IdentityConfirmDialog } from '../../components/IdentityConfirmDialog'
import { useSearchPatients } from '../patients/useSearchPatients'
import {
  confirmFamilyLinkOtp,
  linkFamilyMember,
  requestFamilyLinkOtp,
  verifyFamilyEligibility,
  type SearchPatientRow,
} from '../../api/patients'

// [PTDET-FAMILY-03~06][결정 #3 본인확인부] 직원이 가족을 연결하는 실 흐름.
//   같은 화면에서: 대상 B 검색 → 동명이인 재확인(SEARCH-SAME-01) → 관계 입력 → [본인 확인으로 이동].
//   그 순간 서버가 B의 「등록 전화번호 유무」를 판정한다(화면이 정하지 않는다, FAMILY-03·04) —
//     번호 있으면 OTP 본인확인(04), 없으면 대면·서류 예외(05)로 자동 분기.
//   OTP 화면엔 [등록 번호가 없나요?] 입구를 두되, 누르면 서버가 다시 판정한다(우회 차단, FAMILY-04):
//     여전히 번호가 있으면 서버 문장을 그대로 보이며 04에 머물고, 번호가 없을 때만 05로 넘어간다.
//   연결이 저장되면(OTP·예외 무관) 서버가 B에게 통보한다(㉢, FAMILY-06) — 화면은 부르지 않는다.
//
// ⚠️ 본인확인 판정을 화면에 두지 않는다 — 화면이 정하면 요청을 직접 만들어 우회한다. 화면은 서버 판정을
//    받아 갈래만 보여준다. 실패(쿨다운 429·만료·틀린 코드 등)는 서버 문장을 그대로 패널에 남긴다(조용한 먹통 금지).

type Step = 'search' | 'relation' | 'otp' | 'exception'
type ExceptionMethod = 'in_person' | 'document'

interface FamilyLinkPanelProps {
  /** 계정 소유자 A(현재 상세 화면의 환자). B를 여기에 연결한다. */
  accountPatientId: string
  /** 연결 성공 후 — 페이지가 가족 목록을 새로 읽고 패널을 닫는다. */
  onDone: () => void
}

export function FamilyLinkPanel({ accountPatientId, onDone }: FamilyLinkPanelProps) {
  const search = useSearchPatients()
  const [step, setStep] = useState<Step>('search')
  const [pending, setPending] = useState<SearchPatientRow | null>(null) // 동명이인 재확인 대기
  const [selected, setSelected] = useState<SearchPatientRow | null>(null) // 확인된 대상 B
  const [relation, setRelation] = useState('')
  const [code, setCode] = useState('')
  const [method, setMethod] = useState<ExceptionMethod>('in_person')
  const [error, setError] = useState<string | null>(null)
  // [FAMILY-04] OTP 화면에서 예외 입구를 눌렀을 때 서버가 「전환 불가」로 돌려준 문장(그대로 보인다).
  const [eligibilityMessage, setEligibilityMessage] = useState<string | null>(null)

  function errMsg(e: unknown, fallback: string): string {
    return e instanceof Error ? e.message : fallback
  }

  // ── 관계 입력 → 서버 판정 → 갈래 분기(FAMILY-03) ────────────────────────────
  async function goVerify() {
    if (!selected) return
    if (!relation.trim()) {
      setError('관계를 입력해 주세요.')
      return
    }
    setError(null)
    setEligibilityMessage(null)
    try {
      const res = await verifyFamilyEligibility(accountPatientId, selected.patient_id)
      if (res.allowed) {
        // B 등록 번호 없음 → 예외 경로(대면·서류).
        setStep('exception')
      } else {
        // B 등록 번호 있음 → OTP 본인확인. 그 번호로 인증번호를 바로 보낸다.
        await requestFamilyLinkOtp(accountPatientId, selected.patient_id, relation.trim())
        setStep('otp')
      }
    } catch (e) {
      setError(errMsg(e, '본인 확인을 시작하지 못했습니다.'))
    }
  }

  // ── OTP: 다시 받기 ─────────────────────────────────────────────────────────
  async function resend() {
    if (!selected) return
    setError(null)
    try {
      await requestFamilyLinkOtp(accountPatientId, selected.patient_id, relation.trim())
    } catch (e) {
      setError(errMsg(e, '인증번호를 다시 보내지 못했습니다.'))
    }
  }

  // ── OTP: 확인 ──────────────────────────────────────────────────────────────
  async function confirmOtp() {
    if (!selected) return
    setError(null)
    try {
      await confirmFamilyLinkOtp(accountPatientId, selected.patient_id, code.trim())
      onDone()
    } catch (e) {
      // 실패하면 연결하지 않는다 — onDone을 부르지 않고 원인을 패널 안에 남긴다.
      setError(errMsg(e, '인증에 실패했습니다.'))
    }
  }

  // ── OTP → 예외 입구(FAMILY-04): 서버가 다시 판정, 여전히 번호 있으면 04에 머문다 ──
  async function tryException() {
    if (!selected) return
    setError(null)
    try {
      const res = await verifyFamilyEligibility(accountPatientId, selected.patient_id)
      if (res.allowed) {
        setEligibilityMessage(null)
        setStep('exception')
      } else {
        // 우회 차단 — 서버 문장을 그대로 보이며 OTP에 머문다.
        setEligibilityMessage(res.message)
      }
    } catch (e) {
      setError(errMsg(e, '다시 확인하지 못했습니다.'))
    }
  }

  // ── 예외 경로: 대면·서류 확인 후 연결 ───────────────────────────────────────
  async function linkByException() {
    if (!selected) return
    setError(null)
    try {
      await linkFamilyMember(accountPatientId, selected.patient_id, relation.trim(), method)
      onDone()
    } catch (e) {
      setError(errMsg(e, '연결하지 못했습니다.'))
    }
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────────
  if (step === 'search') {
    return (
      <div style={styles.wrap}>
        <p style={styles.hint}>연결할 가족(대상)을 검색해 고르세요.</p>
        <input
          value={search.query}
          onChange={(e) => search.onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search.onEnter()}
          placeholder="이름·전화·생년월일로 검색"
          style={styles.input}
          autoFocus
        />
        {search.searching && <p style={styles.muted}>찾는 중…</p>}
        {!search.searching && search.hasSearched && search.rows.length === 0 && (
          <p style={styles.muted}>검색 결과가 없습니다.</p>
        )}
        <ul style={styles.results}>
          {search.rows.map((r) => (
            <li key={r.patient_id}>
              <button type="button" onClick={() => setPending(r)} style={styles.resultBtn}>
                <span style={styles.name}>{r.name}</span>
                <span style={styles.meta}>{r.masked_birth_date}</span>
                <span style={styles.meta}>{r.masked_phone}</span>
              </button>
            </li>
          ))}
        </ul>
        {search.hasMore && (
          <button type="button" onClick={search.loadMore} style={styles.moreBtn} disabled={search.loadingMore}>
            {search.loadingMore ? '불러오는 중…' : '더 보기'}
          </button>
        )}

        {/* [SEARCH-SAME-01] 고른 뒤 항상 동명이인 재확인을 거친다 — 검색에서 골랐다고 면제하지 않는다. */}
        {pending && (
          <IdentityConfirmDialog
            patient={{ name: pending.name, birthDate: pending.masked_birth_date, phone: pending.masked_phone }}
            confirmLabel="이 사람 선택"
            onConfirm={() => {
              setSelected(pending)
              setPending(null)
              setStep('relation')
            }}
            onCancel={() => setPending(null)}
          />
        )}
      </div>
    )
  }

  // 선택된 B의 신원 요약(모든 후속 단계 상단에 공통으로 보인다).
  const selectedSummary = selected && (
    <div style={styles.selected}>
      <span style={styles.name}>{selected.name}</span>
      <span style={styles.meta}>{selected.masked_birth_date}</span>
      <span style={styles.meta}>{selected.masked_phone}</span>
    </div>
  )

  if (step === 'relation') {
    return (
      <div style={styles.wrap}>
        {selectedSummary}
        <label style={styles.field}>
          관계
          <input
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            placeholder="예: 배우자·자녀·부·모"
            style={styles.input}
            autoFocus
          />
        </label>
        {error && <InlineError message={error} />}
        <div style={styles.actions}>
          <button type="button" onClick={() => setStep('search')} style={styles.ghost}>
            다시 검색
          </button>
          <BusyButton label="본인 확인으로 이동" busyLabel="확인 중…" onClick={goVerify} />
        </div>
      </div>
    )
  }

  if (step === 'otp') {
    return (
      <div style={styles.wrap}>
        {selectedSummary}
        <p style={styles.hint}>
          <b style={styles.strong}>{selected?.masked_phone}</b> 로 인증번호를 보냈습니다. 대상자 휴대폰에 온 6자리를 입력하세요.
        </p>
        <label style={styles.field}>
          인증번호
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={styles.input}
            inputMode="numeric"
            autoFocus
          />
        </label>
        {eligibilityMessage && <InlineError message={eligibilityMessage} />}
        {error && <InlineError message={error} />}
        <div style={styles.actions}>
          <button type="button" onClick={resend} style={styles.ghost}>
            다시 받기
          </button>
          <BusyButton label="확인" busyLabel="확인 중…" onClick={confirmOtp} />
        </div>
        {/* [FAMILY-04] 예외 입구 — 누르면 서버가 B 번호 유무를 다시 판정한다(우회 차단). */}
        <button type="button" onClick={tryException} style={styles.linkBtn}>
          등록 번호가 없나요?
        </button>
      </div>
    )
  }

  // step === 'exception'
  return (
    <div style={styles.wrap}>
      {selectedSummary}
      <p style={styles.hint}>등록된 전화번호가 없어 대면·서류로 본인을 확인합니다. 확인 방법을 고르세요.</p>
      <fieldset style={styles.fieldset}>
        <label style={styles.radio}>
          <input
            type="radio"
            name="family-exc-method"
            checked={method === 'in_person'}
            onChange={() => setMethod('in_person')}
          />
          대면 확인
        </label>
        <label style={styles.radio}>
          <input
            type="radio"
            name="family-exc-method"
            checked={method === 'document'}
            onChange={() => setMethod('document')}
          />
          가족관계증명서 확인
        </label>
      </fieldset>
      {error && <InlineError message={error} />}
      <div style={styles.actions}>
        <button type="button" onClick={() => setStep('relation')} style={styles.ghost}>
          이전
        </button>
        <BusyButton label="연결" busyLabel="연결 중…" onClick={linkByException} />
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  hint: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  strong: { fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  muted: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  input: {
    height: 34, padding: '0 var(--sp-3)', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-body)',
  },
  results: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 260, overflowY: 'auto' },
  resultBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 40,
    padding: 'var(--sp-2) var(--sp-2)', border: 'none', borderTop: '1px solid var(--color-divider)',
    background: 'transparent', color: 'var(--color-ink)', cursor: 'pointer', textAlign: 'left',
  },
  moreBtn: {
    alignSelf: 'flex-start', height: 30, padding: '0 var(--sp-3)', borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
    color: 'var(--color-primary)', fontSize: 'var(--fs-caption)', cursor: 'pointer',
  },
  selected: {
    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)',
    background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 8,
  },
  name: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  meta: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  fieldset: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', border: 'none', margin: 0, padding: 0 },
  radio: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--fs-body)', color: 'var(--color-ink)', cursor: 'pointer' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' },
  ghost: {
    height: 34, padding: '0 var(--sp-3)', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  linkBtn: {
    alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0,
    color: 'var(--color-primary)', fontSize: 'var(--fs-caption)', textDecoration: 'underline', cursor: 'pointer',
  },
}
