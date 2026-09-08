import 'package:flutter/material.dart';
import '../../../core/tokens.dart';

/// [CHAT-ROOM-LIVE-TYPING-01] 담당 직원이 답변을 작성 중일 때 상담방 하단(입력창 위)에
/// `직원이 입력 중입니다`를 **일시 표시**한다. ⛔ 온라인 초록 점이나 "곧 답변" 보장이 아니다
/// (TICKET-DETAIL-SCOPE-01) — 잠깐의 상태 표시일 뿐, 신호가 끊기면 사라진다.
class ChatTypingIndicator extends StatefulWidget {
  const ChatTypingIndicator({super.key});
  @override
  State<ChatTypingIndicator> createState() => _ChatTypingIndicatorState();
}

class _ChatTypingIndicatorState extends State<ChatTypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
        ..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        children: [
          _AnimatedDots(controller: _c),
          const SizedBox(width: 8),
          const Text(
            '직원이 입력 중입니다', // CHAT-ROOM-LIVE-TYPING-01 (정본 문구)
            style: TextStyle(color: AppTokens.grayPending, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

/// 점 3개가 차례로 밝아지는 잔잔한 애니메이션. 무한 반복이라 테스트는 pump(고정 시간)로 다룬다.
class _AnimatedDots extends StatelessWidget {
  const _AnimatedDots({required this.controller});
  final AnimationController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            final phase = (controller.value * 3 - i).clamp(0.0, 1.0);
            final opacity = 0.3 + 0.7 * (phase < 0.5 ? phase * 2 : (1 - phase) * 2);
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1.5),
              child: Opacity(
                opacity: opacity.clamp(0.3, 1.0),
                child: Container(
                  width: 5,
                  height: 5,
                  decoration: const BoxDecoration(
                    color: AppTokens.grayPending,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            );
          }),
        );
      },
    );
  }
}
