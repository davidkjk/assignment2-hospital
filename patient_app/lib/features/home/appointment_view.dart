/// T8 list_my_appointments 한 줄을 담는 뷰 모델. 서버 status를 화면이 직접 읽지 않게 감싼다.
class AppointmentView {
  final String id, status, forPatientName, departmentName, doctorName, relation;
  final String? bookingCode;
  final DateTime? slotStart; // slot_date + start_time
  final DateTime? hospitalChangePrevTime; // CARD-CHG: null이면 미확인 변경 없음
  final String? hospitalChangeKind; // 'changed' | 'cancelled'
  final bool hasQuestionnaire;
  final bool isSelf; // account_patient_id == for_patient_id (T16 소급) — 홈 정렬에서 본인 먼저(HOME-CARD-03).
  // CARD-CXL-09(갭 #11) — 취소 주체·시각. CxlBody가 병원/가족/본인 3갈래로 갈린다.
  final String? cancelledBy; // 'hospital' | 'patient'
  final String? cancelledByRelation; // 가족 대행 취소면 관계
  final String? cancelledByName; // 가족 대행 취소면 이름
  final DateTime? cancelledAt;
  AppointmentView({
    required this.id,
    required this.status,
    required this.forPatientName,
    required this.departmentName,
    required this.doctorName,
    this.relation = '본인',
    this.bookingCode,
    this.slotStart,
    this.hospitalChangePrevTime,
    this.hospitalChangeKind,
    required this.hasQuestionnaire,
    this.isSelf = false,
    this.cancelledBy,
    this.cancelledByRelation,
    this.cancelledByName,
    this.cancelledAt,
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
      relation: (j['relation'] as String?) ?? (j['is_self'] == true ? '본인' : '가족'),
      bookingCode: j['booking_code'] as String?,
      slotStart: slot,
      hasQuestionnaire: j['has_questionnaire'] == true,
      isSelf: j['is_self'] == true,
      hospitalChangePrevTime: j['hospital_change_prev_time'] == null
          ? null
          : DateTime.parse(j['hospital_change_prev_time'] as String),
      hospitalChangeKind: j['hospital_change_kind'] as String?,
      cancelledBy: j['cancelled_by'] as String?,
      cancelledByRelation: j['cancelled_by_relation'] as String?,
      cancelledByName: j['cancelled_by_name'] as String?,
      cancelledAt:
          j['cancelled_at'] == null ? null : DateTime.parse(j['cancelled_at'] as String),
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

/// 서버 status + 30분 유예로 카드 종류를 정한다(상태 A·B 전부, T17에서 완성).
AppointmentCardState resolveCardState(AppointmentView v, DateTime now) {
  final grace = v.slotStart?.add(const Duration(minutes: 30)); // CARD-UNCONF-02 · CARD-LATE-00·01 같은 유예
  switch (v.status) {
    case '예약신청':
      if (grace != null && now.isAfter(grace)) return AppointmentCardState.unconf; // UNCONF-02
      return AppointmentCardState.req; // REQ-01
    case '진료대기':
      return AppointmentCardState.wait;
    case '예약확정':
      // CARD-LATE-00·01: 예약시각 +30분이 지나야 ⑨로 넘긴다(그 전엔 확정 그대로 — 접수 줄에 선 사람을 늦은 사람 취급 안 함).
      if (grace != null && now.isAfter(grace)) return AppointmentCardState.late;
      return AppointmentCardState.confirmed; // CARD-OK
    case '도착':
      return AppointmentCardState.arrived; // CARD-IN
    case '진료중':
      return AppointmentCardState.inTreatment; // CARD-DOC
    case '진료완료':
      return AppointmentCardState.done; // CARD-DONE
    case '환자취소':
    case '병원취소':
      return AppointmentCardState.cancelled; // CARD-CXL
    default:
      return AppointmentCardState.unknown;
  }
}

/// CARD-COMMON-04 — 내부 상태 이름을 환자 말로. (데모 StatusCard BADGE_LABEL 정본 — 내부어 '예약부도' 없음)
String patientStatusLabel(AppointmentCardState s) => switch (s) {
      AppointmentCardState.req => '확인 중', // CARD-REQ-02
      AppointmentCardState.wait => '진료 대기',
      AppointmentCardState.unconf => '확정되지 않음', // CARD-UNCONF-03·03b
      AppointmentCardState.confirmed => '확정됨', // CARD-OK
      AppointmentCardState.arrived => '접수됐어요', // CARD-IN
      AppointmentCardState.inTreatment => '진료 중', // CARD-DOC
      AppointmentCardState.done => '진료가 끝났습니다', // CARD-DONE
      AppointmentCardState.cancelled => '취소됨', // CARD-CXL-01
      AppointmentCardState.late => '시간 지남', // CARD-LATE-02(부도 아님)
      _ => '',
    };

/// CARD-LIFE-01 — 끝난 카드 = 진료완료·취소됨만. late는 QR이 살아 있어 포함하지 않는다(CARD-LIFE-02·LATE-11).
bool isFinishedCard(AppointmentCardState s) =>
    s == AppointmentCardState.done || s == AppointmentCardState.cancelled;
