import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/pending_request.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/booking_submit.dart';
import 'booking_test_support.dart';

class _FakeRepo implements BookingRepository {
  _FakeRepo(this._fn);
  final Future<String> Function(BookingSelection) _fn;
  @override
  Future<String> createBooking(BookingSelection s) => _fn(s);
}

class _SpyStore implements PendingRequestStore {
  bool began = false;
  @override
  Future<void> begin(PendingKind kind, DateTime at) async => began = true;
  @override
  Future<void> complete() async {}
  @override
  Future<void> dismiss() async {}
  @override
  Future<PendingRequest?> read() async =>
      began ? PendingRequest(PendingKind.book, DateTime.now()) : null;
}

ProviderContainer _containerWith(Future<String> Function(BookingSelection) post, _SpyStore store) {
  final c = ProviderContainer(overrides: [
    bookingRepositoryProvider.overrideWithValue(_FakeRepo(post)),
    pendingRequestStoreProvider.overrideWithValue(store),
  ]);
  addTearDown(c.dispose);
  return c;
}

void _advance(BookingController ctl) {
  ctl.selectTarget(kSelf);
  ctl.selectDepartment(kInternal);
  ctl.selectDoctor(kDocPhoto);
  ctl.selectDate(DateTime(2026, 8, 20));
  ctl.selectSlot('s1', DateTime(2026, 8, 20, 15)); // 15:00 슬롯
  ctl.setReason('');
}

void main() {
  test('[BOOK-RACE-01][NAV-BOOK-16] 그 시간이 이미 차면 5단계 시간 선택으로 되돌린다', () async {
    final c = _containerWith(
        (_) async => throw ApiException('이미 선택된 시간입니다. 다른 시간을 선택해주세요.', statusCode: 409),
        _SpyStore());
    _advance(c.read(bookingProvider.notifier));
    await c.read(bookingSubmitProvider.notifier).submit();
    expect(c.read(bookingProvider).step, 4); // 처음부터가 아니라 시간 단계로만
  });

  test('[BOOK-RACE-02][BOOK-RACE-04] 격자 위 안내에 서버 문장이 담긴다', () async {
    final c = _containerWith(
        (_) async => throw ApiException('이미 선택된 시간입니다. 다른 시간을 선택해주세요.', statusCode: 409),
        _SpyStore());
    _advance(c.read(bookingProvider.notifier));
    await c.read(bookingSubmitProvider.notifier).submit();
    expect(c.read(bookingProvider).raceMessage, contains('다른 시간을 선택'));
  });

  test('[BOOK-RACE-09] 충돌은 오류 상태가 아니라 화면 이동으로 처리(팝업/에러 배너 아님)', () async {
    final c = _containerWith((_) async => throw ApiException('x', statusCode: 409), _SpyStore());
    _advance(c.read(bookingProvider.notifier));
    await c.read(bookingSubmitProvider.notifier).submit();
    expect(c.read(bookingSubmitProvider).hasError, isFalse); // 붙박이 오류 아님
    expect(c.read(bookingProvider).step, 4);
  });

  test('[NAV-BOOK-15][BOOK-CONF-09] 서버 오류(409 아님)는 7단계 그대로 붙박이 오류', () async {
    final c = _containerWith((_) async => throw ApiException('서버 오류', statusCode: 500), _SpyStore());
    _advance(c.read(bookingProvider.notifier));
    await c.read(bookingSubmitProvider.notifier).submit();
    expect(c.read(bookingProvider).step, 6); // 화면 안 옮김
    expect(c.read(bookingSubmitProvider).hasError, isTrue);
  });

  test('[BOOK-CONF-07] 보내기 직전 「결과 못 받은 신청」을 폰에 적는다(유언장)', () async {
    final store = _SpyStore();
    final c = _containerWith((_) async => 'a1', store);
    _advance(c.read(bookingProvider.notifier));
    await c.read(bookingSubmitProvider.notifier).submit();
    expect(store.began, isTrue); // begin(PendingKind.book)이 호출됐다
  });

  test('[BOOK-RACE-07] 성공하면 8단계 완료로 가고 방금 만든 예약 id를 담는다', () async {
    final c = _containerWith((_) async => 'appt-9', _SpyStore());
    _advance(c.read(bookingProvider.notifier));
    await c.read(bookingSubmitProvider.notifier).submit();
    expect(c.read(bookingProvider).step, 7);
    expect(c.read(bookingProvider).createdAppointmentId, 'appt-9');
  });
}
