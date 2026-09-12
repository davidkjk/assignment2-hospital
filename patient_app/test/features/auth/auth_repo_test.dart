import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/offline_cache.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';

class _MockGoTrue extends Mock implements GoTrueClient {}

class _MockApi extends Mock implements ApiClient {}

/// UpcomingCache의 clear() 호출만 지켜보는 스파이(나머지는 Fake라 부르면 실패한다).
class _SpyCache extends Fake implements UpcomingCache {
  bool cleared = false;
  @override
  Future<void> clear() async => cleared = true;
}

void main() {
  setUpAll(() => registerFallbackValue(OtpType.sms));

  test('[AUTH-PWFIND-04] 비밀번호 찾기 발송은 shouldCreateUser:false로 보낸다', () async {
    final auth = _MockGoTrue();
    when(() => auth.signInWithOtp(
            phone: any(named: 'phone'), shouldCreateUser: any(named: 'shouldCreateUser')))
        .thenAnswer((_) async {});
    final repo = SupabaseAuthRepo(auth: auth, api: _MockApi(), cache: _SpyCache());
    await repo.sendOtp('01011112222', createUser: false);
    // 아무 번호나 넣는 것만으로 빈 계정이 생기지 않게 한다(갭 #39).
    verify(() => auth.signInWithOtp(phone: '+821011112222', shouldCreateUser: false)).called(1);
  });

  test('[AUTH-LOGIN-05] 로그인 실패는 원인을 나누지 않고 한 문장으로만 돌려준다', () async {
    final auth = _MockGoTrue();
    when(() => auth.signInWithPassword(
            phone: any(named: 'phone'), password: any(named: 'password')))
        .thenThrow(const AuthException('Invalid login credentials'));
    final repo = SupabaseAuthRepo(auth: auth, api: _MockApi(), cache: _SpyCache());
    final msg = await repo.signInWithPassword('01011112222', 'wrongpw12');
    expect(msg, '전화번호 또는 비밀번호가 올바르지 않습니다'); // 어느 쪽이 틀렸는지 말하지 않는다
  });

  test('[AUTH-LOGIN-06] 여러 번 실패해도 잠그지 않는다 — 매번 다시 시도할 수 있다', () async {
    final auth = _MockGoTrue();
    when(() => auth.signInWithPassword(
            phone: any(named: 'phone'), password: any(named: 'password')))
        .thenThrow(const AuthException('Invalid login credentials'));
    final repo = SupabaseAuthRepo(auth: auth, api: _MockApi(), cache: _SpyCache());
    for (var i = 0; i < 6; i++) {
      final msg = await repo.signInWithPassword('01011112222', 'wrongpw12');
      expect(msg, isNotNull); // 여섯 번째도 「잠김」이 아니라 같은 실패 문구(막다른 길 없음)
    }
  });

  test('[AUTH-SESS-04][AUTH-DUP-04] signOut은 세션과 함께 예약 보관본을 지운다', () async {
    final auth = _MockGoTrue();
    when(() => auth.signOut()).thenAnswer((_) async {});
    final cache = _SpyCache();
    final repo = SupabaseAuthRepo(auth: auth, api: _MockApi(), cache: cache);
    await repo.signOut();
    verify(() => auth.signOut()).called(1);
    expect(cache.cleared, isTrue); // OFF-CACHE-02: 폰에 저장한 예약 보관본을 함께 지운다
  });

  test('[AUTH-DUP-02] hasProfile — 프로필이 있으면(200) true, 없으면(403) false', () async {
    final api = _MockApi();
    when(() => api.get<dynamic>(any(), any())).thenAnswer((_) async => {'patient_id': 'x'});
    final repo = SupabaseAuthRepo(auth: _MockGoTrue(), api: api, cache: _SpyCache());
    expect(await repo.hasProfile(), isTrue);

    when(() => api.get<dynamic>(any(), any())).thenThrow(ApiException('e', statusCode: 403));
    expect(await repo.hasProfile(), isFalse); // 인증만 통과·프로필 없음 → 가입 미완료로 본다
  });
}
