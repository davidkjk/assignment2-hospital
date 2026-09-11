import { useState, useEffect, type ReactNode } from 'react';
import type { WebchatApi, ThreadMessage } from '../api/webchatApi';
import { useWebchat } from '../state/useWebchat';
import { Launcher } from './Launcher';
import { ChatRoom } from './ChatRoom';
import { GuideBanner } from './GuideBanner';
import { HandoffBadge } from './HandoffBadge';
import { UrgentNotice } from './UrgentNotice';
import { OutageNotice } from './OutageNotice';
import { useStaffPresence } from './useStaffPresence';

export type PendingAction = { kind: 'view_my_appointments' | 'book' | 'cancel' | 'pick_target'; payload?: Record<string, unknown> };
export type HandoffSummary = { threadId: string; summary: string[] };
export type CardSlot = {
  send: (text: string) => void;   // 카드가 빠른답변을 환자 말풍선으로 보낼 통로(Task 15)
  onHandoff: () => void;          // no_answer 카드의 [직원에게 연결] → 익명 인계 폼(WEBCHAT-NOANS)
};
export type WidgetProps = {
  api: WebchatApi;
  hospitalPhone: string;
  onAuthGate: (action: PendingAction) => void;      // → WEBMOD-AUTH(Task 15)
  onHandoffNeeded: (summary: HandoffSummary) => void; // → WEBANON-HANDOFF(Task 15)
  renderCard: (payload: Record<string, unknown> | null | undefined, slot: CardSlot, interactive: boolean) => ReactNode; // → WEBCARD(Task 15) · interactive=지난 카드 잠금
  onReset?: () => void;                              // [WEBCHAT-NEW-01] 새 상담 시 앱 레벨 상태(예약 카드·로그인)까지 비운다
  extraCards?: ThreadMessage[]; // 재확인 카드 [신청]/[취소] 실행 결과(booking_done·cancel_done 등)를 피드 끝에 얹는다(CCARD-BOOKDONE-SHOW-01). 재열기해도 살아남음(WEBCARD-BOOKDONE-03)
  open?: boolean;                                   // 제어 모드(홈페이지 iframe이 host:setOpen으로 연다). 없으면 자체 상태로 연다(단독 배포).
  onOpenChange?: (open: boolean) => void;           // 열림 상태 변화를 부모에 통지(WebchatApp이 webchat:setOpen 송신)
  onUnreadChange?: (hasUnread: boolean) => void;    // 미읽음(직원 답변 도착) 변화를 부모에 통지(webchat:unread 송신)
};

export function WebchatWidget({ api, hospitalPhone, onAuthGate, onHandoffNeeded, renderCard, onReset, extraCards = [], open: openProp, onOpenChange, onUnreadChange }: WidgetProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;               // 제어 모드면 부모 값, 아니면 자체 상태
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };
  // 타이핑 "직원 연결" 즉시 인계(route_taken=handoff, ⓪-b)를 칩·카드·장애와 같은 익명 인계 폼(WEBANON-HANDOFF)으로 연결한다.
  const w = useWebchat(api, {
    onHandoffRequested: (threadId) => onHandoffNeeded({ threadId, summary: [] }),
  });
  const hasUnread = w.handoff.phase === 'answered';
  // [WEBCHAT-NEW-01] 새 상담(리셋). 진행 중 직원 상담(인계 활성=phase 있고 종료 아님)일 땐 실수로 대화를
  //   버리지 않도록 확인창으로 감싼다(사용자 결정 2026-09-10). 그 외엔 바로 새로 시작.
  const [confirmNew, setConfirmNew] = useState(false);
  const handoffActive = w.handoff.phase !== null && w.handoff.closed !== true;
  // 새 상담 = 완전한 새 출발. 스레드(useWebchat)뿐 아니라 앱 레벨 상태(예약 흐름 카드·완료 카드·로그인)도 함께 비운다
  //   — 안 그러면 지난 예약 카드가 새 대화에 그대로 남는다(사용자 제보).
  const doStartNew = () => { onReset?.(); void w.startNew(); };
  const requestNewChat = () => { if (handoffActive) setConfirmNew(true); else doStartNew(); };
  const confirmNewChat = () => { setConfirmNew(false); doStartNew(); };
  // Q18③: 직원이 상담 상세를 실제로 열어 보는 중이면 배지가 "직원이 확인 중이에요"로(열람 presence).
  // [CHAT-ROOM-PATIENT-TYPING-01] 방향은 양쪽 — 같은 훅이 이 위젯(환자)의 입력 중을 직원에게 보낼 notifyTyping도 준다.
  // [CHAT-STREAM-01] 봇 답 스트리밍(bot_typing/delta/done)도 같은 채널로 받아 useWebchat에 반영한다.
  const { staffViewing, staffTyping, notifyTyping } = useStaffPresence(w.session?.threadId, {
    onBotTyping: w.applyBotTyping,
    onBotDelta: w.applyBotDelta,
    onBotDone: w.applyBotDone,
    onStaffMessage: w.applyStaffMessage,   // [CHAT-STREAM-STAFF-MSG-01] 인계 후 직원 답장 → 피드에 표시
  });
  // 진행 중 스트리밍 버블을 messages 뒤에 합성한다(ChatRoom 무변경 — 합성만). done이 확정 말풍선으로 대체.
  const streamBubble = w.streaming
    ? [{ id: `stream-${w.streaming.gen}`, senderType: 'bot' as const, messageType: 'text' as const, content: w.streaming.text }]
    : [];
  // 장애 중 [문의 남기기] → 익명 인계 폼(WEBCHAT-OUTAGE-02) — 봇 응답 없이 기존 대화 문맥으로 직원에게 연결.
  const leaveInquiry = () => { if (w.session) onHandoffNeeded({ threadId: w.session.threadId, summary: [] }); };
  // [다시 시도] = 마지막 실패 메시지의 전송 왕복(CHAT-OUTAGE-RECOVER-01: 성공하면 배너가 걷힌다).
  const lastFailed = [...w.messages].reverse().find((m) => m.sendState === 'failed');
  const openSession = w.open;                        // 안정 useCallback(=[api])
  // 열림으로 전이될 때마다 세션 확보(기존 openRoom = setOpen(true)+w.open() 동작을 그대로 보존).
  useEffect(() => { if (open) openSession(); }, [open, openSession]);
  useEffect(() => { onUnreadChange?.(hasUnread); }, [hasUnread, onUnreadChange]);

  return (
    <>
      <Launcher open={open} hasUnread={hasUnread} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} />
      {open && (
        <div className="wc-panel">
          {/* 닫기(×)는 이제 ChatRoom 헤더 우측 클러스터로 옮겼다([WEBCHAT-CLOSE-01]) — 패널 중앙에 떠 있던 옛 wc-close 제거. */}
          {/* [WEBCHAT-NEW-01] 진행 중 직원 상담을 새 상담이 덮기 전 확인 — 되돌릴 수 없는 이탈은 확인창 안에서만. */}
          {confirmNew && (
            <div className="wc-confirm" role="dialog" aria-modal="true" aria-labelledby="wc-confirm-title">
              <div className="wc-confirm__box">
                <p id="wc-confirm-title" className="wc-confirm__title">새 상담을 시작할까요?</p>
                <p className="wc-confirm__msg">직원 상담이 진행 중이에요. 새로 시작하면 이 대화에서 나가고, 직원 답은 이 창에서 더는 볼 수 없어요.</p>
                <div className="wc-confirm__actions">
                  <button type="button" className="wc-confirm__cancel" onClick={() => setConfirmNew(false)}>취소</button>
                  <button type="button" className="wc-confirm__go" onClick={confirmNewChat}>새로 시작</button>
                </div>
              </div>
            </div>
          )}
          <ChatRoom
            phase={w.phase}
            onNewChat={requestNewChat}       // [WEBCHAT-NEW-01] 헤더 '새 상담'(인계 중이면 확인창)
            onClose={() => setOpen(false)}   // [WEBCHAT-CLOSE-01] 헤더 '닫기' → 호스트로 setOpen:false(홈페이지가 패널 닫음)
            messages={[...w.messages, ...streamBubble, ...extraCards]}
            botTyping={w.botTyping && !w.streaming}   // 델타가 시작되면 점 대신 흐르는 텍스트를 보여준다
            onTyping={notifyTyping}         // [CHAT-ROOM-PATIENT-TYPING-01] 입력 중 → 직원에게 "환자 입력 중"
            onStaffHandoff={leaveInquiry}   // Q5: 최근 봇 답변 밑 [직원에게 연결] 칩 → 익명 인계 폼
            onSend={w.send}
            onResend={w.resend}
            onRetryLoad={w.retryLoad}
            guideSlot={<GuideBanner active={w.guide.active} text={w.guide.text} />}
            // 인계 배지는 실제 인계가 시작(phase 확정)되거나 조회 실패일 때만 — 그 전엔 "상태 확인 중…"을 상시 노출하지 않는다.
            handoffSlot={(w.handoff.phase !== null || w.handoff.loadError)
              ? <HandoffBadge status={w.handoff} staffViewing={staffViewing} staffTyping={staffTyping} onRetry={() => api.fetchHandoff(w.session!.threadId).then(w.setHandoff)} />
              : null}
            // 긴급 안내(WEBCHAT-URGENT) — 감지 시 대화 위 고정 배너. 예약 CTA·연락처 수집은 함께 두지 않는다(URGENT-03·04).
            urgentSlot={w.urgent ? <UrgentNotice bookingCtaVisible={false} contactRequested={false} /> : null}
            // AI 장애 안내(WEBCHAT-OUTAGE) — 병원 전화·[문의 남기기]가 주 경로. 실패 말풍선(재전송=복구 왕복)과 공존.
            outageSlot={w.outage ? (
              <OutageNotice
                phase={w.outage} hospitalPhone={hospitalPhone}
                onLeaveInquiry={leaveInquiry}
                onRetry={() => { if (lastFailed?.clientMessageId) w.resend(lastFailed.clientMessageId); }} />
            ) : null}
            // 첫 상담(빈 피드) 시작 안내 — 봇 인사말 + 시작 고정 칩(WEBCHAT-ROOM-03·WEBCARD-QUICK-01). 대화 시작 후엔 ChatRoom이 감춘다.
            //   진료시간·예약 방법·오시는 길 = 문장 그대로 환자 말풍선으로 전송(WEBCARD-QUICK-02).
            //   내 예약 조회 = 로그인 필요 → 관문(WEBMOD-AUTH-01) / 직원에게 문의 = 인계 폼(WEBANON-HANDOFF, 사람에게 닿는 칩이라 채움형).
            startSlot={<div className="wc-start">
              <p className="wc-msg wc-msg--bot wc-start__hi">안녕하세요, 무엇을 도와드릴까요?</p>
              <div className="wc-quick wc-quick--start" aria-label="빠른 시작">
                {/* [F1] 웹에서도 상담창 안에서 바로 예약할 수 있다 — 시작 화면에 예약 진입 버튼을 둔다(예전엔 없어서
                    "예약하려면?"에 앱 안내만 나왔다). 예약 의도 메시지로 봇의 예약 흐름(진료과 선택)을 연다. */}
                <button type="button" className="wc-chip wc-chip--primary" onClick={() => w.send('예약하기')}>예약하기</button>
                {['진료시간', '예약 방법', '오시는 길'].map((t) => (
                  <button key={t} type="button" className="wc-chip" onClick={() => w.send(t)}>{t}</button>
                ))}
                <button type="button" className="wc-chip" onClick={() => onAuthGate({ kind: 'view_my_appointments' })}>내 예약 조회</button>
                <button type="button" className="wc-chip wc-chip--handoff" onClick={() => w.session && onHandoffNeeded({ threadId: w.session.threadId, summary: [] })}>직원에게 문의</button>
              </div>
            </div>}
            renderCard={(payload, interactive) => renderCard(payload, {
              send: w.send,
              onHandoff: () => { if (w.session) onHandoffNeeded({ threadId: w.session.threadId, summary: [] }); },
            }, interactive)}
          />
        </div>
      )}
    </>
  );
}
