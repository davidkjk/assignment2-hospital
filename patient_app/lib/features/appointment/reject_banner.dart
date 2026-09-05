import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/tokens.dart';
import '../../core/wait_format.dart' show formatKoreanTime;
import '../../widgets/action_button.dart';
import 'appointment_actions.dart';
import 'appointment_detail.dart';
import 'cancel_flow.dart' show invalidateAppointment;

/// 상세 카드 위에 얹히는 「놓치면 손해」 안내 배너의 공통 껍질(주의색 왼쪽 띠 + 옅은 배경).
/// [확인]을 눌러야 사라지고 앱을 껐다 켜도 다시 보인다(상태 기반 — APPT-RACE-06·CANCEL-REJ-04).
class _NoticeBox extends StatelessWidget {
  const _NoticeBox({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTokens.warn.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(12),
          border: const Border(
              left: BorderSide(color: AppTokens.warn, width: AppTokens.warnBarWidth)),
        ),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: children),
      );
}

/// CANCEL-REJ — 취소 반려 배너. 직원이 취소를 거절하면 카드 위 주의색 한 줄 + 직원 사유 그대로 +
/// [확인](눌러야 사라짐 → QR 정상 복귀) + [다시 문의하기](횟수 제한 없음).
class CancelRejectBanner extends ConsumerWidget {
  const CancelRejectBanner(this.d, {super.key});
  final AppointmentDetail d;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (d.cancelRejectedAt == null) return const SizedBox.shrink();
    final id = d.view.id;
    final reason = d.cancelRejectedReason ?? '';
    return _NoticeBox(children: [
      const Text('취소가 어렵다는 답변을 받았습니다', // CANCEL-REJ-01
          style: TextStyle(fontWeight: FontWeight.w700, color: AppTokens.warn)),
      if (reason.isNotEmpty) ...[
        const SizedBox(height: 6),
        Text(reason), // CANCEL-REJ-02 — 직원 사유 그대로(요약·순화 없음)
      ],
      const SizedBox(height: 12),
      Row(children: [
        Expanded(
          child: ActionButton(
            label: '확인', // CANCEL-REJ-04 — 눌러야 사라짐
            busyLabel: '확인 중…',
            onPressed: () async {
              await ref.read(appointmentActionsProvider).acknowledgeRejection(id);
              invalidateAppointment(ref, id); // CANCEL-REJ-05 — 정상 복귀(QR 다시)
            },
          ),
        ),
        const SizedBox(width: 8),
        TextButton(
          onPressed: () => context.push('/chat?appointment=$id'), // CANCEL-REJ-06 — 횟수 제한 없음
          child: const Text('다시 문의하기 ›'),
        ),
      ]),
    ]);
  }
}

/// APPT-RACE-03 — 병원 사정으로 시각만 바뀐 예약의 상세 배너(전→후 + [확인]).
/// 병원발 취소(hospital_change_kind='cancelled')는 취소된 상세(CancelledDetail 계열)가 그린다 — 여기선 시각 변경만.
/// 상태 기반(hospital_change_prev_time)이라 앱을 껐다 켜도 다시 보이고, [확인]이 서버 두 칸을 비운다(APPT-RACE-06).
class ChangeNoticeBanner extends ConsumerWidget {
  const ChangeNoticeBanner(this.d, {super.key});
  final AppointmentDetail d;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final v = d.view;
    final prev = v.hospitalChangePrevTime;
    if (prev == null || v.hospitalChangeKind == 'cancelled') return const SizedBox.shrink();
    final id = v.id;
    final next = v.slotStart;
    final nextLabel = next == null ? '' : formatKoreanTime(next);
    return _NoticeBox(children: [
      Text('병원 사정으로 $nextLabel으로 변경되었습니다', // APPT-RACE-03
          style: const TextStyle(fontWeight: FontWeight.w700, color: AppTokens.warn)),
      const SizedBox(height: 4),
      Text('${formatKoreanTime(prev)} → $nextLabel'), // 전 → 후
      const SizedBox(height: 12),
      SizedBox(
        width: double.infinity,
        child: ActionButton(
          label: '확인', // APPT-RACE-06 — 눌러야 사라짐
          busyLabel: '확인 중…',
          onPressed: () async {
            await ref.read(appointmentActionsProvider).acknowledgeChange(id);
            invalidateAppointment(ref, id);
          },
        ),
      ),
    ]);
  }
}
