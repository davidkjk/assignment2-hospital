import 'package:flutter/material.dart';
import 'chat_card_frame.dart';

/// 취소반려 카드 그릇(CCARD-CANCELREJ). 직원 사유를 요약·순화 없이 그대로 표시한다(REASON). 확인 전
/// 안내는 서버 저장분이라 앱 재실행 뒤에도 유지한다(STATE). 사유 누락(계약 위반)이면 지어내지 않고
/// 안내만 하고(EXC), [확인]은 사유 유무와 무관하게 acknowledge_cancel_rejection(T22)을 부른다
/// (막다른 길 금지). [다시 문의하기]는 횟수 제한 없이 예약 맥락 상담방을 연다(LINK).
class CCancelRejectCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback onAck, onReinquire;
  const CCancelRejectCard(
      {super.key, required this.payload, required this.onAck, required this.onReinquire});

  @override
  Widget build(BuildContext context) {
    final reason = payload['reason'] as String?;
    final acked = payload['state'] == 'after';
    return ChatCardFrame(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('요청하신 취소가 어려워요'),
        if (reason != null && reason.isNotEmpty)
          Text(reason) // REASON: 그대로
        else
          const Text('사유가 전달되지 않았어요 · 병원에 문의해 주세요'), // EXC: 지어내지 않음
        if (!acked) TextButton(onPressed: onAck, child: const Text('확인')), // EXC: 항상 동작
        TextButton(onPressed: onReinquire, child: const Text('다시 문의하기')), // LINK: 무제한
      ]),
    );
  }
}
