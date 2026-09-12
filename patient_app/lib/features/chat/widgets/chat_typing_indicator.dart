import 'package:flutter/material.dart';
import '../../../core/tokens.dart';

/// 입력 중 표시 — **피드 안 왼쪽에 봇 말풍선이 올라올 그 자리**에 뜨는 흰 말풍선 + 점 3개(Q7).
/// 정본 = webchat `.wc-typing`(홈페이지 `.typing`): 흰 카드·부드러운 그림자·좌하단 꼬리, 점 3개 블링크.
/// 예전엔 입력바 위에 "…입력 중입니다" 텍스트 줄로 떴는데(자리·형태가 봇 답변과 달라 어색),
/// webchat 패턴대로 봇 말풍선 자리의 점 애니메이션으로 통일한다(사용자 2026-09-08).
/// - `상담봇이 입력 중`: 보내고 봇 응답을 기다리는 중(CHAT-ROOM-BOT-TYPING-01, 웹 위젯 botTyping과 동치).
/// - `직원이 입력 중입니다`: 담당 직원이 답변 작성 중(CHAT-ROOM-LIVE-TYPING-01).
/// 문구는 화면에 글자로 그리지 않고 **접근성 라벨**로만 둔다(정본 aria-label). ⛔ 온라인 초록 점이나
/// "곧 답변" 보장이 아니다(TICKET-DETAIL-SCOPE-01) — 잠깐의 상태 표시일 뿐.
class ChatTypingBubble extends StatefulWidget {
  const ChatTypingBubble({super.key, this.label = '직원이 입력 중입니다'});

  /// 접근성 라벨 + 봇/직원 구분(테스트에서 이 값으로 어떤 입력 중인지 확인).
  final String label;

  @override
  State<ChatTypingBubble> createState() => _ChatTypingBubbleState();
}

class _ChatTypingBubbleState extends State<ChatTypingBubble>
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
    // 봇/직원 말풍선과 같은 왼쪽 정렬·같은 흰 카드·꼬리·그림자(자리·형태 통일).
    return Align(
      alignment: Alignment.centerLeft,
      child: Semantics(
        label: widget.label, // 화면엔 글자 없이 스크린리더로만 "…입력 중"(정본 aria-label)
        liveRegion: true,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: const BoxDecoration(
              color: AppTokens.surface,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(5), // 봇 말풍선과 같은 좌하단 꼬리
                bottomRight: Radius.circular(16),
              ),
              boxShadow: AppTokens.bubbleShadow,
            ),
            child: _AnimatedDots(controller: _c),
          ),
        ),
      ),
    );
  }
}

/// 점 3개가 차례로 밝아지는 잔잔한 애니메이션. 무한 반복이라 테스트는 pump(고정 시간)로 다룬다.
/// 정본 `.wc-typing i`(7px·회색·블링크)에 맞춘다.
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
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Opacity(
                opacity: opacity.clamp(0.3, 1.0),
                child: Container(
                  width: 7,
                  height: 7,
                  decoration: const BoxDecoration(
                    color: AppTokens.grayDone,
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
