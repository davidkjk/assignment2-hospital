// 대기 문구·시각 표시 규칙. 서버(T8)는 raw 분만 주고, 5분 반올림·`약`·경계 문구는 여기서 입힌다.

/// CARD-WAIT-05(0명=곧)·06(60분 초과=약 1시간 이상)·07(5분 반올림+약)·04(근거 없음=빈 줄).
String formatWaitTime({required int patientsAhead, int? minutes}) {
  if (patientsAhead == 0) return '곧 들어가십니다'; // WAIT-05
  if (minutes == null) return ''; // WAIT-04: 숫자를 만들지 않는다
  if (minutes > 60) return '예상 대기시간 약 1시간 이상'; // WAIT-06
  final rounded = ((minutes + 2) ~/ 5) * 5; // WAIT-07: 5분 반올림
  return '예상 대기시간 약 $rounded분'; // WAIT-07: `약`을 반드시
}

/// CARD-CHG-02 — 병원발 변경 안내의 시각을 「오전/오후 h:mm」으로. 24시간 내부값을 환자 말로 바꾼다.
String formatKoreanTime(DateTime t) {
  final ampm = t.hour < 12 ? '오전' : '오후';
  var h = t.hour % 12;
  if (h == 0) h = 12;
  final m = t.minute.toString().padLeft(2, '0');
  return '$ampm $h:$m';
}

/// 예약 슬롯 시각을 24시간제 `HH:mm`으로. 데모 홈 카드·목록·가족은 mock 원값('14:00')을
/// 그대로 24h로 보여준다(상세만 12h 「오후 2:30」로 예외). 홈 카드가 이 포맷을 쓴다.
String formatSlotTime24(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
