import 'package:flutter/material.dart';
import '../../../core/tokens.dart';

/// 상담방 하단(입력창 위)의 **일시** 입력 중 표시 — 점 3개 애니메이션 + 라벨.
/// - `직원이 입력 중입니다`(기본): 담당 직원이 답변 작성 중(CHAT-ROOM-LIVE-TYPING-01).
/// - `상담봇이 입력 중`: 보내고 봇 응답을 기다리는 중(CHAT-ROOM-BOT-TYPING-01, 웹 위젯 botTyping과 동치).
/// ⛔ 온라인 초록 점이나 "곧 답변" 보장이 아니다(TICKET-DETAIL-SCOPE-01) — 잠깐의 상태 표시일 뿐.
class ChatTypingIndicator extends StatefulWidget {
  const ChatTypingIndicator({super.key, this.label = '직원이 입력 중입니다'});

  /// 표시 문구. 봇 대기 표시는 '상담봇이 입력 중'을 준다.
  final String label;

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
          Text(
            widget.label, // '직원이 입력 중입니다'(기본) / '상담봇이 입력 중'
            style: const TextStyle(color: AppTokens.grayPending, fontSize: 13),
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
