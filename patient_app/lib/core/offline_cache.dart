import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

// OFF-CACHE-02: 앱 샌드박스(Keychain/EncryptedSharedPrefs) — 로그아웃·탈퇴 시 clear.
// OFF-CACHE-04: iOS 보호등급을 first_unlock로 '명시' 지정(기본값에 안 맡긴다). OFF-CACHE-05: 앱 자체 암호화 안 함(OS에 맡김).
// OFF-CACHE-06: iCloud·구글 백업에서 제외(병원 밖 클라우드에 예약정보 복제 방지).
// OFF-CACHE-07: Keychain 항목은 synchronizable=false라 백업에서 제외 — '대개 포함되는 쪽'으로 안 만들도록 명시.
const _defaultStorage = FlutterSecureStorage(
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),   // OFF-CACHE-04
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

class CachedUpcoming {
  const CachedUpcoming({required this.items, required this.savedAt});
  final List<Map<String, dynamic>> items;
  final DateTime savedAt;
  // OFF-STALE-01: 저장 후 24시간 초과면 '오래된 보관본'. OFF-STALE-04: 전날·당일 알림을 못 받았다는 뜻이라 24h.
  bool get isStale => DateTime.now().difference(savedAt) > const Duration(hours: 24);
}

class UpcomingCache {
  // 기본은 OS 보안 저장소, 테스트는 storage를 주입(플랫폼 채널 없이 검증).
  UpcomingCache([FlutterSecureStorage? storage]) : _storage = storage ?? _defaultStorage;
  final FlutterSecureStorage _storage;
  static const _key = 'upcoming_appointments_v1';

  // OFF-CACHE-01: 서버에서 '앞으로 갈 예약 목록'을 받을 때 통째로 저장(본인+가족 혼합, 골라내지 않음).
  // OFF-CACHE-03: 예약 목록만 — 문진·이력·상담은 담지 않는다.
  Future<void> save(List<Map<String, dynamic>> upcoming) async {
    await _storage.write(key: _key,
        value: jsonEncode({'savedAt': DateTime.now().toIso8601String(), 'items': upcoming}));
  }

  Future<CachedUpcoming?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return CachedUpcoming(
      items: (m['items'] as List).map((e) => (e as Map).cast<String, dynamic>()).toList(),
      savedAt: DateTime.parse(m['savedAt'] as String));
  }

  Future<void> clear() => _storage.delete(key: _key);       // OFF-CACHE-02: 로그아웃·탈퇴 시 호출
}

// 저장소 객체(save/clear를 부르는 곳 — AuthRepo 로그아웃 등). 데이터 provider와 구분한다.
final upcomingCacheStoreProvider = Provider<UpcomingCache>((ref) => UpcomingCache());

final upcomingCacheProvider =
    FutureProvider<CachedUpcoming?>((ref) => ref.watch(upcomingCacheStoreProvider).read());
