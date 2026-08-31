import 'package:hospital_patient_app/features/home/appointment_view.dart';

enum ListStatusTone { none, gray, attention }

class ListStatus {
  final String? label; // null = 글자 없음(LIST-ST-01: › 만)
  final ListStatusTone tone;
  const ListStatus(this.label, this.tone);
}

/// LIST-ST-01~26: 얇은 줄 오른쪽에 붙는 '상태 글자 한 덩어리' + 색.
/// 카드 문구(patientStatusLabel)와 어휘가 다르다 — 줄 길이에 맞춰 짧게 줄인 별도 표.
/// 겹침(LIST-ST-26): 이름이 따로 있는 상태를 먼저, 없으면 주의색 쪽 하나만. 우선순위는 아래 순서.
ListStatus listStatusLabel(AppointmentView v, DateTime now) {
  if (v.hospitalChangePrevTime != null) {
    return const ListStatus('시간 변경됨', ListStatusTone.attention); // LIST-ST-16·19
  }
  if (v.supportRequestedAt != null) {
    return const ListStatus('상담 연결됨', ListStatusTone.attention); // LIST-ST-03(+05: 내부어 금지)
  }
  switch (resolveCardState(v, now)) {
    // T15/T17의 30분 유예 판정을 공유 — 홈·목록·상세가 같은 기준으로 late/unconf를 정한다.
    case AppointmentCardState.req:
      return const ListStatus('확인 중', ListStatusTone.gray); // LIST-ST-02
    case AppointmentCardState.unconf:
      return const ListStatus('확정되지 않음', ListStatusTone.attention); // LIST-ST-22·23·26
    case AppointmentCardState.confirmed:
      return const ListStatus(null, ListStatusTone.none); // LIST-ST-01
    case AppointmentCardState.arrived:
      return const ListStatus('접수됨', ListStatusTone.gray); // LIST-ST-06
    case AppointmentCardState.wait:
      return const ListStatus('대기 중', ListStatusTone.gray); // LIST-ST-07·10·11
    case AppointmentCardState.inTreatment:
      return const ListStatus('진료 중', ListStatusTone.gray); // LIST-ST-08
    case AppointmentCardState.late:
      return const ListStatus('시간 지남', ListStatusTone.attention); // LIST-ST-12·13
    default:
      return const ListStatus(null, ListStatusTone.none); // 목록에 오면 안 되는 상태(진료완료·취소·부도)
  }
}
