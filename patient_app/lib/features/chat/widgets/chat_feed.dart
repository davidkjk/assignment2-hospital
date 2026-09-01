import 'package:flutter/material.dart';
import '../../../core/tokens.dart';
import '../chat_models.dart';
import 'chat_bubble.dart';

/// 시간순 한 피드(CHAT-ROOM-FEED-01). 카드는 셸이 그리지 않고 cardBuilder 슬롯으로 넘긴다
/// (T12·T13이 카드 사전을 소유). 라이브/인계 줄은 liveSlotBuilder(T11). 별도 전체화면 없음.
class ChatFeed extends StatelessWidget {
  final List<ChatFeedItem> items;
  final Widget Function(BuildContext, ChatFeedItem)? cardBuilder; // T12·T13
  final Widget Function(BuildContext, ChatFeedItem)? liveSlotBuilder; // T11
  final void Function(String clientMessageId)? onRetry;
  final void Function(ChatFeedItem)? onFeedback;
  const ChatFeed({
    super.key,
    required this.items,
    this.cardBuilder,
    this.liveSlotBuilder,
    this.onRetry,
    this.onFeedback,
  });

  @override
  Widget build(BuildContext context) => ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: items.length,
        itemBuilder: (ctx, i) {
          final it = items[i];
          if (it.messageType == 'card' && cardBuilder != null) {
            return cardBuilder!(ctx, it);
          }
          if (it.messageType == 'system' && liveSlotBuilder != null) {
            return liveSlotBuilder!(ctx, it);
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ChatBubble(
                item: it,
                onRetry: it.clientMessageId == null
                    ? null
                    : () => onRetry?.call(it.clientMessageId!),
              ),
              if (it.senderType == 'bot')
                Padding(
                  padding: const EdgeInsets.only(left: 12, bottom: 4),
                  child: TextButton.icon(
                    key: const Key('chat-feedback-btn'),
                    onPressed: () => onFeedback?.call(it),
                    icon: const Icon(Icons.flag_outlined, size: 15),
                    label: const Text('도움이 안 됐어요'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppTokens.grayPending,
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      minimumSize: const Size(0, 32),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      textStyle: const TextStyle(fontSize: 12),
                    ),
                  ),
                ),
            ],
          );
        },
      );
}
