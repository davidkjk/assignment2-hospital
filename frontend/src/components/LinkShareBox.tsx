import { useState, type CSSProperties } from 'react'

// [STAFF-INVITE-LINK-01·STAFF-REINVITE-LINK-01·STAFF-RESETPW-LINK-01·하이브리드] 관리자가 직접
// 전달할 '비밀번호 설정/재설정' 링크를 화면에 노출하는 공용 상자. 도메인 인증 후에는 메일도 자동
// 발송하지만(2026-09-07), 메일이 스팸·실패해도 관리자가 링크로 전달할 수 있게 링크를 함께 보인다
// (막다른 길 금지). 초대·재초대·비번재설정 세 곳이 같은 상자를 쓰고, guide 문구로 발송 여부를 알린다.
// ⛔ 읽기전용 — 관리자는 값을 고치는 게 아니라 복사만 한다. 복사 상태는 이 상자가 스스로 갖는다
//    (목록에서 행마다 한 개씩 떠도 서로 간섭하지 않게).

interface LinkShareBoxProps {
  /** 링크 입력칸의 이름표 — "초대 링크"·"재초대 링크"·"비밀번호 재설정 링크"처럼 맥락에 맞춘다. */
  label: string
  link: string
  /** 무엇을 하라는 한 줄 안내 — 맥락(초대/재설정)마다 다르다. */
  guide: string
}

export function LinkShareBox({ label, link, guide }: LinkShareBoxProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard?.writeText(link)
      setCopied(true)
    } catch {
      // 클립보드 접근이 막힌 환경 — 링크는 화면에 그대로 있으니 직접 선택해 복사할 수 있다(막다른 길 아님).
      setCopied(false)
    }
  }

  return (
    <div style={styles.linkBox}>
      <p style={styles.linkGuide}>{guide}</p>
      <div style={styles.linkRow}>
        <input aria-label={label} readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={styles.linkInput} />
        <button type="button" onClick={() => void copy()} style={styles.copyBtn}>
          링크 복사
        </button>
      </div>
      {copied && (
        <span role="status" style={styles.copied}>
          복사됐습니다
        </span>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  linkBox: {
    display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)',
    padding: 'var(--sp-3)', borderRadius: 8,
    border: '1px solid var(--color-primary)', background: 'var(--color-primary-wash)',
  },
  linkGuide: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink)' },
  linkRow: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'stretch' },
  linkInput: {
    flex: 1, minWidth: 0, height: 34, padding: '0 var(--sp-3)', borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
    color: 'var(--color-ink)', fontSize: 'var(--fs-caption)',
  },
  copyBtn: {
    flexShrink: 0, height: 34, padding: '0 var(--sp-4)', borderRadius: 8,
    border: '1px solid var(--color-primary)', background: 'var(--color-primary)',
    color: 'var(--color-on-primary, #fff)', fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  copied: { fontSize: 'var(--fs-caption)', color: 'var(--color-primary)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
}
