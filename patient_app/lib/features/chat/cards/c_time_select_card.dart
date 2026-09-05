import 'package:flutter/material.dart';
import 'chat_card_frame.dart';

/// 시간선택 카드 그릇(CCARD-TIME). 내부 날짜·시간·상태는 카드 사전 §1 + BOOK-TODAY/TIME/HOLD/RACE
/// 규칙을 재현한다(자체 계산 금지). 5상태(normal·empty·loading·error·race)를 같은 카드 자리에서
/// 전환한다 — 별도 전체화면/팝업을 띄우지 않는다.
class CTimeSelectCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final void Function(String slotId) onPick;
  const CTimeSelectCard({super.key, required this.payload, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'normal';
    final slots = (payload['slots'] as List?) ?? const [];
    return ChatCardFrame(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (state == 'race')
          const Text('선택하신 시간이 마감되었어요. 최신 시간으로 다시 골라 주세요'),
        if (state == 'loading')
          const Center(child: CircularProgressIndicator())
        else if (state == 'error')
          const Text('시간을 불러오지 못했어요')
        else if (state == 'empty')
          const Text('예약 가능한 시간이 없어요')
        else
          for (final s in slots)
            OutlinedButton(
              onPressed: () => onPick(s['slot_id'] as String),
              child: Text(s['label'] as String),
            ),
      ]),
    );
  }
}
