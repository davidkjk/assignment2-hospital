import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart'; // apiClientProvider

/// 취소 응답(T6 cancel_appointment): 마감 전이면 cancelled=true, 마감 후면 afterDeadline=true(취소 안 함).
typedef CancelResult = ({bool cancelled, bool afterDeadline});

/// 예약 변경·취소·마감후상담·반려확인을 한 곳에 묶은 배관(T5·T6 라우터 소비).
/// 화면 테스트는 이 provider를 가짜로 갈아끼워(서버 없이) 결과·오류를 주입한다.
class AppointmentActions {
  AppointmentActions(this._api);
  final ApiClient _api;

  /// POST /bookings/{id}/cancel — 낙관적 잠금(expected_updated_at). 마감 후는 오류가 아니라 afterDeadline=true.
  Future<CancelResult> cancel(String id, DateTime expectedUpdatedAt) async {
    final j = await _api.post(
      '/bookings/$id/cancel',
      {'expected_updated_at': expectedUpdatedAt.toIso8601String()},
      (x) => x as Map<String, dynamic>,
    );
    return (cancelled: j['cancelled'] == true, afterDeadline: j['after_deadline'] == true);
  }

  /// PATCH /bookings/{id} — 변경 = 취소 + 새 예약. 새 예약 id를 돌려준다(APPT-CHG-15).
  /// 낙관적 잠금 409·그 시간 이미 참 409는 ApiException으로 던진다(화면이 분기).
  Future<String> change(String id, String newSlotId, String reason, DateTime expectedUpdatedAt) async {
    final j = await _api.patch(
      '/bookings/$id',
      {
        'new_slot_id': newSlotId,
        'reason': reason,
        'expected_updated_at': expectedUpdatedAt.toIso8601String(),
      },
      (x) => x as Map<String, dynamic>,
    );
    return j['appointment_id'] as String;
  }

  /// POST /bookings/{id}/support — 마감 후 취소/변경을 상담으로(CANCEL-LATE-11). request_type='취소'|'변경'.
  Future<void> requestSupport(String id, String requestType) =>
      _api.post('/bookings/$id/support', {'request_type': requestType}, (_) {});

  /// POST /bookings/{id}/acknowledge-rejection — 반려 배너 [확인](CANCEL-REJ-04). 두 칸을 비운다.
  Future<void> acknowledgeRejection(String id) =>
      _api.post('/bookings/$id/acknowledge-rejection', const {}, (_) {});

  /// POST /bookings/{id}/acknowledge-change — 병원발 변경 안내 배너 [확인](APPT-RACE-03·06). 두 칸을 비운다.
  Future<void> acknowledgeChange(String id) =>
      _api.post('/bookings/$id/acknowledge-change', const {}, (_) {});
}

final appointmentActionsProvider =
    Provider<AppointmentActions>((ref) => AppointmentActions(ref.read(apiClientProvider)));
