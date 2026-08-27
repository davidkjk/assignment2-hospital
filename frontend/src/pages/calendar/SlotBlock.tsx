import type { CSSProperties } from 'react'
import iconSpriteUrl from '../../shell/icons.svg?url'

// [CAL-SLOT-04] 모양은 셋뿐 — 점선(빈 시간)·색 블록(예약)·빗금(못 잡는 구간). 색은 보조 단서다.
//   ⭐ 모양을 늘리는 대신 글자를 읽게 한다(CAL-SLOT-04) — 빗금 안에서 휴진·점심은 글자로 갈린다.

/** 예약 블록에 얹는 경고 — 별도 화면이 아니라 캘린더 상태로 흡수한다(MR2-10). */
export type SlotWarning = 'affected' | 'overlap' | 'support'

export type SlotDescriptor =
  | { kind: 'empty'; label: string }
  | { kind: 'past-empty'; label: string }
  | { kind: 'hatched'; label: string }
  | {
      kind: 'booked'
      patientLabel: string
      statusLabel: string
      /** 팔레트의 몇 번째(CAL-COLOR-09) — 색값이 아니라 인덱스를 읽어 칠한다. */
      paletteIndex: number
      /** 쉬는 틈 없이 붙은 앞 예약이 있으면 흰 실선으로 가른다(CAL-COLOR-14). */
      backToBack?: boolean
      warnings?: SlotWarning[]
    }

const WARNING_LABEL: Record<SlotWarning, string> = {
  affected: '확인 필요', // CAL-SLOT-05 — 일정 변경 영향 예약
  overlap: '겹침', // CAL-GAP-07 — 알고 겹쳐 저장한 예약
  support: '상담', // SUPPORT-CAL-WARN-01 — 마감 후 취소·변경 상담
}

function WarnIcon() {
  // ⛔ 이모지 금지 — SVG symbol을 재사용한다.
  return (
    <svg className="slot-badge-icon" aria-hidden="true" width="12" height="12">
      <use href={`${iconSpriteUrl}#warning`} />
    </svg>
  )
}

export function SlotBlock({ block }: { block: SlotDescriptor }) {
  if (block.kind === 'empty') {
    return (
      <div className="cal-slot is-dotted" data-testid="slot">
        {block.label}
      </div>
    )
  }
  if (block.kind === 'past-empty') {
    // [CAL-PAST-01] 흐리게 두고 「지난 시간」이라 적는다 — 눌러도 전화예약이 열리지 않는다.
    return (
      <div className="cal-slot is-dotted is-past" data-testid="slot">
        {block.label}
      </div>
    )
  }
  if (block.kind === 'hatched') {
    // [CAL-SLOT-03·08] 휴진·점심은 같은 빗금, 글자만 다르다.
    return (
      <div className="cal-slot is-hatched" data-testid="slot">
        {block.label}
      </div>
    )
  }

  // [CAL-COLOR-14] 예약 = 중간 톤 면 + 진한 글자, 색 테두리 없음. 연속 예약은 흰 실선 1px로 가른다.
  // 색 테두리를 두르지 않는다(CAL-COLOR-14) — 아래 style에 border 계열을 넣지 않는 것이 그 규칙이다.
  const style: CSSProperties = {
    background: `var(--doctor-palette-${block.paletteIndex}-fill)`,
    color: `var(--doctor-palette-${block.paletteIndex})`,
  }
  if (block.backToBack) style.boxShadow = '0 1px 0 #fff'

  return (
    <div className="cal-slot is-filled" data-testid="slot" style={style}>
      <span className="cal-slot-patient">{block.patientLabel}</span>
      <span className="cal-slot-status">{block.statusLabel}</span>
      {block.warnings?.map((w) => (
        // [CAL-COLOR-15] 배지는 흰 바탕 pill이라 어느 면 위에서도 뜬다.
        <span
          key={w}
          className="cal-slot-badge"
          data-testid="slot-badge"
          style={{ background: 'var(--color-surface)' }}
        >
          <WarnIcon />
          {WARNING_LABEL[w]}
        </span>
      ))}
    </div>
  )
}
