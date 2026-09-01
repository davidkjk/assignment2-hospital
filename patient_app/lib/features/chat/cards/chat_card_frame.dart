import 'package:flutter/material.dart';
import '../../../core/tokens.dart';

/// 채팅 피드에 삽입되는 카드의 공통 그릇(CCARD-*). 예약 카드(AppCard, 본문 132 고정·가운데정렬)와 달리
/// 대화 카드는 상태·버튼 수에 따라 높이가 변하므로 높이를 고정하지 않는다. 색은 AppTokens만 —
/// 예약 카드와 같은 딥틸 tint 계열로 시각을 맞춘다(하드코딩 금지·DISP-CARD-01 톤 재사용).
class ChatCardFrame extends StatelessWidget {
  final Widget child;
  const ChatCardFrame({super.key, required this.child});
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTokens.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTokens.border),
        ),
        child: child,
      );
}
