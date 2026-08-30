import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import 'catalog_repository.dart';

class BookingTarget {
  // 1단계 대상(본인/가족)
  final String patientId, name; // BOOK-WHO-02 — 본인도 실제 환자 UUID
  final String? relation; // 본인이면 null, 가족이면 "어머니" 등(BOOK-WHO-03)
  const BookingTarget(this.patientId, this.name, this.relation);
}

class BookingSelection {
  final int step; // 0=대상 1=진료과 2=의사 3=날짜 4=시간 5=이유 6=확인 7=완료
  final BookingTarget? target;
  final Department? department;
  final Doctor? doctor;
  final DateTime? date;
  final String? slotId; // 5단계에서 고른 슬롯(임시 홀드 없음 — BOOK-HOLD-01)
  final DateTime? slotStartTime; // 확인 화면 일시 표시·RACE 안내용
  final String? reason; // 6단계 방문이유(빈 문자열=건너뜀)
  final String? createdAppointmentId; // 신청 성공 시 8단계가 조회할 예약 id
  final String? raceMessage; // BOOK-RACE-02 — 5단계 격자 위 안내(그 시간 이미 참)
  final String requestId; // 멱등 키(BOOK-CONF-08) — 마법사 한 판 고정, reset이 새로 발급
  const BookingSelection({
    this.step = 0,
    this.target,
    this.department,
    this.doctor,
    this.date,
    this.slotId,
    this.slotStartTime,
    this.reason,
    this.createdAppointmentId,
    this.raceMessage,
    this.requestId = '',
  });

  // raceMessage는 보호하지 않는다 — copyWith 때마다 비운다(다음 단계로 가면 안내가 사라져야 한다, BOOK-RACE-06/08).
  BookingSelection copyWith({
    int? step,
    BookingTarget? target,
    Department? department,
    Doctor? doctor,
    DateTime? date,
    String? slotId,
    DateTime? slotStartTime,
    String? reason,
    String? createdAppointmentId,
    String? raceMessage,
  }) =>
      BookingSelection(
        step: step ?? this.step,
        target: target ?? this.target,
        department: department ?? this.department,
        doctor: doctor ?? this.doctor,
        date: date ?? this.date,
        slotId: slotId ?? this.slotId,
        slotStartTime: slotStartTime ?? this.slotStartTime,
        reason: reason ?? this.reason,
        createdAppointmentId: createdAppointmentId ?? this.createdAppointmentId,
        raceMessage: raceMessage,
        requestId: requestId,
      );
}

class BookingController extends StateNotifier<BookingSelection> {
  BookingController() : super(BookingSelection(requestId: const Uuid().v4()));

  // 앞 단계에서 값을 (재)선택하면 그 뒤 단계 값을 전부 버린다(BOOK-NAV-05) — 의사마다 진료시간이 달라서.
  void selectTarget(BookingTarget t) =>
      state = BookingSelection(step: 1, target: t, requestId: state.requestId);
  void selectDepartment(Department d) => state =
      BookingSelection(step: 2, target: state.target, department: d, requestId: state.requestId);
  void selectDoctor(Doctor doc) => state = BookingSelection(
      step: 3,
      target: state.target,
      department: state.department,
      doctor: doc,
      requestId: state.requestId);
  void selectDate(DateTime d) => state = BookingSelection(
      step: 4,
      target: state.target,
      department: state.department,
      doctor: state.doctor,
      date: d,
      requestId: state.requestId); // 날짜 바꾸면 슬롯·이유 초기화

  // 5단계 시간 선택 — slot_id만 상태에 담는다. ⭐ 서버 호출 없음(BOOK-HOLD-01·03: 홀드 없음).
  void selectSlot(String slotId, [DateTime? startTime]) =>
      state = state.copyWith(step: 5, slotId: slotId, slotStartTime: startTime);
  // 6단계 방문이유 입력 후 → 7단계.
  void setReason(String reason) => state = state.copyWith(step: 6, reason: reason);
  // 신청 성공 → 8단계 완료(방금 만든 appointment_id 보관).
  void finishTo(String appointmentId) =>
      state = state.copyWith(step: 7, createdAppointmentId: appointmentId);
  // 그 시간이 이미 참 → 5단계 시간 선택으로 되돌리고 격자 위 안내(BOOK-RACE-01·02).
  void raceBackToTime(String message) => state = state.copyWith(step: 4, raceMessage: message);

  void back() {
    if (state.step > 0) state = state.copyWith(step: state.step - 1);
  } // BOOK-NAV-04 한 단계씩

  void goToStep(int s) => state = state.copyWith(step: s); // 특정 단계 복귀
  void reset() => state = BookingSelection(requestId: const Uuid().v4()); // 새 예약 = 새 멱등 키
}

// 앱 생존 동안 유지(autoDispose 아님) → 하단 탭 다녀와도 그대로(BOOK-KEEP-01).
final bookingProvider =
    StateNotifierProvider<BookingController, BookingSelection>((ref) => BookingController());
