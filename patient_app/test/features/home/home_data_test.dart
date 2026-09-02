import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/offline_cache.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';

Map<String, dynamic> _json(String id, String status) => {
      'id': id,
      'status': status,
      'for_patient_name': '본인',
      'is_self': true,
      'booking_code': 'A-$id',
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': '2030-08-18',
      'start_time': '14:00',
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    };

class _FakeApi implements HomeApi {
  _FakeApi({required this.returns});
  final List<Map<String, dynamic>> returns;
  @override
  Future<List<Map<String, dynamic>>> fetchMine() async => returns;
}

class _ThrowingApi implements HomeApi {
  @override
  Future<List<Map<String, dynamic>>> fetchMine() async =>
      throw StateError('오프라인인데 서버를 불렀다');
}

class _SpyCache implements HomeCache {
  _SpyCache({this.cached});
  final List<Map<String, dynamic>>? cached;
  List<Map<String, dynamic>>? saved;
  @override
  Future<void> save(List<Map<String, dynamic>> items) async => saved = items;
  @override
  Future<CachedUpcoming?> read() async =>
      cached == null ? null : CachedUpcoming(items: cached!, savedAt: DateTime.now());
}

void main() {
  test('[HOME-REFRESH-01] 온라인이면 서버를 다시 조회하고 그 결과를 캐시에 저장한다', () async {
    final api = _FakeApi(returns: [_json('1', '예약확정')]);
    final cache = _SpyCache();
    final list = await loadHomeAppointments(api: api, cache: cache, online: true);
    expect(list!.first.id, '1');
    expect(cache.saved, isNotNull); // OFF-CACHE-01: 받은 목록을 통째로 저장
  });

  test('[HOME-EMPTY-03][OFF-DO-01] 오프라인이면 서버를 부르지 않고 캐시 보관본을 읽는다', () async {
    final api = _ThrowingApi(); // 부르면 실패(오프라인이라 부르면 안 됨)
    final cache = _SpyCache(cached: [_json('9', '진료대기')]);
    final list = await loadHomeAppointments(api: api, cache: cache, online: false);
    expect(list!.first.id, '9'); // 0건이 아니라 보관본 — "예약 없음" 거짓말을 피한다
  });

  test('[HOME-EMPTY-03] 오프라인인데 보관본이 없으면 null(화면이 오프라인 빈 상태)', () async {
    final list = await loadHomeAppointments(api: _ThrowingApi(), cache: _SpyCache(), online: false);
    expect(list, isNull);
  });
}
