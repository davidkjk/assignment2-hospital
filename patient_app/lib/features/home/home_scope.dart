import 'appointment_view.dart';

/// 홈에 올릴 「가장 가까운 하루치」를 고른다(HOME-ROLE-01·SCOPE-01·02·03·CARD-03·04).
/// 규칙: 오늘 카드가 하나라도 있으면 오늘 날짜의 전부, 없으면 미래에서 가장 이른 날짜의 전부.
/// 과거(다른 날)는 버린다 — 홈은 "다음에 갈 곳". 다음 예약을 끌어오지 않는다(자정에 저절로 넘어감).
List<AppointmentView> selectHomeDay(List<AppointmentView> all, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  DateTime? dayOf(AppointmentView a) => a.slotStart == null
      ? null
      : DateTime(a.slotStart!.year, a.slotStart!.month, a.slotStart!.day);

  final todays = all.where((a) => dayOf(a) == today).toList();
  final List<AppointmentView> chosen;
  if (todays.isNotEmpty) {
    chosen = todays; // SCOPE-01·03: 오늘이 끝난 것뿐이어도 오늘만(다음날을 올리지 않는다)
  } else {
    final future = all.where((a) => dayOf(a) != null && dayOf(a)!.isAfter(today)).toList();
    if (future.isEmpty) return []; // 0건 → HOME-EMPTY
    future.sort((x, y) => x.slotStart!.compareTo(y.slotStart!));
    final firstDay = dayOf(future.first);
    chosen = future.where((a) => dayOf(a) == firstDay).toList(); // SCOPE-02: 그 하루만
  }
  chosen.sort((x, y) {
    // CARD-03: 빠른 시각 위, 같은 시각이면 본인이 가족보다 위.
    final t = x.slotStart!.compareTo(y.slotStart!);
    if (t != 0) return t;
    return (x.isSelf ? 0 : 1).compareTo(y.isSelf ? 0 : 1);
  });
  return chosen;
}
