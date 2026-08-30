import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/tokens.dart';
import '../../../widgets/empty_state.dart';
import '../booking_controller.dart';
import '../booking_targets_provider.dart';
import '../booking_widgets.dart';

// 1단계 — 누구의 예약인가(BOOK-WHO-*). 본인 + 가족 목록, 본인 맨 위.
class WhoStep extends ConsumerWidget {
  const WhoStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final targets = ref.watch(bookingTargetsProvider);
    return targets.when(
      error: (_, __) => EmptyState.error(onRetry: () => ref.invalidate(bookingTargetsProvider)),
      loading: () => const Center(child: CircularProgressIndicator()),
      data: (list) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text('누구의 예약인가요?', // BOOK-WHO-04
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          ),
          for (final tgt in list) // BOOK-WHO-01 본인 맨 위 + 가족
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: BookingSelectCard(
                key: Key('target-${tgt.patientId}'),
                onTap: () => ref.read(bookingProvider.notifier).selectTarget(tgt), // 선택=2단계로
                child: Row(children: [
                  Expanded(
                    child: Row(crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic, children: [
                      Text(tgt.name,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                      if (tgt.relation != null) // BOOK-WHO-03 관계 함께
                        Padding(
                          padding: const EdgeInsets.only(left: 8),
                          child: Text(tgt.relation!,
                              style:
                                  const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
                        ),
                    ]),
                  ),
                  const Icon(Icons.chevron_right, color: AppTokens.primary),
                ]),
              ),
            ),
          // BOOK-WHO-07 항상(가족 수 무관), 맨 아래 — 점선 테두리 버튼
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: _AddFamilyButton(
              // NAV-FAM-17(사용자 결정 2026-08-18): 가족 목록이 아니라 **갈래 선택**으로 바로 보낸다.
              // 누른 사람은 이미 「가족을 추가하겠다」고 정했고, 목록은 방금 이 1단계에서 본 명단과 같다.
              // BOOK-KEEP-01: push라 마법사는 뒤에 살아 있다 — 돌아오면 1단계에 그 가족이 늘어나 있다.
              onTap: () => context.push('/family/add'), // 옛: context.go('/family')
            ),
          ),
        ],
      ),
    );
  }
}

class _AddFamilyButton extends StatelessWidget {
  const _AddFamilyButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTokens.primary, style: BorderStyle.solid),
        ),
        child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.person_add_alt, size: 18, color: AppTokens.primary),
          SizedBox(width: 8),
          Text('가족 추가하기',
              style: TextStyle(color: AppTokens.primary, fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }
}
