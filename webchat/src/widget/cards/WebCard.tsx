import type { PendingAction } from '../WebchatWidget';
import { TimeSelectCard, BookConfirmCard, BookDoneCard } from './BookingCards';
import { CancelConfirmCard, CancelDoneCard, CancelRejectCard } from './CancelCards';
import { DeptSelectCard, DoctorSelectCard, DateSelectCard, TargetSelectCard, ReasonCard } from './FlowCards';
import { QnrCard } from './QnrCard';
import { QuickReplies } from './QuickReplies';

export type NavAction = { kind: string; payload: Record<string, unknown> };  // 예약 앞흐름 카드 탭

export type CardContext = {
  isAnonymous: boolean;
  onAuthGate: (action: PendingAction) => void;                              // 익명 → WEBMOD-AUTH
  onExecute: (cardType: string, payload: Record<string, unknown>) => void;  // [신청]/[취소] 확정 실행
  onPick: (text: string) => void;                                           // 빠른답변 → 환자 말풍선 전송
  onReconsult: (payload: Record<string, unknown>) => void;                  // [다시 문의하기]
  onRebook: () => void;                                                      // [새로 예약하기]
  onHandoff?: () => void;                                                    // [직원에게 연결](WEBCHAT-NOANS) → 익명 인계 폼
  onNavigate?: (action: NavAction) => void;                                 // 예약 앞흐름 다음 단계(진료과→의사→날짜→대상→방문이유)
};
export type CardProps = { p: Record<string, unknown>; ctx: CardContext };

// 셸은 카드의 알맹이를 모른다 — card_type만 읽어 슬롯에 넘기고 위젯 폭 래퍼로 감싼다(공통 원칙 9).
// 카드 머리 제목(꼬리표)은 widget.css의 `.webcard[data-card-type=…]::before`가 card_type으로 붙인다(단일 출처).
// interactive=false면 지난 단계의 카드다 — 읽기 기록으로만 두고 다시 누르지 못하게 막는다(WEBCARD-BOOKDONE-03을
//   흐름 카드 전체로 확장). 지난 시간 칩을 다시 눌러 로그인 관문이 또 뜨거나, 지난 선택 카드가 새 카드를 덧붙여
//   대화가 밀리던 버그를 막는다. inert는 마우스·키보드·포커스를 모두 차단한다(React 18은 ref로 토글).
export function WebCard({ payload, ctx, interactive = true }: { payload: Record<string, unknown> | null | undefined; ctx: CardContext; interactive?: boolean }) {
  if (!payload || typeof payload.card_type !== 'string') return null;
  const inner = (() => {
    switch (payload.card_type) {
      case 'time_select':     return <TimeSelectCard p={payload} ctx={ctx} />;
      case 'booking_confirm': return <BookConfirmCard p={payload} ctx={ctx} />;
      case 'booking_done':    return <BookDoneCard p={payload} ctx={ctx} />;
      case 'cancel_confirm':  return <CancelConfirmCard p={payload} ctx={ctx} />;
      case 'cancel_done':     return <CancelDoneCard p={payload} ctx={ctx} />;
      case 'cancel_reject':   return <CancelRejectCard p={payload} ctx={ctx} />;
      case 'questionnaire':   return <QnrCard p={payload} ctx={ctx} />;
      case 'quick_replies':   return <QuickReplies p={payload} ctx={ctx} />;
      case 'department_select': return <DeptSelectCard p={payload} ctx={ctx} />;
      case 'doctor_select':     return <DoctorSelectCard p={payload} ctx={ctx} />;
      case 'date_select':       return <DateSelectCard p={payload} ctx={ctx} />;
      case 'target_select':     return <TargetSelectCard p={payload} ctx={ctx} />;
      case 'reason_input':      return <ReasonCard p={payload} ctx={ctx} />;
      default:                return null;
    }
  })();
  if (inner === null) return null;   // 알 수 없는 카드는 제목만 덩그러니 남기지 않는다
  return (
    <div
      className={interactive ? 'webcard' : 'webcard webcard--past'}
      data-card-type={payload.card_type as string}
      // React 18은 inert prop이 없어 ref로 attribute를 토글한다(지난 카드=상호작용 완전 차단).
      ref={(el) => { el?.toggleAttribute('inert', !interactive); }}
    >
      {inner}
    </div>
  );
}
