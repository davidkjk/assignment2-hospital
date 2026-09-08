import 'package:flutter/material.dart';
import '../chat_models.dart';
import 'chat_bubble.dart';

/// 시간순 한 피드(CHAT-ROOM-FEED-01). 카드는 셸이 그리지 않고 cardBuilder 슬롯으로 넘긴다
/// (T12·T13이 카드 사전을 소유). 라이브/인계 줄은 liveSlotBuilder(T11). 별도 전체화면 없음.
class ChatFeed extends StatelessWidget {
  final List<ChatFeedItem> items;
  final Widget Function(BuildContext, ChatFeedItem)? cardBuilder; // T12·T13
  final Widget Function(BuildContext, ChatFeedItem)? liveSlotBuilder; // T11
  final void Function(String clientMessageId)? onRetry;
  // 빠른답변 칩은 입력창 위(고정 바)가 아니라 **피드 마지막 줄**에 둔다 — 고정 바는 대화창을 가린다는
  // 실기기 지적(2026-09-08). 마지막 말풍선 바로 밑에 칩이 흐름대로 따라오고, 스크롤로 자연히 사라진다.
  final Widget? footer;
  const ChatFeed({
    super.key,
    required this.items,
    this.cardBuilder,
    this.liveSlotBuilder,
    this.onRetry,
    this.footer,
  });

  @override
  Widget build(BuildContext context) => ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: items.length + (footer != null ? 1 : 0),
        itemBuilder: (ctx, i) {
          if (footer != null && i == items.length) {
            return Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 8), child: footer!);
          }
          final it = items[i];
          if (it.messageType == 'card' && cardBuilder != null) {
            return cardBuilder!(ctx, it);
          }
          if (it.messageType == 'system' && liveSlotBuilder != null) {
            return liveSlotBuilder!(ctx, it);
          }
          // CHAT-ROOM-FEED-01: 발신자별 좌우 정렬. ChatBubble 내부 end 정렬은 열이 내용폭으로 줄어
          // 무효라, 여기서 Align으로 감싸 내 메시지=오른쪽, 봇·직원=왼쪽에 붙인다.
          final isPatient = it.senderType == 'patient';
          return Align(
            key: ValueKey('msg-align-${it.id}'),
            alignment: isPatient ? Alignment.centerRight : Alignment.centerLeft,
            child: Column(
              crossAxisAlignment:
                  isPatient ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
              // CHAT-ROOM-FEEDBACK-01/Q5: 매 봇 말풍선마다 붙던 상시 [직원에게 물어보기] 버튼을 폐지했다
              // (2026-09-08 실기기: 매번 반복돼 "이미 도움이 안 됐다"는 느낌). 직원 연결은 필요할 때만 —
              // no_answer·가장 최근 봇 답변일 때 입력창 슬롯의 [직원에게 연결] 칩으로 준다(activeQuickReplies).
              ChatBubble(
                item: it,
                onRetry: it.clientMessageId == null
                    ? null
                    : () => onRetry?.call(it.clientMessageId!),
              ),
            ],
            ),
          );
        },
      );
}
