import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'catalog_repository.dart';

class BookingTarget {
  // 1단계 대상(본인/가족)
  final String patientId, name; // BOOK-WHO-02 — 본인도 실제 환자 UUID
  final String? relation; // 본인이면 null, 가족이면 "어머니" 등(BOOK-WHO-03)
  const BookingTarget(this.patientId, this.name, this.relation);
}

class BookingSelection {
  final int step; // 0=대상 1=진료과 2=의사 3=날짜 (4~7=Task 20)
  final BookingTarget? target;
  final Department? department;
  final Doctor? doctor;
  final DateTime? date;
  const BookingSelection(
      {this.step = 0, this.target, this.department, this.doctor, this.date});
  BookingSelection copyWith(
          {int? step,
          BookingTarget? target,
          Department? department,
          Doctor? doctor,
          DateTime? date}) =>
      BookingSelection(
          step: step ?? this.step,
          target: target ?? this.target,
          department: department ?? this.department,
          doctor: doctor ?? this.doctor,
          date: date ?? this.date);
}

class BookingController extends StateNotifier<BookingSelection> {
  BookingController() : super(const BookingSelection());

  // 앞 단계에서 값을 (재)선택하면 그 뒤 단계 값을 전부 버린다(BOOK-NAV-05) — 의사마다 진료시간이 달라서.
  void selectTarget(BookingTarget t) =>
      state = BookingSelection(step: 1, target: t); // 대상 바꾸면 과·의사·날짜 초기화
  void selectDepartment(Department d) => state = BookingSelection(
      step: 2, target: state.target, department: d); // 과 바꾸면 의사·날짜 초기화
  void selectDoctor(Doctor doc) => state = BookingSelection(
      step: 3,
      target: state.target,
      department: state.department,
      doctor: doc); // 의사 바꾸면 날짜 초기화
  void selectDate(DateTime d) =>
      state = state.copyWith(step: 4, date: d); // 4단계(시간)로 — 화면은 Task 20

  void back() {
    if (state.step > 0) state = state.copyWith(step: state.step - 1);
  } // BOOK-NAV-04 한 단계씩

  void goToStep(int s) =>
      state = state.copyWith(step: s); // BOOK-RACE 등 특정 단계 복귀(Task 20이 씀)
  void reset() =>
      state = const BookingSelection(); // BOOK-KEEP-03·06 — 항상 1단계부터
}

// 앱 생존 동안 유지(autoDispose 아님) → 하단 탭 다녀와도 그대로(BOOK-KEEP-01).
// 폰에 저장하지 않으므로 앱을 껐다 켜면 초기값(BOOK-KEEP-03).
final bookingProvider =
    StateNotifierProvider<BookingController, BookingSelection>((ref) => BookingController());
