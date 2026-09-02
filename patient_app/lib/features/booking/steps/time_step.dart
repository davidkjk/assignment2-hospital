import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/tokens.dart';
import '../../../widgets/empty_state.dart';
import '../booking_controller.dart';
import '../catalog_repository.dart';

final availableSlotsProvider = FutureProvider.autoDispose
    .family<List<Slot>, ({String doctorId, DateTime date})>((ref, k) =>
        ref.read(catalogRepositoryProvider).slots(k.doctorId, k.date)); // T4 list_bookable_slots

bool _isToday(DateTime d) {
  final n = DateTime.now();
  return d.year == n.year && d.month == n.month && d.day == n.day;
}

// 데모 정본: 24시간제 HH:mm(mock '09:00'·'14:00'). 그룹(오전/오후)이 시간대를 말하므로 시각만.
String slotLabel(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

// 5단계 — 시간(BOOK-TIME + 당일 BOOK-TODAY). 오전/오후 두 덩어리·3열 격자. 찬 시간은 서버 목록에 애초에 없다.
class TimeStep extends ConsumerWidget {
  const TimeStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final slots = ref.watch(availableSlotsProvider((doctorId: sel.doctor!.id, date: sel.date!)));
    return slots.when(
      error: (_, __) => EmptyState.error(
          onRetry: () =>
              ref.invalidate(availableSlotsProvider((doctorId: sel.doctor!.id, date: sel.date!)))),
      loading: () => const Center(child: CircularProgressIndicator()),
      data: (list) {
        if (list.isEmpty) {
          // 그날이 전부 참/당일 30분 규칙으로 0 → 나가는 문 + 당일이면 이유 안내(BOOK-TIME-07·BOOK-TODAY-13)
          return _AllFull(
            isToday: _isToday(sel.date!),
            onPickAnotherDate: () => ref.read(bookingProvider.notifier).goToStep(3), // NAV-BOOK-12
          );
        }
        final am = list.where((s) => s.startTime.hour < 12).toList();
        final pm = list.where((s) => s.startTime.hour >= 12).toList();
        return ListView(padding: const EdgeInsets.all(16), children: [
          const Padding(
            padding: EdgeInsets.only(bottom: 20), // 데모 mb-5
            child: Text('몇 시에 오시겠어요?',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          ),
          if (sel.raceMessage != null) _RaceBanner(sel.raceMessage!), // BOOK-RACE-02 격자 위 안내
          if (am.isNotEmpty) _Block('오전', am, ref), // BOOK-TIME-01·03
          if (pm.isNotEmpty) _Block('오후', pm, ref), // BOOK-TIME-06 한쪽 0이면 통째 감춤
        ]);
      },
    );
  }
}

// 데모 Group(Step5Time) 이식: 섹션 mb-6, 라벨 text-sm semibold("오전" + muted "· N자리") mb-3,
// 칩 = bg-card rounded-xl(14) py-3 text-sm semibold tabular-nums shadow-sm, 3열 gap-2(테두리 없음).
class _Block extends StatelessWidget {
  const _Block(this.period, this.slots, this.ref);
  final String period;
  final List<Slot> slots;
  final WidgetRef ref;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24), // 데모 section mb-6
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12), // 데모 mb-3
          child: Text.rich(TextSpan(
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            children: [
              TextSpan(text: period, style: const TextStyle(color: AppTokens.onSurface)),
              TextSpan(
                  text: ' · ${slots.length}자리',
                  style: const TextStyle(color: AppTokens.grayPending)), // text-muted-foreground
            ],
          )),
        ),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 2.6,
          crossAxisSpacing: 8, // gap-2
          mainAxisSpacing: 8,
          children: [
            for (final s in slots)
              _TimeChip(
                label: slotLabel(s.startTime), // 그룹이 오전/오후를 말함 → 시각만
                onTap: () =>
                    ref.read(bookingProvider.notifier).selectSlot(s.id, s.startTime), // → 6단계
              ),
          ],
        ),
      ]),
    );
  }
}

// 데모 time-slot 칩: 흰 카드 + 옅은 shadow-sm(테두리 아님) + 굵은 시각(고정폭 숫자).
class _TimeChip extends StatelessWidget {
  const _TimeChip({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTokens.surface,
        borderRadius: BorderRadius.circular(14), // rounded-xl
        boxShadow: const [
          BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1)), // shadow-sm
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Center(
            child: Text(label,
                style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    fontFeatures: [FontFeature.tabularFigures()])),
          ),
        ),
      ),
    );
  }
}

class _RaceBanner extends StatelessWidget {
  const _RaceBanner(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTokens.warn.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(8),
          border: const Border(
              left: BorderSide(color: AppTokens.warn, width: AppTokens.warnBarWidth)),
        ),
        child: Text(message, style: const TextStyle(color: AppTokens.warn)),
      );
}

class _AllFull extends StatelessWidget {
  const _AllFull({required this.isToday, required this.onPickAnotherDate});
  final bool isToday;
  final VoidCallback onPickAnotherDate;
  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('예약 가능한 시간이 없습니다'),
          if (isToday)
            const Padding(
              padding: EdgeInsets.all(8),
              child: Text('지금 시각 기준으로 30분 뒤부터 예약하실 수 있습니다'), // BOOK-TODAY-13 이유를 함께
            ),
          TextButton(onPressed: onPickAnotherDate, child: const Text('다른 날짜 고르기')), // 막다른 길 금지
        ]),
      );
}
