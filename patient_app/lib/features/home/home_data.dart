import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/connectivity.dart';
import '../../core/offline_cache.dart';
import '../../core/providers.dart';
import 'appointment_view.dart';

/// 홈이 예약 목록을 얻는 얇은 창구. 온라인이면 서버(T8 list_my_appointments), 오프라인이면 보관본.
/// 인터페이스로 두어 테스트가 Fake를 주입한다(플랫폼 채널·네트워크 없이).
abstract class HomeApi {
  Future<List<Map<String, dynamic>>> fetchMine(); // GET /my/appointments
}

abstract class HomeCache {
  Future<void> save(List<Map<String, dynamic>> items); // OFF-CACHE-01
  Future<CachedUpcoming?> read();
}

/// OFF-DO-01·HOME-REFRESH-01·HOME-EMPTY-03:
/// 온라인 → 서버 재조회 후 통째로 캐시 저장. 오프라인 → 서버를 부르지 않고 보관본을 읽는다.
/// 오프라인인데 보관본이 없으면 null(화면은 EmptyState.offline — "예약 없음" 거짓말을 피한다).
Future<List<AppointmentView>?> loadHomeAppointments({
  required HomeApi api,
  required HomeCache cache,
  required bool online,
}) async {
  if (online) {
    final raw = await api.fetchMine();
    await cache.save(raw); // OFF-CACHE-01: 받은 목록을 통째로 저장(본인+가족)
    return raw.map(AppointmentView.fromJson).toList();
  }
  final cached = await cache.read();
  if (cached == null) return null; // 보관본 없음 → 화면이 오프라인 빈 상태
  return cached.items.map(AppointmentView.fromJson).toList();
}

// ── 실제 배선 어댑터 ──────────────────────────────────────────────
class _ApiClientHomeApi implements HomeApi {
  _ApiClientHomeApi(this._api);
  final ApiClient _api;
  @override
  Future<List<Map<String, dynamic>>> fetchMine() => _api.get<List<Map<String, dynamic>>>(
        '/my/appointments',
        (j) => (j as List).map((e) => (e as Map).cast<String, dynamic>()).toList(),
      );
}

class _UpcomingCacheAdapter implements HomeCache {
  _UpcomingCacheAdapter(this._cache);
  final UpcomingCache _cache;
  @override
  Future<void> save(List<Map<String, dynamic>> items) => _cache.save(items);
  @override
  Future<CachedUpcoming?> read() => _cache.read();
}

/// 홈 화면이 watch한다. connectivity로 온·오프라인을 갈라 loadHomeAppointments에 넘긴다.
/// null(오프라인+보관본 없음)이면 화면이 EmptyState.offline을 그린다.
final homeAppointmentsProvider = FutureProvider<List<AppointmentView>?>((ref) async {
  final online = ref.watch(connectivityProvider).valueOrNull ?? true;
  return loadHomeAppointments(
    api: _ApiClientHomeApi(ref.watch(apiClientProvider)),
    cache: _UpcomingCacheAdapter(ref.watch(upcomingCacheStoreProvider)),
    online: online,
  );
});

/// HOME-INFO — 병원 주소·전화(T4 get_hospital_info). 조회 실패면 조용히 null(정보 줄만 사라지고 카드는 그대로).
class HospitalInfo {
  const HospitalInfo({this.address, this.phone});
  final String? address;
  final String? phone;
  bool get isEmpty => (address == null || address!.isEmpty) && (phone == null || phone!.isEmpty);
}

/// NAV-HOME-15 / CARD-CHG-04 — 병원발 변경 [확인]: 서버 두 칸 비우기(POST /bookings/:id/acknowledge-change).
/// seam으로 두어 테스트가 네트워크 없이 검증한다(화면은 이동하지 않고 provider만 새로고침한다).
final homeAcknowledgeProvider = Provider<Future<void> Function(String id)>((ref) {
  final api = ref.watch(apiClientProvider);
  return (id) => api.post<void>('/bookings/$id/acknowledge-change', const {}, (_) {});
});

final hospitalInfoProvider = FutureProvider<HospitalInfo?>((ref) async {
  try {
    return await ref.watch(apiClientProvider).get<HospitalInfo>(
          '/catalog/hospital',
          (j) => HospitalInfo(
              address: j['hospital_address'] as String?, phone: j['hospital_phone'] as String?),
        );
  } catch (_) {
    return null; // HOME-INFO-02: 실패해도 카드는 그대로, 정보 줄만 숨긴다
  }
});
