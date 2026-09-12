// ── 상태 배지 — 예약·티켓·직원·문서 상태를 색으로(색만으로 구분하지 않게 글자도 함께) ──
const TONE: Record<string, string> = {
  teal: 'bg-primary text-primary-foreground',
  sky: 'bg-sky-600 text-white',
  violet: 'bg-violet-600 text-white',
  amber: 'bg-amber-500 text-white',
  gray: 'bg-slate-500 text-white',
  slate: 'bg-slate-600 text-white',
  green: 'bg-emerald-600 text-white',
  red: 'bg-rose-600 text-white',
  soft: 'bg-muted text-muted-foreground',
}
export type BadgeTone = keyof typeof TONE

const STATUS_TONE: Record<string, BadgeTone> = {
  // 예약
  예약신청: 'amber',
  예약확정: 'teal',
  미도착: 'slate',
  도착: 'violet',
  '진료 대기': 'sky',
  '진료 중': 'teal',
  '진료 완료': 'gray',
  '환자 취소': 'amber',
  '병원 취소': 'amber',
  '예약 부도': 'slate',
  // 티켓·처리
  '처리 전': 'amber',
  '처리 중': 'sky',
  '처리 완료': 'green',
  대기: 'amber',
  진행: 'sky',
  완료: 'green',
  // 문서·직원
  공개: 'green',
  '검토 중': 'amber',
  임시저장: 'soft',
  비공개: 'soft',
  활성: 'green',
  휴직: 'soft',
  정지: 'gray',
}

export function StatusBadge({ status, tone }: { status: string; tone?: BadgeTone }) {
  const t = tone ?? STATUS_TONE[status] ?? 'gray'
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[t]}`}>
      {status}
    </span>
  )
}
