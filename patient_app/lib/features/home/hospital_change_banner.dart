import 'package:flutter/material.dart';
import '../../core/wait_format.dart';
import '../../widgets/action_button.dart';
import '../../widgets/warn_text.dart';
import 'appointment_view.dart';

/// CARD-CHG — 병원발 변경/취소 안내문. 상태와 직교하게 카드에 얹힌다(AppCard.announcement, DISP-ATT-01).
/// hospitalChangeKind로 갈린다: 'changed'=시간 변경(전→후 + [확인]) / 'cancelled'=취소(+ [새로 예약하기]).
class HospitalChangeBanner extends StatelessWidget {
  final AppointmentView view;
  final VoidCallback? onConfirm; // [확인]=서버 acknowledge(두 칸 비움, CHG-04) / 취소면 [새로 예약하기]
  const HospitalChangeBanner({super.key, required this.view, this.onConfirm});

  @override
  Widget build(BuildContext context) {
    if (view.hospitalChangeKind == 'cancelled') {
      // CARD-CHG-06 — 병원발 취소: 취소 사실 + [새로 예약하기].
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          const WarnText('병원 사정으로 예약이 취소되었습니다'),
          const SizedBox(height: 8),
          ActionButton(
              label: '새로 예약하기',
              busyLabel: '이동 중…',
              onPressed: onConfirm ?? () {}),
        ],
      );
    }
    // CARD-CHG-02 — 시간 변경: 전 → 후 + [확인].
    final prev = view.hospitalChangePrevTime;
    final next = view.slotStart;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        const WarnText('병원 사정으로 시간이 변경되었습니다'),
        const SizedBox(height: 4),
        Text(
            '${prev == null ? '' : formatKoreanTime(prev)} → '
            '${next == null ? '' : formatKoreanTime(next)}',
            textAlign: TextAlign.center),
        const SizedBox(height: 8),
        ActionButton(label: '확인', busyLabel: '확인 중…', onPressed: onConfirm ?? () {}), // CHG-04
      ],
    );
  }
}
