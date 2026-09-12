import 'package:flutter/material.dart';
import '../../../core/tokens.dart';
import '../chat_models.dart';
import 'chat_bubble.dart';

/// 티켓 status → 라이브 인계 단계 매핑(CHAT-ROOM-LIVE-STATE-01). 일반 메시지 전송은 여기 없음
/// = 상태를 만들지 않는다. answered만 종료(CHAT-ROOM-END-01·CHAT-HANDOFF-STATE-03).
HandoffPhase? handoffPhaseFromTicket(String status) => switch (status) {
      'pending' => HandoffPhase.connecting,
      'in_progress' => HandoffPhase.inProgress,
      'answered' => HandoffPhase.ended,
      _ => null,
    };

/// 직원 말풍선도 같은 피드에 쌓는다(CHAT-ROOM-LIVE-01) — 봇 말풍선과 같은 위젯을 재사용해
/// 별도 방·전체화면을 만들지 않는다.
class ChatLiveRow extends StatelessWidget {
  final ChatFeedItem item;
  const ChatLiveRow({super.key, required this.item});
  @override
  Widget build(BuildContext context) => ChatBubble(item: item);
}

/// 직원 입력 중 일시 표시(CHAT-ROOM-LIVE-TYPING-01). 온라인 점·즉답 보장으로 바꾸지 않는다.
class ChatTypingRow extends StatelessWidget {
  final bool typing;
  const ChatTypingRow({super.key, required this.typing});
  @override
  Widget build(BuildContext context) => typing
      ? const Padding(
          padding: EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          child: Text('직원이 입력 중입니다',
              style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
        )
      : const SizedBox.shrink();
}

/// 실시간 연결 불안정·재연결(CHAT-ROOM-LIVE-CONN-01). 메시지·입력 원문은 보존된다
/// (실패·재전송은 CHAT-ROOM-SEND-02·03 재사용 — 여기서 새로 만들지 않는다).
class ChatConnBanner extends StatelessWidget {
  final bool unstable;
  const ChatConnBanner({super.key, required this.unstable});
  @override
  Widget build(BuildContext context) => unstable
      ? Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          color: AppTokens.muted,
          child: const Row(children: [
            SizedBox(
                height: 12,
                width: 12,
                child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 8),
            Expanded(
                child: Text('연결이 불안정해 다시 연결하는 중입니다',
                    style: TextStyle(fontSize: 12, color: AppTokens.grayPending))),
          ]),
        )
      : const SizedBox.shrink();
}
