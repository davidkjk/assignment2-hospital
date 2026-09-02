import 'package:flutter/material.dart';
import 'chat_card_frame.dart';

/// 취소결과 카드 그릇(CCARD-CANCELDONE). 실제 취소 확인 뒤에만 그린다(SHOW·STATE — 미확정을 완료로
/// 위장하지 않는다). 취소 미확정(상담 연결 중)이면 결과 대신 `아직 예약은 유지되고 있습니다`(EXC).
/// 보존 문진은 읽기전용 + [새로 예약하기](과거 문진 자동 복사 없음).
class CCancelDoneCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback? onNewBooking;
  const CCancelDoneCard({super.key, required this.payload, this.onNewBooking});

  @override
  Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'normal';
    if (state == 'loading') {
      return const ChatCardFrame(child: Center(child: CircularProgressIndicator()));
    }
    if (state == 'pending_support') {
      return const ChatCardFrame(child: Text('아직 예약은 유지되고 있습니다')); // EXC
    }
    return ChatCardFrame(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('예약이 취소되었습니다'),
        if (payload['has_questionnaire'] == true) ...[
          const SizedBox(height: 8),
          OutlinedButton(onPressed: () {}, child: const Text('작성한 문진 보기')),
          OutlinedButton(onPressed: onNewBooking, child: const Text('새로 예약하기')), // 자동 복사 없음
        ],
      ]),
    );
  }
}
