import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/core/profile_status.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';

/// GET /patient/me를 흉내내는 얇은 Fake — 403을 던지거나 200을 돌려준다.
class _FakeApi extends Fake implements ApiClient {
  final int? throwStatus;
  _FakeApi({this.throwStatus});
  @override
  Future<T> get<T>(String path, T Function(dynamic) parse, {Map<String, String>? query}) async {
    if (throwStatus != null) throw ApiException('e', statusCode: throwStatus);
    return parse({'patient_id': 'x'});
  }
}

void main() {
  test('[AUTH-SIGNUP-12] GET /patient/me가 403이면 프로필 미완료(true)', () async {
    final c = ProviderContainer(
        overrides: [apiClientProvider.overrideWithValue(_FakeApi(throwStatus: 403))]);
    addTearDown(c.dispose);
    expect(await c.read(profileStatusProvider.future), isTrue);
  });

  test('[AUTH-SIGNUP-12] 프로필이 있으면(200) 미완료가 아니다(false)', () async {
    final c = ProviderContainer(
        overrides: [apiClientProvider.overrideWithValue(_FakeApi())]);
    addTearDown(c.dispose);
    expect(await c.read(profileStatusProvider.future), isFalse);
  });

  test('[AUTH-SIGNUP-11] 「가입 미완료」는 별도 enum 값이 아니라 signedIn+missing 조합이다', () {
    // AuthStatus에 새 값을 만들지 않는다 — 세 값 그대로(Task 11의 expiredOffline까지).
    expect(AuthStatus.values,
        [AuthStatus.signedOut, AuthStatus.signedIn, AuthStatus.expiredOffline]);
  });
}
