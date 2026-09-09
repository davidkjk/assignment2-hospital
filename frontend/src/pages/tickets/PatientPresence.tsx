// [TICKET-DETAIL-PATIENT-PRESENCE-01·PATIENT-TYPING-01] 환자가 상담방을 열어 보는 중(viewing)·입력
// 중(typing)인지를 대화 상단에 작은 상태점+라벨로 보여준다(환자앱이 직원 상태를 표시하는 것과 대칭).
// 입력 중이 접속보다 우선(더 강한 신호). 둘 다 아니면 아무것도 그리지 않는다(막다른 상태 표시 금지).
// ⛔ 온라인 초록 점·상시 접속 단정이 아니다(TICKET-DETAIL-SCOPE-01) — 잠깐의 라이브 표시일 뿐이라
//    aria-live로만 알린다. 끔 신호 유실 대비 안전 타임아웃은 useTypingChannel이 처리한다.
export function PatientPresence({ typing, viewing }: { typing: boolean; viewing: boolean }) {
  if (!typing && !viewing) return null
  const label = typing ? '환자 입력 중' : '환자 접속 중'
  return (
    <span
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${typing ? 'bg-primary' : 'bg-muted-foreground/60'}`}
      />
      {label}
    </span>
  )
}
