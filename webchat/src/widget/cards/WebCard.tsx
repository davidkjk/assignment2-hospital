import type { PendingAction } from '../WebchatWidget';
import { TimeSelectCard, BookConfirmCard, BookDoneCard } from './BookingCards';
import { CancelConfirmCard, CancelDoneCard, CancelRejectCard } from './CancelCards';
import { QnrCard } from './QnrCard';
import { QuickReplies } from './QuickReplies';

export type CardContext = {
  isAnonymous: boolean;
  onAuthGate: (action: PendingAction) => void;                              // 익명 → WEBMOD-AUTH
  onExecute: (cardType: string, payload: Record<string, unknown>) => void;  // [신청]/[취소] 확정 실행
  onPick: (text: string) => void;                                           // 빠른답변 → 환자 말풍선 전송
  onReconsult: (payload: Record<string, unknown>) => void;                  // [다시 문의하기]
  onRebook: () => void;                                                      // [새로 예약하기]
  onHandoff?: () => void;                                                    // [직원에게 연결](WEBCHAT-NOANS) → 익명 인계 폼
};
export type CardProps = { p: Record<string, unknown>; ctx: CardContext };

// 셸은 카드의 알맹이를 모른다 — card_type만 읽어 슬롯에 넘기고 위젯 폭 래퍼로 감싼다(공통 원칙 9).
export function WebCard({ payload, ctx }: { payload: Record<string, unknown> | null | undefined; ctx: CardContext }) {
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
      default:                return null;
    }
  })();
  return <div className="webcard" data-card-type={payload.card_type as string}>{inner}</div>;
}
