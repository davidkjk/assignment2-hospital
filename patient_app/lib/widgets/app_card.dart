import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 예약 카드의 공통 프레임. 본문 높이 132 고정(DISP-CARD-01/02/03),
/// 병원발 안내문은 카드에 간격 없이 붙인다(DISP-ATT-01).
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.body, this.announcement});
  final Widget body;
  final Widget? announcement;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          key: const Key('app_card_main'),
          decoration: BoxDecoration(
            border: Border.all(color: AppTokens.grayPending),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
          ),
          child: SizedBox(
            key: const Key('app_card_body'),
            height: AppTokens.cardBodyHeight, // 고정 132
            child: Align(
              key: const Key('app_card_body_align'),
              alignment: Alignment.center, // 세로 가운데(DISP-CARD-03)
              child: body,
            ),
          ),
        ),
        if (announcement != null)
          Container(
            key: const Key('app_card_announcement'),
            // 간격 0 = 카드와 모서리를 맞춰 한 덩어리(DISP-ATT-01)
            decoration: BoxDecoration(
              color: AppTokens.grayDone.withValues(alpha: 0.15),
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
            ),
            padding: const EdgeInsets.all(12),
            child: announcement,
          ),
      ],
    );
  }
}
