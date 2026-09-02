import 'package:flutter/material.dart';
import '../../../widgets/action_button.dart';
import 'chat_card_frame.dart';

/// 취소확인 카드 그릇(CCARD-CANCELCONF). 마감 전/30분 이내에만 — 마감 후면 LATEFLOW 경로로 보낸다.
/// [아니요]는 API 없이 카드를 「취소하지 않음」 확정 상태로 남긴다(NO-01 A안: 지우지 않고 버튼만 제거해
/// 지난 카드 재실행을 막는다). 4상태(normal·processing·declined·race)를 같은 카드 자리에서 전환한다.
bool cancelConfirmBlockedWhenLate({required bool afterDeadline}) => afterDeadline;

class CCancelConfirmCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback onConfirm, onNo;
  const CCancelConfirmCard(
      {super.key, required this.payload, required this.onConfirm, required this.onNo});

  @override
  Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'normal';
    return ChatCardFrame(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${payload['patient_name']} · ${payload['department']} · ${payload['slot_label']}'),
        const SizedBox(height: 8),
        if (state == 'declined')
          const Text('취소하지 않았어요') // NO-01: 확정 상태·버튼 없음(재실행 방지)
        else if (state == 'race')
          const Text('예약 상태가 바뀌었어요. 다시 확인해 주세요')
        else
          Row(children: [
            Expanded(
              child: ActionButton(
                label: '취소합니다',
                busyLabel: '취소 처리 중…',
                busy: state == 'processing',
                onPressed: onConfirm,
              ),
            ),
            TextButton(onPressed: onNo, child: const Text('아니요')),
          ]),
        if (state == 'error') const Text('취소에 실패했어요. 다시 시도해 주세요'),
      ]),
    );
  }
}
