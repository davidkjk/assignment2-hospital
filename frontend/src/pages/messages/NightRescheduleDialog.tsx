import { ConfirmDialog } from '../../components/ConfirmDialog'
import { HOSPITAL_TZ } from '../../lib/clock'

// [Task 28][SEND-NIGHT-02·03] 야간(21~08시) 광고 즉시발송은 막되 돌려보내지 않는다 —
//   「나중에 보내도록 예약할까요?」로 보낼 시각(내일 08:00)을 제안한다. 써 놓은 문구는 살아남는다.

interface Props {
  suggestedAt: string
  onReschedule: (isoAt: string) => void
  onCancel: () => void
}

function labelFor(iso: string): string {
  // 서버가 준 제안 시각은 KST(+09:00)다 — 직원 브라우저 시간대와 무관하게 KST로 보여준다.
  const hm = new Intl.DateTimeFormat('ko-KR', { // clock-ok — 바로 아래 줄에서 병원 시간대를 준다
    timeZone: HOSPITAL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
  return `내일 ${hm}`
}

export function NightRescheduleDialog({ suggestedAt, onReschedule, onCancel }: Props) {
  return (
    <ConfirmDialog
      title="나중에 보내도록 예약할까요?"
      message="밤(21시~다음날 8시)에는 광고성 안내를 보낼 수 없습니다. 써 두신 내용은 그대로 예약됩니다."
      confirmLabel={labelFor(suggestedAt)}
      cancelLabel="그만두기"
      onConfirm={() => onReschedule(suggestedAt)}
      onCancel={onCancel}
    />
  )
}
