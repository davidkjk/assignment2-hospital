import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';

void main() {
  late ProviderContainer c;
  BookingController ctl() => c.read(bookingProvider.notifier);
  BookingSelection st() => c.read(bookingProvider);
  const t1 = BookingTarget('p1', '김순자', null);
  const dInternal = Department('d1', '내과');
  const doc1 = Doctor('doc1', '김의사', '소화기', null, '월·수·금 오전');
  setUp(() => c = ProviderContainer());
  tearDown(() => c.dispose());

  test('[BOOK-NAV-05] 앞 단계 값을 바꾸면 그 뒤 단계 선택값을 전부 버린다', () {
    ctl().selectTarget(t1);
    ctl().selectDepartment(dInternal);
    ctl().selectDoctor(doc1);
    ctl().selectDate(DateTime(2026, 8, 20));
    expect(st().doctor, doc1);
    ctl().selectDepartment(const Department('d2', '정형외과')); // 2단계를 다시 고름
    expect(st().doctor, isNull); // 3·4단계가 버려졌다
    expect(st().date, isNull);
    expect(st().department!.id, 'd2');
  });

  test('[BOOK-KEEP-03] reset은 전부 버리고 1단계로 — 앱 재시작·새 예약 진입 시', () {
    ctl().selectTarget(t1);
    ctl().selectDepartment(dInternal);
    ctl().reset();
    expect(st().step, 0);
    expect(st().target, isNull);
    expect(st().department, isNull);
  });

  test('[BOOK-KEEP-06] + 새 예약하기는 이어붙이지 않는다 — 진입이 reset을 부른다', () {
    ctl().selectTarget(t1);
    ctl().selectDepartment(dInternal);
    ctl().reset();
    expect(st().step, 0);
  });

  test('[BOOK-KEEP-01] 상태가 앱 생존 동안 유지된다(autoDispose 아님) — 탭 이동 후 복귀', () {
    ctl().selectTarget(t1);
    ctl().selectDepartment(dInternal);
    // bookingProvider를 다시 읽어도(다른 탭에서 돌아온 상황) 같은 인스턴스라 값이 남아 있다.
    expect(c.read(bookingProvider).department, dInternal);
    expect(c.read(bookingProvider).step, 2); // selectDepartment 후 = 3단계(의사)로

  });

  test('[BOOK-NAV-04] back은 한 단계씩만 내려간다', () {
    ctl().selectTarget(t1);
    ctl().selectDepartment(dInternal); // step=2
    ctl().back();
    expect(st().step, 1);
    ctl().back();
    expect(st().step, 0);
    ctl().back(); // 1단계 아래로는 안 내려간다
    expect(st().step, 0);
  });

  test('[BOOK-KEEP-07] 신청 전까지 서버 호출이 없다 — controller는 메모리 상태만 둔다', () {
    // BTN-KILL과 다름: 서버에 아무것도 안 남는다. selectX는 상태만 바꾸고 네트워크를 부르지 않는다.
    ctl().selectTarget(t1);
    ctl().selectDepartment(dInternal);
    ctl().selectDoctor(doc1);
    ctl().selectDate(DateTime(2026, 8, 20));
    expect(st().step, 4); // 5단계로 넘겼을 뿐, 서버 신청은 Task 20
  });
}
