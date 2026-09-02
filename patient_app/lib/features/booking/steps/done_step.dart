import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/pending_request.dart' show koreanTime;
import '../../../core/tokens.dart';
import '../../../widgets/empty_state.dart';
import '../../home/appointment_view.dart';
import '../booking_controller.dart';
import '../booking_submit.dart';

// 8단계 — 완료. 상태에 따라 확정/신청 용어가 갈리고(BOOK-DONE-02·03), 번호를 함께 보인다(01b·01c).
class DoneStep extends ConsumerWidget {
  const DoneStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(bookingProvider).createdAppointmentId!;
    final appt = ref.watch(bookedAppointmentProvider(id));
    return appt.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) =>
          EmptyState.error(onRetry: () => ref.invalidate(bookedAppointmentProvider(id))),
      data: (a) {
        final requested = a.status == '예약신청'; // 확정 전
        return SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const SizedBox(height: 24),
            const Icon(Icons.check_circle, size: 72, color: AppTokens.primary), // BOOK-DONE-01
            const SizedBox(height: 16),
            Text(requested ? '예약이 신청되었습니다' : '예약이 확정되었습니다', // BOOK-DONE-02·03
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            _SummaryBox(a),
            const SizedBox(height: 8),
            Text('${requested ? '신청번호' : '예약번호'} ${a.bookingCode ?? '-'}', // BOOK-DONE-01b·01c
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            const SizedBox(height: 24),
            const Text('사전문진을 미리 써두시면 진료가 더 빨라집니다.', // BOOK-DONE-05
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppTokens.grayPending)),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => context.go('/questionnaire/$id?from=booking'), // NAV-BOOK-17(정본 라우트)
                child: const Text('사전문진 작성하기'), // BOOK-DONE-04
              ),
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => context.go('/home'), // BOOK-DONE-06 나중에 할게요 → 홈
              child: const Text('나중에 할게요'),
            ),
          ]),
        );
      },
    );
  }
}

class _SummaryBox extends StatelessWidget {
  const _SummaryBox(this.a);
  final AppointmentView a;
  @override
  Widget build(BuildContext context) {
    final when = a.slotStart == null
        ? ''
        : '${a.slotStart!.month}월 ${a.slotStart!.day}일 ${koreanTime(a.slotStart!)}';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTokens.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(children: [
        Text(when, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('${a.departmentName} · ${a.doctorName} 선생님',
            style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
      ]),
    );
  }
}
