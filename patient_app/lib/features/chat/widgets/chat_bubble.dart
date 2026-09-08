import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import '../../../core/tokens.dart';
import '../chat_models.dart';

/// 한 말풍선. 봇 이름은 AI 상담봇(CHAT-ROOM-NAME-01), 의료/일반 구분은 색이 아니라
/// 작은 머리말(CHAT-ROOM-VISUAL-01), 전송 실패는 원문 보존 + [재전송](CHAT-ROOM-SEND-02).
/// 색은 AppTokens에서만 가져온다(색 하드코딩 금지) — 환자=primary, 봇=surface.
class ChatBubble extends StatelessWidget {
  final ChatFeedItem item;
  final VoidCallback? onRetry;
  const ChatBubble({super.key, required this.item, this.onRetry});

  String? get _heading => switch (item.noticeKind) {
        NoticeKind.medical => '진료 안내',
        NoticeKind.general => '병원 이용 안내',
        null => null,
      };

  @override
  Widget build(BuildContext context) {
    // CHAT-ROOM-EXC-01: 발신자·시각이 없으면 시각을 지어내지 않고 확인 필요로 표시.
    if (item.isUnknown) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Text('직원 확인이 필요한 항목입니다',
            style: TextStyle(color: AppTokens.grayDone, fontSize: 13)),
      );
    }
    final isPatient = item.senderType == 'patient';
    final isBot = item.senderType == 'bot';
    final failed = item.sendState == ChatSendState.failed;
    final bubbleColor = isPatient ? AppTokens.primary : AppTokens.surface;
    final textColor = isPatient ? Colors.white : AppTokens.onSurface;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Column(
        crossAxisAlignment:
            isPatient ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (isBot)
            const Padding(
              padding: EdgeInsets.only(bottom: 2, left: 2),
              child: Text('AI 상담봇',
                  style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
            ),
          if (_heading != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 2, left: 2),
              child: Text(_heading!,
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppTokens.primary)),
            ),
          Container(
            constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.78),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: bubbleColor,
              // Q4 꼬리: 정본(webchat/homepage) 말풍선처럼 하단 안쪽 모서리 하나만 작게 접는다 —
              // 내 메시지(오른쪽 딥틸)=우하단, 봇·직원(왼쪽 흰카드)=좌하단. 나머지는 16.
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(isPatient ? 16 : 5),
                bottomRight: Radius.circular(isPatient ? 5 : 16),
              ),
              // Q10: 테두리 대신 그림자로 띄운다(정본=흰 봇 말풍선 그림자). 딥틸 내 말풍선에도 그림자 추가.
              boxShadow: AppTokens.bubbleShadow,
            ),
            child: Text(item.content ?? '',
                style: TextStyle(color: textColor, fontSize: AppTokens.bodyFontSize)),
          ),
          if (failed)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(AppIcons.error_outline, size: 14, color: AppTokens.warn),
                const SizedBox(width: 4),
                const Text('보내지 못했어요',
                    style: TextStyle(fontSize: 12, color: AppTokens.warn)),
                TextButton(onPressed: onRetry, child: const Text('재전송')),
              ],
            ),
        ],
      ),
    );
  }
}
