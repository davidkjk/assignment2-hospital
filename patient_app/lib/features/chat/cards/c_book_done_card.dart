import 'package:flutter/material.dart';
import 'chat_card_frame.dart';

/// 예약완료 카드 그릇(CCARD-BOOKDONE). 실제 예약 결과를 확인한 뒤 한 번만 삽입한다(SHOW). 상태는
/// 서버 결과대로 그리고 미확인(조회 중)을 성공으로 위장하지 않는다(STATE). 문항이 1개 이상이면
/// [사전문진 작성하기], 0문항이면 안내 문구만 — (0/0)·비활성 버튼을 만들지 않는다(QNR).
class CBookDoneCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback? onLater;
  const CBookDoneCard({super.key, required this.payload, this.onLater});

  @override
  Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'applied';
    if (state == 'loading') {
      return const ChatCardFrame(child: Center(child: CircularProgressIndicator()));
    }
    if (state == 'error') {
      return const ChatCardFrame(child: Text('예약 정보를 불러오지 못했어요'));
    }
    final qCount = payload['question_count'] as int? ?? 0;
    return ChatCardFrame(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('예약이 ${state == 'confirmed' ? '확정' : '신청'}되었어요 · ${payload['number']}'),
        const SizedBox(height: 8),
        if (qCount > 0)
          OutlinedButton(onPressed: () {}, child: const Text('사전문진 작성하기'))
        else
          const Text('작성할 문진이 없습니다'), // CCARD-BOOKDONE-QNR-01: 0문항이면 문구만
        TextButton(onPressed: onLater, child: const Text('나중에 할게요')),
      ]),
    );
  }
}
