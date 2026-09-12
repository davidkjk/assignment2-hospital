import 'package:flutter/material.dart';

import '../../core/tokens.dart';
import 'appointment_view.dart';

/// CARD-COMMON-05 — 상태 배지. 데모 정본(StatusBadge 톤): 채운 색 알약(rounded-full) + 글자.
/// 색만이 아니라 글자로도 구분(어르신 가독성). 데모 STATUS_TONE 정본:
/// 확인 중/확정되지 않음=amber · 진료 대기=sky · 접수(도착)=violet · 확정·진료중·완료=teal(primary)
/// · 취소=muted(옅은 회색+진회색 글자) · 시간 지남=slate.
Color patientBadgeColor(AppointmentCardState s) => switch (s) {
      AppointmentCardState.req => AppTokens.badgeAmber,
      AppointmentCardState.unconf => AppTokens.badgeAmber,
      AppointmentCardState.wait => AppTokens.badgeSky,
      AppointmentCardState.confirmed => AppTokens.primary,
      AppointmentCardState.arrived => AppTokens.badgeViolet,
      AppointmentCardState.inTreatment => AppTokens.primary,
      AppointmentCardState.done => AppTokens.primary,
      AppointmentCardState.cancelled => AppTokens.muted, // muted 톤: 옅은 회색 바탕
      AppointmentCardState.late => AppTokens.badgeSlate,
      _ => AppTokens.grayDone,
    };

/// muted 톤(취소)만 진회색 글자, 나머지는 채운 색 위 흰 글자(데모 text-muted-foreground vs text-white).
Color patientBadgeTextColor(AppointmentCardState s) =>
    s == AppointmentCardState.cancelled ? AppTokens.badgeSlate : AppTokens.badgeOnColor;

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.color, this.textColor});
  final String label;
  final Color color;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: TextStyle(
              color: textColor ?? AppTokens.badgeOnColor,
              fontSize: 12,
              fontWeight: FontWeight.w600)),
    );
  }
}
