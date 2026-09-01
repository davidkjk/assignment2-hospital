import 'package:flutter/material.dart';
import '../../../core/tokens.dart';

/// 직원 상담 종료 경계(CHAT-ROOM-END-01) + 분기(CHAT-ROOM-END-NAV-01).
/// [이어서 AI 질문]=직전 상담 요약(서버)을 가진 새 AI 상담 · [새 질문]=과거 문맥 없는 새 AI 상담.
/// 완료 티켓을 다시 여는 버튼은 두지 않는다. AI 만료 방 재진입(CHAT-ROOM-AI-REOPEN-01)은
/// 같은 두 분기를 라벨만 바꿔 재사용한다.
class ChatEndBoundary extends StatelessWidget {
  final VoidCallback onResumeAi;
  final VoidCallback onNewQuestion;
  final String message;
  final String resumeLabel;
  final String newLabel;
  const ChatEndBoundary({
    super.key,
    required this.onResumeAi,
    required this.onNewQuestion,
    this.message = '직원 상담이 종료되었습니다',
    this.resumeLabel = '이어서 AI 질문',
    this.newLabel = '새 질문',
  });

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTokens.muted,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(children: [
          Text(message,
              style: const TextStyle(fontSize: 13, color: AppTokens.onSurface)),
          const SizedBox(height: 10),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            OutlinedButton(onPressed: onResumeAi, child: Text(resumeLabel)),
            const SizedBox(width: 8),
            OutlinedButton(onPressed: onNewQuestion, child: Text(newLabel)),
          ]),
        ]),
      );
}
