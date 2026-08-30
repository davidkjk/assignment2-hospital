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

// 그룹(오전/오후)이 시간대를 이미 말하므로 버튼엔 시각만(데모 정본). 12시간제 h:mm.
String slotLabel(DateTime t) {
  var h = t.hour % 12;
  if (h == 0) h = 12;
  return '$h:${t.minute.toString().padLeft(2, '0')}';
}

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
            padding: EdgeInsets.only(bottom: 12),
            child: Text('몇 시에 오시겠어요?',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          ),
          if (sel.raceMessage != null) _RaceBanner(sel.raceMessage!), // BOOK-RACE-02 격자 위 안내
          if (am.isNotEmpty) _Block('오전 · ${am.length}자리', am, ref), // BOOK-TIME-01·03
          if (pm.isNotEmpty) _Block('오후 · ${pm.length}자리', pm, ref), // BOOK-TIME-06 한쪽 0이면 통째 감춤
        ]);
      },
    );
  }
}

class _Block extends StatelessWidget {
  const _Block(this.label, this.slots, this.ref);
  final String label;
  final List<Slot> slots;
  final WidgetRef ref;
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8),
        child: Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
      ),
      GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        childAspectRatio: 2.4,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
        children: [
          for (final s in slots)
            OutlinedButton(
              onPressed: () =>
                  ref.read(bookingProvider.notifier).selectSlot(s.id, s.startTime), // → 6단계
              child: Text(slotLabel(s.startTime)), // 그룹이 오전/오후를 말함 → 시각만
            ),
        ],
      ),
    ]);
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
