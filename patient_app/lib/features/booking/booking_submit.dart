import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/pending_request.dart';
import '../../core/providers.dart';
import '../home/appointment_view.dart';
import 'booking_controller.dart';

class BookingRepository {
  BookingRepository(this._api);
  final ApiClient _api;
  // 멱등 request_id를 보낸다(00020). 반환 appointment_id. source는 서버가 'app'으로 고정.
  Future<String> createBooking(BookingSelection s) => _api.post(
        '/bookings',
        {
          'for_patient_id': s.target!.patientId,
          'department_id': s.department!.id,
          'doctor_id': s.doctor!.id,
          'slot_id': s.slotId,
          'reason': s.reason ?? '',
          'request_id': s.requestId,
        },
        (j) => (j as Map<String, dynamic>)['appointment_id'] as String,
      );
}

final bookingRepositoryProvider = Provider((ref) => BookingRepository(ref.read(apiClientProvider)));

// 완료 화면(8단계)이 방금 만든 예약의 상태·번호를 조회한다(T8 GET /my/appointments/{id}).
final appointmentDetailProvider =
    FutureProvider.autoDispose.family<AppointmentView, String>((ref, id) async {
  final api = ref.read(apiClientProvider);
  return api.get('/my/appointments/$id', (j) => AppointmentView.fromJson(j as Map<String, dynamic>));
});

class BookingSubmit extends StateNotifier<AsyncValue<void>> {
  BookingSubmit(this._ref) : super(const AsyncData(null));
  final Ref _ref;

  Future<void> submit() async {
    final ctl = _ref.read(bookingProvider.notifier);
    final sel = _ref.read(bookingProvider);
    // BTN-KILL 유언장(BOOK-CONF-07) — 결과 못 받아도 홈에서 안내한다. 멱등이라 재신청해도 한 건.
    await _ref.read(pendingRequestStoreProvider).begin(PendingKind.book, DateTime.now());
    _ref.invalidate(pendingRequestProvider);
    state = const AsyncLoading();
    try {
      final id = await _ref.read(bookingRepositoryProvider).createBooking(sel);
      await _ref.read(pendingRequestStoreProvider).complete();
      _ref.invalidate(pendingRequestProvider);
      ctl.finishTo(id); // 8단계 완료
      state = const AsyncData(null);
    } on ApiException catch (e, st) {
      await _ref.read(pendingRequestStoreProvider).complete();
      _ref.invalidate(pendingRequestProvider);
      if (e.statusCode == 409) {
        // 그 시간이 이미 참(BOOK-RACE) — 5단계로 되돌리고 격자 위 안내(팝업 아님, BOOK-RACE-09).
        ctl.raceBackToTime(e.message);
        state = const AsyncData(null);
      } else {
        state = AsyncError(e, st); // 7단계 그대로 붙박이 오류(BOOK-CONF-09·NAV-BOOK-15)
      }
    }
  }
}

final bookingSubmitProvider =
    StateNotifierProvider<BookingSubmit, AsyncValue<void>>((ref) => BookingSubmit(ref));
