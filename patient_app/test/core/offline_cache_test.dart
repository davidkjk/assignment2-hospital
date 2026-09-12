import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/offline_cache.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late _MockStorage storage;
  late UpcomingCache cache;

  setUp(() {
    storage = _MockStorage();
    cache = UpcomingCache(storage);
  });

  test('save→read 왕복: 저장한 목록을 그대로 돌려준다 (OFF-CACHE-01)', () async {
    String? written;
    when(() => storage.write(key: any(named: 'key'), value: any(named: 'value')))
        .thenAnswer((inv) async => written = inv.namedArguments[#value] as String);
    await cache.save([
      {'id': 'a1', 'name': '민준'},
    ]);
    when(() => storage.read(key: any(named: 'key'))).thenAnswer((_) async => written);

    final got = await cache.read();
    expect(got, isNotNull);
    expect(got!.items.first['name'], '민준');
  });

  test('저장된 것 없으면 null', () async {
    when(() => storage.read(key: any(named: 'key'))).thenAnswer((_) async => null);
    expect(await cache.read(), isNull);
  });

  test('isStale: 25h 경과 true · 23h false (OFF-STALE-01)', () {
    expect(
        CachedUpcoming(items: const [], savedAt: DateTime.now().subtract(const Duration(hours: 25))).isStale, isTrue);
    expect(
        CachedUpcoming(items: const [], savedAt: DateTime.now().subtract(const Duration(hours: 23))).isStale, isFalse);
  });

  test('clear는 그 키만 지운다 (OFF-CACHE-02: 로그아웃·탈퇴)', () async {
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((_) async {});
    await cache.clear();
    verify(() => storage.delete(key: 'upcoming_appointments_v1')).called(1);
  });

  test('키는 예약 목록 하나뿐 — 문진·이력 키를 쓰지 않는다 (OFF-CACHE-03)', () async {
    final keys = <String>[];
    when(() => storage.write(key: any(named: 'key'), value: any(named: 'value')))
        .thenAnswer((inv) async => keys.add(inv.namedArguments[#key] as String));
    await cache.save(const []);
    expect(keys, ['upcoming_appointments_v1']);   // 문진/이력/상담 키가 끼지 않는다
  });
}
