import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/tokens.dart';
import '../../../widgets/doctor_avatar.dart';
import '../../../widgets/empty_state.dart';
import '../booking_controller.dart';
import '../booking_widgets.dart';
import '../catalog_repository.dart';

// 3단계 — 의사(BOOK-DOC-*). 가로 줄: 사진(원형) + 이름 → 진료시간 → 분야.
// 상단에 선택된 대상을 차분한 보조 라벨로만 표시(BOOK-DOC-08).
class DoctorStep extends ConsumerWidget {
  const DoctorStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final docs = ref.watch(doctorsProvider(sel.department!.id));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: StepTitle('어느 선생님께 예약할까요?',
            subtitle: sel.target == null ? null : '${sel.target!.name} 님'), // BOOK-DOC-08
      ),
      Expanded(
        child: docs.when(
          error: (_, __) =>
              EmptyState.error(onRetry: () => ref.invalidate(doctorsProvider(sel.department!.id))),
          loading: () => const Center(child: CircularProgressIndicator()),
          data: (list) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              for (final d in list)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: BookingSelectCard(
                    padding: const EdgeInsets.all(12),
                    onTap: () => ref.read(bookingProvider.notifier).selectDoctor(d),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center, // BOOK-DOC-04 세로 가운데
                      children: [
                        DoctorAvatar(name: d.name, photoUrl: d.photoUrl),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(d.name,
                                  style: const TextStyle(
                                      fontSize: 16, fontWeight: FontWeight.bold)), // 이름(맨 위)
                              Text(d.scheduleSummary,
                                  style: const TextStyle(
                                      fontSize: 13.5,
                                      fontWeight: FontWeight.w600,
                                      color: AppTokens.primary)), // 진료시간
                              if (d.specialty != null)
                                Text(d.specialty!,
                                    style: const TextStyle(
                                        fontSize: 13.5, color: AppTokens.grayPending)), // 분야
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    ]);
  }
}

