import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api_client.dart';
import '../../../core/pending_request.dart' show koreanTime;
import '../../../core/button_sizes.dart';
import '../../../core/tokens.dart';
import '../../../widgets/action_button.dart';
import '../../../widgets/doctor_avatar.dart';
import '../../../widgets/inline_error.dart';
import '../../home/home_data.dart' show hospitalInfoProvider;
import '../booking_controller.dart';
import '../catalog_repository.dart' show Doctor;
import '../booking_submit.dart';

String _fmtWhen(DateTime date, DateTime? time) {
  final d = '${date.month}월 ${date.day}일';
  return time == null ? d : '$d ${koreanTime(time)}';
}

// 7단계 — 최종 확인(BOOK-CONF). 전 항목 한 번에·[고치기] 없음(뒤로로 고침). [예약 신청하기] 하나.
class ConfStep extends ConsumerWidget {
  const ConfStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final hospital = ref.watch(hospitalInfoProvider);
    final submitting = ref.watch(bookingSubmitProvider);
    final address = hospital.maybeWhen(data: (h) => h?.address, orElse: () => null);
    return Column(children: [
      Expanded(
        child: ListView(padding: const EdgeInsets.all(16), children: [
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text('이대로 예약할까요?',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          ),
          // BOOK-CONF-02 전 항목 한 번에. BOOK-CONF-03 항목별 [고치기] 없음.
          Container(
            decoration: BoxDecoration(
              color: AppTokens.surface,
              borderRadius: BorderRadius.circular(16),
              boxShadow: AppTokens.cardElevation, // 공용 카드 그림자(데모 --elevation-card)
            ),
            child: Column(children: [
              _row('대상', sel.target?.name ?? '-'),
              _row('진료과', sel.department?.name ?? '-'),
              _doctorRow(sel.doctor),
              _row('일시', _fmtWhen(sel.date!, sel.slotStartTime)),
              _row('방문 이유',
                  (sel.reason?.trim().isEmpty ?? true) ? '(입력 안 함)' : sel.reason!.trim()),
              if (address != null && address.isNotEmpty) _row('장소', address, last: true),
            ]),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Text('병원 확인 후 확정되는 경우 알림으로 알려드립니다', // BOOK-CONF-04e
                style: TextStyle(fontSize: 13, color: AppTokens.grayPending)),
          ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          if (submitting.hasError && submitting.error is ApiException)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InlineError((submitting.error as ApiException).message), // BOOK-CONF-09
            ),
          ActionButton(
            label: '예약 신청하기', // BOOK-CONF-04b 하나로 통일
            busyLabel: '예약 신청 중…', // BOOK-CONF-05 진행형 유지
            style: AppButtonSize.cta, // 데모 Step7Confirm: size=lg h-12 text-base
            busy: submitting.isLoading,
            onPressed: () => ref.read(bookingSubmitProvider.notifier).submit(),
          ),
        ]),
      ),
    ]);
  }

  // 의사 줄만 아바타를 곁들인다(BOOK-DOC-05 회색 원+첫 글자 · 예약상세·의사선택과 같은 위젯).
  static Widget _doctorRow(Doctor? doctor) => Container(
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AppTokens.border, width: 0.5))),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(children: [
          const SizedBox(
            width: 72,
            child: Text('의사', style: TextStyle(fontSize: 14, color: AppTokens.grayPending)),
          ),
          Expanded(
            child: doctor == null
                ? const Text('-',
                    textAlign: TextAlign.right,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600))
                : Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                    DoctorAvatar(name: doctor.name, photoUrl: doctor.photoUrl, radius: 14),
                    const SizedBox(width: 8),
                    Text('${doctor.name} 선생님',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  ]),
          ),
        ]),
      );

  static Widget _row(String k, String v, {bool last = false}) => Container(
        decoration: last
            ? null
            : const BoxDecoration(
                border: Border(bottom: BorderSide(color: AppTokens.border, width: 0.5))),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(children: [
          SizedBox(
            width: 72,
            child: Text(k, style: const TextStyle(fontSize: 14, color: AppTokens.grayPending)),
          ),
          Expanded(
            child: Text(v,
                textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
        ]),
      );
}
