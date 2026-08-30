import 'package:flutter/material.dart';

import '../../core/tokens.dart';
import 'appointment_view.dart';

/// CARD-COMMON-05 — 상태 배지. 데모 정본: 색 알약(rounded-full) + 흰 글자. 색만이 아니라 글자로도 구분.
/// 상태별 색(데모 StatusBadge 톤): 확인 중/확정되지 않음=amber · 진료 대기=sky · (상태 B는 T17이 확장).
Color patientBadgeColor(AppointmentCardState s) => switch (s) {
      AppointmentCardState.req => AppTokens.badgeAmber,
      AppointmentCardState.unconf => AppTokens.badgeAmber,
      AppointmentCardState.wait => AppTokens.badgeSky,
      AppointmentCardState.confirmed => AppTokens.primary,
      AppointmentCardState.arrived => AppTokens.badgeViolet,
      _ => AppTokens.grayDone,
    };

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: const TextStyle(
              color: AppTokens.badgeOnColor, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}
