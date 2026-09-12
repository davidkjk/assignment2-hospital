import 'package:flutter/material.dart';
import 'chat_card_frame.dart';

/// 문진 카드 그릇(CCARD-QNR). 상태·진행률은 서버(카드 사전 §7·QNR-*)를 소비하고 재계산하지 않는다.
/// 작성완료·진료 시작 전=[내용 보기]+[수정하기], 진료중부터=[내용 보기]만(CARD-QNR-03~05).
/// 질문 자체는 카드에서 나열·작성하지 않고 전용 문진 화면(/questionnaire/:id, T23)을 연다(NAV).
class CQnrCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final void Function(String route)? onOpenQuestionnaire;
  const CQnrCard({super.key, required this.payload, this.onOpenQuestionnaire});

  @override
  Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? '미작성';
    if (state == 'loading') {
      return const ChatCardFrame(child: Center(child: CircularProgressIndicator()));
    }
    final appointmentId = payload['appointment_id'] as String? ?? 'ap';
    void open() => onOpenQuestionnaire?.call('/questionnaire/$appointmentId');
    final total = payload['total'] as int? ?? 0;
    return ChatCardFrame(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (total == 0 && state == '0문항')
          const Text('작성할 문진이 없습니다')
        else if (total == 0 && state == '0문항답있음')
          OutlinedButton(onPressed: open, child: const Text('내용 보기'))
        else if (state == '취소읽기전용') ...[
          OutlinedButton(onPressed: open, child: const Text('작성한 문진 보기')),
          OutlinedButton(onPressed: () {}, child: const Text('새로 예약하기')),
        ] else if (state == '미작성' || state == '작성중')
          OutlinedButton(
              onPressed: open, child: Text(state == '미작성' ? '작성하기' : '이어쓰기'))
        else ...[
          // 완료/수정가능/진료중: 내용 보기는 항상, 수정하기는 진료 시작 전까지만.
          OutlinedButton(onPressed: open, child: const Text('내용 보기')),
          if (state != '진료중')
            OutlinedButton(onPressed: open, child: const Text('수정하기')),
        ],
      ]),
    );
  }
}
