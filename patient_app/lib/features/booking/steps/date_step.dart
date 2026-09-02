import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/tokens.dart';
import '../../../widgets/empty_state.dart';
import '../booking_controller.dart';
import '../catalog_repository.dart';

// 4단계 — 날짜(BOOK-DATE-*). 월 달력. 예약 가능일만 테두리+선택 가능.
class DateStep extends ConsumerWidget {
  const DateStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final dates = ref.watch(availableDatesProvider(sel.doctor!.id)); // 8주 이내 빈 날짜(Task 4)
    return dates.when(
      error: (_, __) => EmptyState.error(
          onRetry: () => ref.invalidate(availableDatesProvider(sel.doctor!.id))), // BOOK-NAV-10
      loading: () => const Center(child: CircularProgressIndicator()),
      data: (available) => SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('언제 방문하시겠어요?',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          MonthCalendar(
            available: available.map((d) => DateTime(d.year, d.month, d.day)).toSet(),
            now: DateTime.now(),
            onPick: (d) => ref.read(bookingProvider.notifier).selectDate(d),
          ),
        ]),
      ),
    );
  }
}

// 월 단위 달력(BOOK-DATE-01~07). now·available·onPick을 받아 테스트가 직접 구성할 수 있게 공개한다.
class MonthCalendar extends StatefulWidget {
  const MonthCalendar(
      {super.key, required this.available, required this.now, required this.onPick});
  final Set<DateTime> available; // 정규화된(자정) DateTime 집합
  final DateTime now;
  final void Function(DateTime) onPick;
  @override
  State<MonthCalendar> createState() => _MonthCalendarState();
}

class _MonthCalendarState extends State<MonthCalendar> {
  late DateTime _shown; // 표시 중인 달의 1일
  @override
  void initState() {
    super.initState();
    _shown = DateTime(widget.now.year, widget.now.month);
  }

  DateTime get _minMonth => DateTime(widget.now.year, widget.now.month);
  DateTime get _horizon => widget.now.add(const Duration(days: 56)); // BOOK-DATE-06 8주(56일)
  DateTime get _maxMonth => DateTime(_horizon.year, _horizon.month);
  bool get _canPrev => _shown.isAfter(_minMonth); // BOOK-DATE-07
  bool get _canNext => _shown.isBefore(_maxMonth); // BOOK-DATE-06

  void _go(int months) => setState(() => _shown = DateTime(_shown.year, _shown.month + months));

  @override
  Widget build(BuildContext context) {
    const wd = ['일', '월', '화', '수', '목', '금', '토'];
    final firstWeekday = DateTime(_shown.year, _shown.month, 1).weekday % 7; // 일=0
    final daysInMonth = DateTime(_shown.year, _shown.month + 1, 0).day;
    final cells = <Widget>[];
    for (var i = 0; i < firstWeekday; i++) {
      cells.add(const SizedBox());
    }
    for (var day = 1; day <= daysInMonth; day++) {
      final date = DateTime(_shown.year, _shown.month, day);
      cells.add(_DayCell(
        day: day,
        available: widget.available.contains(date), // BOOK-DATE-02
        onTap: () => widget.onPick(date),
      ));
    }
    return Column(children: [
      // 헤더 — 데모: 가운데 모임 ‹ 2026년 8월 › (justify-center gap-2, mb-4)
      Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          IconButton(
            key: const Key('cal-prev'),
            icon: const Icon(Icons.chevron_left, size: 20),
            color: AppTokens.primary,
            disabledColor: AppTokens.grayDone, // 데모 muted/30
            visualDensity: VisualDensity.compact,
            onPressed: _canPrev ? () => _go(-1) : null, // BOOK-DATE-07 이번 달이면 비활성
          ),
          SizedBox(
            width: 112, // min-w-[7rem]
            child: Text('${_shown.year}년 ${_shown.month}월',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)), // semibold
          ),
          IconButton(
            key: const Key('cal-next'),
            icon: const Icon(Icons.chevron_right, size: 20),
            color: AppTokens.primary,
            disabledColor: AppTokens.grayDone,
            visualDensity: VisualDensity.compact,
            onPressed: _canNext ? () => _go(1) : null, // BOOK-DATE-06 호라이즌 월 이후 비활성
          ),
        ]),
      ),
      // 요일 머리글 — text-xs semibold muted
      Row(
        children: [
          for (final w in wd)
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4), // py-1
                  child: Text(w,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppTokens.grayPending)),
                ),
              ),
            ),
        ],
      ),
      GridView.count(
        crossAxisCount: 7,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisSpacing: 4, // gap-1
        mainAxisSpacing: 4,
        children: cells,
      ),
      if (!_canNext) // BOOK-DATE-06 — 막을 때는 이유를 함께
        const Padding(
          padding: EdgeInsets.only(top: 12), // mt-3
          child: Text('예약은 8주 뒤까지 가능합니다',
              style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
        ),
      const SizedBox(height: 20), // mt-5
      // 범례 — 두 개만(BOOK-DATE-04/05), gap-5
      const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _LegendDot(bordered: true),
        SizedBox(width: 6),
        Text('예약 가능', style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
        SizedBox(width: 20),
        _LegendDot(bordered: false),
        SizedBox(width: 6),
        Text('진료 없음', style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
      ]),
    ]);
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.day, required this.available, required this.onTap});
  final int day;
  final bool available;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    if (!available) {
      // 데모 text-muted-foreground/40 — 아주 흐리게(숨기지 않고), 보통 굵기
      return Center(
        child: Text('$day',
            style: TextStyle(
                fontSize: 14, color: AppTokens.grayPending.withValues(alpha: 0.4))),
      );
    }
    // 데모 aspect-square rounded-full border-2 font-bold — 원이 칸을 꽉 채운다
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: AppTokens.primary, width: 2), // BOOK-DATE-02 테두리(border-2)
        ),
        child: Text('$day',
            style: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.bold, color: AppTokens.onSurface)),
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.bordered});
  final bool bordered;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: bordered ? null : AppTokens.muted,
        border: bordered ? Border.all(color: AppTokens.primary, width: 2) : null,
      ),
    );
  }
}
