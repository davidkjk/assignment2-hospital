import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
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
  // 빠른답변 칩은 입력창 위(고정 바)가 아니라 **피드 마지막 줄**에 둔다 — 고정 바는 대화창을 가린다는
  // 실기기 지적(2026-09-08). 마지막 말풍선 바로 밑에 칩이 흐름대로 따라오고, 스크롤로 자연히 사라진다.
  final Widget? footer;
  const ChatFeed({
    super.key,
    required this.items,
    this.cardBuilder,
    this.liveSlotBuilder,
    this.onRetry,
    this.onFeedback,
    this.footer,
  });

  // Q20: 내용 없는 말풍선(빈 흰 알약)을 그리지 않는다. 카드·시스템 슬롯으로 가는 것, 실패(재전송 표시
  //   유지), 확인필요(자체 안내)는 제외하고, 그 밖에 본문이 비거나 공백뿐이면 말풍선·피드백 버튼 통째 건너뛴다.
  //   봇 빈 응답의 근본은 백엔드(Q19 = 빈 응답을 503 장애로) 쪽에서 막지만, 실시간 병합 등 어떤 경로로도
  //   빈 말풍선이 새지 않도록 렌더 단계에서 방어한다.
  bool _isBlankBubble(ChatFeedItem it) {
    if (it.messageType == 'card' && cardBuilder != null) return false;
    if (it.messageType == 'system' && liveSlotBuilder != null) return false;
    if (it.isUnknown) return false;
    if (it.sendState == ChatSendState.failed) return false;
    return (it.content?.trim().isEmpty ?? true);
  }

  @override
  Widget build(BuildContext context) {
    final visible = [for (final it in items) if (!_isBlankBubble(it)) it];
    return ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: visible.length + (footer != null ? 1 : 0),
        itemBuilder: (ctx, i) {
          if (footer != null && i == visible.length) {
            return Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 8), child: footer!);
          }
          final it = visible[i];
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
              ChatBubble(
                item: it,
                onRetry: it.clientMessageId == null
                    ? null
                    : () => onRetry?.call(it.clientMessageId!),
              ),
              if (it.senderType == 'bot')
                Padding(
                  padding: const EdgeInsets.only(left: 12, bottom: 4),
                  // CHAT-ROOM-FEEDBACK-01: 중립 문구로 반전(2026-09-08). 예전 `도움이 안 됐어요`는
                  // 누르기도 전에 "이미 도움이 안 됐다"는 느낌이라, 답변 평가가 아니라 **다음 갈 곳**을
                  // 주는 말로 바꾼다(직원 인계로 연결 = 막다른 길 방지). 기능은 동일(요구사항 5.5).
                  child: TextButton.icon(
                    key: const Key('chat-feedback-btn'),
                    onPressed: () => onFeedback?.call(it),
                    icon: const Icon(AppIcons.person, size: 15),
                    label: const Text('직원에게 물어보기'),
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
            ),
          );
        },
      );
  }
}
