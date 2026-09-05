import type { AppointmentStatus } from '@/mock/types'

// 상태 배지 1세트 — 홈·예약·이력이 모두 같은 배지를 쓴다(부품 통일).
// 채운 색으로 상태를 구분(어르신 가독성·플랫 테마에서 또렷).
export type BadgeTone = 'teal' | 'amber' | 'sky' | 'violet' | 'gray' | 'muted'

const TONE: Record<BadgeTone, string> = {
  teal: 'bg-primary text-primary-foreground',
  amber: 'bg-amber-500 text-white',
  sky: 'bg-sky-600 text-white',
  violet: 'bg-violet-600 text-white',
  gray: 'bg-slate-500 text-white',
  muted: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ label, tone = 'muted' }: { label: string; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[tone]}`}
    >
      {label}
    </span>
  )
}

/** 앞으로의 예약 상태(예약확정/신청/진료대기/접수완료) → 배지 색. */
export function appointmentTone(status: AppointmentStatus): BadgeTone {
  switch (status) {
    case '예약확정':
      return 'teal'
    case '예약신청':
      return 'amber'
    case '진료대기':
      return 'sky'
    case '접수완료':
      return 'violet'
  }
}
