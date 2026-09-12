import 'package:flutter/material.dart';

import '../../core/tokens.dart';
import '../home/appointment_view.dart';
import 'detail_sections.dart' show formatKoreanDateTime;

/// APPT-RACE-04 / CANCEL-DONE-02 — 누가 취소했는지 밝힌다(직원 이름은 안 쓴다, RACE-05).
/// - 병원 취소: '병원에서 취소했습니다'
/// - 가족 대행 취소: '배우자 김○○ 님이 취소했습니다'
/// - 본인 취소: '취소하셨습니다'
String cancellerActor(AppointmentView v) {
  if (v.cancelledBy == 'hospital') return '병원에서 취소했습니다';
  if (v.cancelledByName != null && v.cancelledByName!.isNotEmpty) {
    final rel = v.cancelledByRelation ?? '';
    return '${rel.isEmpty ? '' : '$rel '}${v.cancelledByName} 님이 취소했습니다';
  }
  return '취소하셨습니다';
}

/// 취소된 예약 상세의 머리 안내(CANCEL-DONE-02) — 취소 주체 한 줄 + 취소 일시.
/// 상세 화면은 이미 회색 머리·취소됨 배지·QR 감춤·문진 읽기전용·[새로 예약하기]를 상태로 그린다(T15/17/21) —
/// 여기서는 「누가·언제 취소했는지」만 얹는다. 별도 전체 화면을 만들지 않는다(데모가 같은 상세를 재사용).
class CancelledNotice extends StatelessWidget {
  const CancelledNotice(this.v, {super.key});
  final AppointmentView v;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(cancellerActor(v),
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.grayPending)),
      if (v.cancelledAt != null)
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(formatKoreanDateTime(v.cancelledAt),
              style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
        ),
    ]);
  }
}
