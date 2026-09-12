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
          // 데모 정본: 테두리 대신 딥틸 tint 배경 + 옅은 그림자로 "떠 보이는" 안쪽 박스(DISP-CARD-01).
          decoration: BoxDecoration(
            // 데모 bg-primary/10을 **불투명 색으로 고정**(#E7F0F1 = 딥틸10%를 흰 위에 미리 합성).
            // Flutter는 반투명 배경 뒤에 그린 그림자가 배경을 **통과해 비쳐** 아래가 어두워지고
            // 그라데이션처럼 보인다(데모 CSS 그림자는 밖에만 있어 안 비침). 불투명색이면 평평·옅게.
            color: const Color(0xFFE7F0F1),
            borderRadius: BorderRadius.circular(10), // 데모 rounded-lg = --radius(10)
            boxShadow: const [
              BoxShadow(color: Color(0x14102D32), blurRadius: 8, offset: Offset(0, 1)), // 희미한 그림자만
            ],
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12),
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
