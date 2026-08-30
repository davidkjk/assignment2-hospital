/// T8 list_my_appointments 한 줄을 담는 뷰 모델. 서버 status를 화면이 직접 읽지 않게 감싼다.
class AppointmentView {
  final String id, status, forPatientName, departmentName, doctorName;
  final String? bookingCode;
  final DateTime? slotStart; // slot_date + start_time
  final DateTime? hospitalChangePrevTime; // CARD-CHG: null이면 미확인 변경 없음
  final String? hospitalChangeKind; // 'changed' | 'cancelled'
  final bool hasQuestionnaire;
  final bool isSelf; // account_patient_id == for_patient_id (T16 소급) — 홈 정렬에서 본인 먼저(HOME-CARD-03).
  AppointmentView({
    required this.id,
    required this.status,
    required this.forPatientName,
    required this.departmentName,
    required this.doctorName,
    this.bookingCode,
    this.slotStart,
    this.hospitalChangePrevTime,
    this.hospitalChangeKind,
    required this.hasQuestionnaire,
    this.isSelf = false,
  });

  factory AppointmentView.fromJson(Map<String, dynamic> j) {
    DateTime? slot;
    if (j['slot_date'] != null && j['start_time'] != null) {
      slot = DateTime.parse('${j['slot_date']}T${j['start_time']}');
    }
    return AppointmentView(
      id: j['id'] as String,
      status: j['status'] as String,
      forPatientName: j['for_patient_name'] as String,
      departmentName: j['department_name'] as String,
      doctorName: j['doctor_name'] as String,
      bookingCode: j['booking_code'] as String?,
      slotStart: slot,
      hasQuestionnaire: j['has_questionnaire'] == true,
      isSelf: j['is_self'] == true,
      hospitalChangePrevTime: j['hospital_change_prev_time'] == null
          ? null
          : DateTime.parse(j['hospital_change_prev_time'] as String),
      hospitalChangeKind: j['hospital_change_kind'] as String?,
    );
  }

  bool get isConfirmedBefore => status != '예약신청'; // COMMON-02/03: 확정 전/후 용어 분기
}

/// T8 get_queue_status 한 줄. 대기 화면(WaitBody)이 소비한다.
class QueueStatus {
  final int patientsAhead;
  final int? estimatedWaitMinutes;
  const QueueStatus({required this.patientsAhead, this.estimatedWaitMinutes});
}

enum AppointmentCardState {
  req,
  wait,
  unconf,
  confirmed,
  arrived,
  inTreatment,
  done,
  cancelled,
  late,
  unknown
}

/// 서버 status + 30분 유예로 카드 종류를 정한다. 상태 A만 여기서 확정, B는 T17이 채운다.
AppointmentCardState resolveCardState(AppointmentView v, DateTime now) {
  final grace = v.slotStart?.add(const Duration(minutes: 30)); // CARD-UNCONF-02 · T17 CARD-LATE와 같은 유예
  switch (v.status) {
    case '예약신청':
      if (grace != null && now.isAfter(grace)) {
        return AppointmentCardState.unconf; // UNCONF-02
      }
      return AppointmentCardState.req; // REQ-01
    case '진료대기':
      return AppointmentCardState.wait;
    default:
      return AppointmentCardState.unknown; // 상태 B — T17이 case를 더한다
  }
}

/// CARD-COMMON-04: 내부 상태 이름을 환자 말로. (상태 A 배지 문구)
String patientStatusLabel(AppointmentCardState s) => switch (s) {
      AppointmentCardState.req => '확인 중', // CARD-REQ-02
      AppointmentCardState.wait => '진료를 기다리는 중', // '진료대기'를 쓰지 않는다
      AppointmentCardState.unconf => '확정되지 않음', // CARD-UNCONF-03·03b
      _ => '',
    };

/// CARD-LIFE(T17 확장) — 끝난 카드는 진료완료·취소됨만. 상태 A에선 unconf가 살아 있음을 못박는다(UNCONF-11).
bool isFinishedCard(AppointmentCardState s) =>
    s == AppointmentCardState.done || s == AppointmentCardState.cancelled;
