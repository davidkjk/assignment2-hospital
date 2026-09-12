/// [SET-HOSP-05] 진료시간·휴진일을 화면 네 줄(평일·토요일·점심시간·휴진일)로 접는 순수 함수.
/// 서버(get_hospital_hours)가 'HH:MM' 문자열로 주므로 여기선 문자열만 다룬다(시간 계산 없음).
/// ⚠️ weekday 규약은 서버(00041)와 같은 **Python 월=0 … 일=6** — 0~4 평일, 5 토요일, 6 일요일.
/// T29·챗봇이 병원 안내를 그릴 때 재사용할 수 있게 화면에서 분리한다.
library;

const _weekdayNames = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

class Day {
  const Day(this.weekday,
      {this.open, this.close, this.lunchStart, this.lunchEnd, this.isClosed = false});
  final int weekday; // 0=월 … 6=일
  final String? open, close, lunchStart, lunchEnd;
  final bool isClosed;

  bool get _open => !isClosed && open != null && close != null;
}

class Closure {
  const Closure(this.date, this.memo);
  final String date; // 'YYYY-MM-DD'
  final String memo;
}

class HospitalHours {
  const HospitalHours({required this.weekdays, required this.closures});
  final List<Day> weekdays;
  final List<Closure> closures;

  factory HospitalHours.fromJson(Map<String, dynamic> j) => HospitalHours(
        weekdays: [
          for (final d in (j['weekdays'] as List))
            Day((d as Map)['weekday'] as int,
                open: d['open'] as String?, close: d['close'] as String?,
                lunchStart: d['lunch_start'] as String?, lunchEnd: d['lunch_end'] as String?,
                isClosed: d['is_closed'] == true),
        ],
        closures: [
          for (final c in (j['closures'] as List))
            Closure((c as Map)['date'] as String, c['memo'] as String? ?? ''),
        ],
      );
}

class HospitalHoursLines {
  const HospitalHoursLines(
      {required this.weekday, required this.saturday, required this.lunch, required this.closed});
  final String weekday;  // '평일 09:00–18:00' 또는 요일별 여러 줄(\n)
  final String saturday; // '토요일 09:00–13:00' (토 휴진이면 빈 문자열)
  final String lunch;    // '점심시간 12:30–14:00' (점심 없으면 빈 문자열)
  final String closed;   // '휴진일 일요일 · 8월 21일 창립기념일'
}

String _range(Day d) => '${d.open}–${d.close}';

HospitalHoursLines formatHospitalHours(HospitalHours h) {
  final byWd = {for (final d in h.weekdays) d.weekday: d};

  // ── 평일(0~4) ── 다섯 요일이 모두 열고 시간이 같으면 한 줄, 아니면 여는 요일만 요일별로 편다.
  final weekdayDays = [for (var wd = 0; wd <= 4; wd++) if (byWd[wd]?._open ?? false) byWd[wd]!];
  String weekdayLine;
  if (weekdayDays.length == 5 &&
      weekdayDays.every((d) => _range(d) == _range(weekdayDays.first))) {
    weekdayLine = '평일 ${_range(weekdayDays.first)}';
  } else {
    weekdayLine = weekdayDays
        .map((d) => '${_weekdayNames[d.weekday]} ${_range(d)}')
        .join('\n'); // 묶을 수 없으면 요일별
  }

  // ── 토요일(5) ──
  final sat = byWd[5];
  final saturdayLine = (sat?._open ?? false) ? '토요일 ${_range(sat!)}' : '';

  // ── 점심시간 ── 대표(첫 여는 평일)의 점심시간.
  final lunchDay = weekdayDays.firstWhere(
      (d) => d.lunchStart != null && d.lunchEnd != null,
      orElse: () => const Day(-1));
  final lunchLine = (lunchDay.lunchStart != null && lunchDay.lunchEnd != null)
      ? '점심시간 ${lunchDay.lunchStart}–${lunchDay.lunchEnd}'
      : '';

  // ── 휴진일 ── 문 닫는 요일 이름 + 예정 휴진('M월 D일 메모').
  final closedNames = [
    for (var wd = 0; wd <= 6; wd++)
      if (!(byWd[wd]?._open ?? false)) _weekdayNames[wd],
  ];
  final closureNotes = [
    for (final c in h.closures) '${_monthDay(c.date)} ${c.memo}'.trim(),
  ];
  final closedLine = [...closedNames, ...closureNotes].join(' · ');

  return HospitalHoursLines(
      weekday: weekdayLine, saturday: saturdayLine, lunch: lunchLine, closed: closedLine);
}

String _monthDay(String isoDate) {
  final parts = isoDate.split('-');
  if (parts.length != 3) return isoDate;
  final m = int.tryParse(parts[1]), d = int.tryParse(parts[2]);
  if (m == null || d == null) return isoDate;
  return '$m월 $d일';
}
