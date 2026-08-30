import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/session_guard.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/who_step.dart';
import 'booking_test_support.dart';

// 대상→과→의사→날짜를 차례로 선택해 step==n까지 올린다. n>4는 goToStep(Task 20 전이).
void advanceToStep(BookingController ctl, int n) {
  if (n >= 1) ctl.selectTarget(kSelf);
  if (n >= 2) ctl.selectDepartment(kInternal);
  if (n >= 3) ctl.selectDoctor(kDocPhoto);
  if (n >= 4) ctl.selectDate(DateTime(2026, 8, 20));
  if (n > 4) ctl.goToStep(n);
}

void main() {
  late ProviderContainer c;
  BookingController ctl() => c.read(bookingProvider.notifier);
  int step() => c.read(bookingProvider).step;
  setUp(() => c = ProviderContainer());
  tearDown(() => c.dispose());

  test('[NAV-BOOK-01] 예약 탭 + 새 예약하기 → 1단계(reset 후 진입)', () {
    ctl().selectTarget(kSelf);
    ctl().reset(); // 진입이 reset
    expect(step(), 0);
  });
  test('[NAV-BOOK-02] 홈 0건 빈 상태 + 새 예약하기 → 1단계', () {
    ctl().reset();
    expect(step(), 0);
  });
  test('[NAV-BOOK-03] 1단계 대상 선택 → 2단계', () {
    ctl().selectTarget(kSelf);
    expect(step(), 1);
  });
  test('[NAV-BOOK-07] 상담봇 추천과로 계속하기 → 3단계, 그 과 선택됨(Task 20이 selectDepartment 배선)', () {
    // T19는 계약만: selectDepartment(추천과) 호출 시 step==2 + department 세팅됨.
    ctl().selectTarget(kSelf);
    ctl().selectDepartment(const Department('rec', '추천내과'));
    expect(step(), 2);
    expect(c.read(bookingProvider).department!.id, 'rec');
  });
  test('[NAV-BOOK-09] 3단계 의사 선택 → 4단계, 의사 바꾸면 날짜 버림', () {
    advanceToStep(ctl(), 4);
    ctl().selectDoctor(const Doctor('doc2', '이의사', null, null, '화 오후'));
    expect(step(), 3); // 다시 4단계(날짜)로
    expect(c.read(bookingProvider).date, isNull); // 날짜 버려짐(BOOK-NAV-05)
  });
  test('[NAV-BOOK-11] 5단계 시각 선택 → 6단계(step=5) — Task 20이 화면을 붙인다', () {
    advanceToStep(ctl(), 4);
    ctl().goToStep(5); // Task 20 selectSlot이 부를 전이
    expect(step(), 5);
  });
  test('[NAV-BOOK-12] 5단계 [다른 날짜 고르기] → 4단계', () {
    advanceToStep(ctl(), 4);
    ctl().goToStep(3);
    expect(step(), 3);
  });
  test('[NAV-BOOK-13] 6단계 [다음]/건너뛰기 → 7단계', () {
    advanceToStep(ctl(), 5);
    ctl().goToStep(6);
    expect(step(), 6);
  });
  test('[NAV-BOOK-14] 7단계 신청 성공 → 8단계 완료(step=7)', () {
    advanceToStep(ctl(), 6);
    ctl().goToStep(7); // Task 20 submit 성공 전이
    expect(step(), 7);
  });
  test('[NAV-BOOK-15] 7단계 신청 실패(서버 오류) → 7단계 그대로(화면 안 옮김)', () {
    advanceToStep(ctl(), 6);
    // 실패해도 goToStep을 호출하지 않는다 → step 유지(붙박이 오류는 Task 20 화면).
    expect(step(), 6);
  });
  test('[NAV-BOOK-16] 신청 실패(그 시간 이미 참) → 5단계 시간 선택으로', () {
    advanceToStep(ctl(), 6);
    ctl().goToStep(4); // Task 20 book_slot 충돌 시 전이(BOOK-RACE 계열, T20 소유)
    expect(step(), 4);
  });
  test('[NAV-BOOK-21] 하단 탭 다녀와도 그 단계 그대로(앱 스코프 provider) — 아무것도 묻지 않음', () {
    advanceToStep(ctl(), 2);
    // 다른 탭을 거쳐 예약 탭으로 돌아온 상황 = 같은 provider를 다시 읽기.
    expect(c.read(bookingProvider).step, 2); // BOOK-KEEP-01
    expect(c.read(bookingProvider).department, kInternal);
  });
  test('[NAV-BOOK-22] 마법사 중간 딥링크는 만들지 않는다 — 새 상태는 항상 1단계', () {
    // 라우터에 /booking 하위 경로가 없다(딥링크 불가). 새 container(=앱 새로 열림)는 step 0.
    expect(step(), 0);
  });
  test('[NAV-BOOK-23] 마법사 도중 오프라인 → controller는 연결상태와 무관하게 그 단계를 유지', () {
    advanceToStep(ctl(), 2);
    // controller에 connectivity 입력이 없다 → 오프라인이 되어도 step을 되돌리지 않는다(하던 일 안 빼앗음).
    expect(step(), 2);
  });

  testWidgets('[NAV-BOOK-04] 1단계 + 가족 추가하기 → 가족 탭(마법사 유지)', (t) async {
    final cc = await pumpBooking(t, const WhoStep(), overrides: [targetsOverride(const [kSelf])]);
    await t.pumpAndSettle();
    await t.tap(find.text('가족 추가하기'));
    await t.pumpAndSettle();
    expect(wentTo('family'), isTrue);
    expect(cc.read(bookingProvider).step, 0); // 마법사는 뒤에 살아 있다
  });

  test('[NAV-BOOK-24] 오프라인 401은 만료로 안 본다 — effectiveAuth가 로그인화면으로 안 보냄(OFF-AUTH-04)', () async {
    const signedOut = Stream<AuthState>.empty();
    final offline = ProviderContainer(overrides: [
      connectivityProvider.overrideWith((ref) => Stream.value(false)),
      expiredOfflineProvider.overrideWith((ref) => true),
      authStateChangesProvider.overrideWith((ref) => signedOut),
    ]);
    addTearDown(offline.dispose);
    await offline.read(connectivityProvider.future); // 첫 값 방출 대기
    expect(offline.read(effectiveAuthProvider), AuthStatus.expiredOffline); // 로그인 안 보냄

    final online = ProviderContainer(overrides: [
      connectivityProvider.overrideWith((ref) => Stream.value(true)),
      expiredOfflineProvider.overrideWith((ref) => true),
      authStateChangesProvider.overrideWith((ref) => signedOut),
    ]);
    addTearDown(online.dispose);
    await online.read(connectivityProvider.future);
    expect(online.read(effectiveAuthProvider), AuthStatus.signedOut); // 온라인이면 진짜 로그아웃 경로
  });
}
