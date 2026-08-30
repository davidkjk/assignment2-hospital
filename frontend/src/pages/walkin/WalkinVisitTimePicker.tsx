import { hospitalHHMM, hospitalInstant, hospitalToday } from '../../lib/clock'
import { useState, type CSSProperties } from 'react'

/**
 * 당일 방문(워크인)의 「오신 시각」 — 한 화면의 세 번째 줄(QUEUE-WALK-14·19).
 *
 * ⭐ 기본이 「지금」이라 평소에는 손댈 것이 없다(QUEUE-WALK-14). 「지난 시각」을 고르면 숫자로 친다
 *    — `1015`→10:15, 콜론을 안 쳐도 되고 3자리 `905`→09:05도 받는다(QUEUE-WALK-14b·14c).
 * ⛔ 5분 격자에 스냅하지 않는다(QUEUE-WALK-14d) — `10:07`은 그대로 `10:07`. 예약은 앞으로 만드는
 *    자리라 붙여도 되지만, 방문 시각은 실제로 일어난 일의 기록이라 붙이는 순간 거짓이 된다.
 * ⚠️ 지금보다 뒤는 못 고른다(QUEUE-WALK-16) — 그 자리에서 바로 알리고 입력을 지우지 않는다
 *    (QUEUE-WALK-14e). 저장할 때까지 미루지 않는다.
 *
 * 「지난 날」(어제 이전)은 줄을 세우는 일이 아니라 지나간 일을 기록하는 다른 흐름이고(QUEUE-WALK-22),
 * 그 저장은 갭 #86(워크인의 과거 상태)이 열려야 성립하므로 이 위젯의 범위 밖이다.
 *
 * 결과 계약: onChange({ iso, error }). iso=null·error=null 이면 「지금」(방문 시각을 따로 남기지
 *   않는다 — created_at이 곧 지금이다). 「지난 시각」이 올바르면 iso=오늘 그 시각의 ISO 문자열,
 *   미래·형식오류면 iso=null·error=문구.
 */

export interface WalkinVisitTimeResult {
  iso: string | null
  error: string | null
}

interface Props {
  onChange: (result: WalkinVisitTimeResult) => void
  /** 테스트·SSR 안정용 기준 시각. 없으면 현재 시각. */
  now?: Date
}

type Mode = 'now' | 'earlier'

export function WalkinVisitTimePicker({ onChange, now }: Props) {
  const [mode, setMode] = useState<Mode>('now')
  const [text, setText] = useState('')
  const base = now ?? new Date()

  function emit(nextMode: Mode, nextText: string) {
    if (nextMode === 'now') {
      onChange({ iso: null, error: null })
      return
    }
    onChange(resolveEarlier(nextText, base))
  }

  function pick(nextMode: Mode) {
    setMode(nextMode)
    emit(nextMode, text)
  }

  function onText(value: string) {
    setText(value)
    emit('earlier', value)
  }

  const result = mode === 'earlier' ? resolveEarlier(text, base) : { iso: null, error: null }

  return (
    <fieldset style={styles.fieldset}>
      <legend style={styles.legend}>오신 시각</legend>

      <label style={styles.option}>
        <input type="radio" name="walkin-visit" checked={mode === 'now'} onChange={() => pick('now')} />
        <span style={styles.optionText}>지금</span>
      </label>

      <label style={styles.option}>
        <input type="radio" name="walkin-visit" checked={mode === 'earlier'} onChange={() => pick('earlier')} />
        <span style={styles.optionText}>지난 시각 — 오늘</span>
        <input
          type="text"
          inputMode="numeric"
          aria-label="오신 시각(오늘)"
          placeholder="예: 1015"
          value={text}
          disabled={mode !== 'earlier'}
          onChange={(e) => onText(e.target.value)}
          style={styles.timeInput}
        />
        {mode === 'earlier' && result.iso && (
          <span style={styles.preview} aria-hidden="true">{hhmmOf(result.iso)}</span>
        )}
      </label>

      {mode === 'earlier' && result.error && (
        <p role="alert" style={styles.error}>{result.error}</p>
      )}
    </fieldset>
  )
}

/** `1015`/`905`/`10:07` → 오늘 그 시각. 미래·형식오류면 iso=null + 문구. 5분 스냅 없음. */
export function resolveEarlier(text: string, base: Date): WalkinVisitTimeResult {
  const digits = text.replace(/\D/g, '')
  if (digits.length === 0) return { iso: null, error: null } // 아직 안 침 — 오류로 보채지 않는다.
  if (digits.length < 3 || digits.length > 4) {
    return { iso: null, error: '시각을 3~4자리 숫자로 입력하세요 (예: 1015).' }
  }
  const hh = digits.length === 3 ? Number(digits[0]) : Number(digits.slice(0, 2))
  const mm = digits.length === 3 ? Number(digits.slice(1)) : Number(digits.slice(2))
  if (hh > 23 || mm > 59) return { iso: null, error: '올바른 시각이 아닙니다.' }

  // ⭐ 직원이 친 시각은 **병원 시각**이다(`TIME-TZ-01`) — `setHours`는 그 PC의 시간대로
  //    해석해, 창구 PC가 한국이 아니면 **저장되는 순간 자체가 틀린다**(표시만 틀리는 것과 다르다).
  //    스냅하지 않는다 — 친 분을 그대로 둔다(QUEUE-WALK-14d).
  const visit = hospitalInstant(hospitalToday(base), hh, mm)
  if (visit.getTime() > base.getTime()) {
    // QUEUE-WALK-14e·16: 그 자리에서 바로 알리고 입력을 지우지 않는다.
    return { iso: null, error: '아직 오지 않은 시각입니다.' }
  }
  return { iso: visit.toISOString(), error: null }
}

function hhmmOf(iso: string): string {
  return hospitalHHMM(new Date(iso))
}

const styles: Record<string, CSSProperties> = {
  fieldset: { border: '1px solid var(--color-divider)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, margin: 0 },
  legend: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)', padding: '0 4px' },
  option: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  optionText: { fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  timeInput: {
    height: 32, width: 96, padding: '0 8px', borderRadius: 8, border: '1px solid var(--color-divider)',
    fontSize: 'var(--fs-body)', fontVariantNumeric: 'tabular-nums', marginLeft: 4,
  },
  preview: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' },
  error: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-warn)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
}
