import 'package:flutter/material.dart';
import '../../../widgets/action_button.dart';
import 'chat_card_frame.dart';

/// 예약확인 카드 그릇(CCARD-BOOKCONF). 여섯 확인 항목 + [예약 신청하기]. 실행은 환자앱 create_booking
/// (서버 슬롯 재검증·멱등 request_id). 4상태(normal·submitting·error·race)를 같은 카드 자리에서
/// 전환한다(중복 카드 안 쌓음). 성공이면 onSuccess로 완료 카드를 다음 대화 위치에 이어붙인다.
///
/// 제한모드(BOOKBOT-SHEET)에서는 dispatcher가 이 카드를 렌더하지 않는다 — 아래 술어로 표현한다.
bool actionCardBlockedInRestricted(String cardType) =>
    const {'time_select', 'booking_confirm', 'booking_done'}.contains(cardType);

class CBookConfirmCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback onSubmit;
  final VoidCallback? onSuccess;
  const CBookConfirmCard(
      {super.key, required this.payload, required this.onSubmit, this.onSuccess});

  @override
  Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'normal';
    return ChatCardFrame(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${payload['patient_name']} · ${payload['department']} · ${payload['doctor']}'),
        Text('${payload['slot_label']}'),
        const SizedBox(height: 8),
        if (state == 'race')
          const Text('선택하신 시간이 마감되었어요')
        else
          ActionButton(
            label: '예약 신청하기',
            busyLabel: '예약 신청 중…',
            busy: state == 'submitting',
            onPressed: onSubmit,
          ),
        if (state == 'error') const Text('신청에 실패했어요. 다시 시도해 주세요'),
      ]),
    );
  }
}
