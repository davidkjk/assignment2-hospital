import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import 'providers.dart';

/// AUTH-SIGNUP-12 — 출입증(세션)은 있는데 프로필(이름·생년월일)이 없으면 가입 미완료다.
/// GET /patient/me가 403이면(get_current_patient가 patients 행을 못 찾음) 미완료로 본다.
/// ⚠️ 경로는 단수 `/patient`(직원 patients.router가 복수 /patients 점유 — Task 10 교정).
/// 이 판정은 OFF-AUTH-04(온라인 401만 진짜 로그아웃)와 같은 결이다 — 세션과 프로필을 따로 본다.
final profileStatusProvider = FutureProvider<bool>((ref) async {
  final api = ref.watch(apiClientProvider);
  try {
    await api.get('/patient/me', (j) => j);
    return false; // 프로필 있음
  } on ApiException catch (e) {
    if (e.statusCode == 403) return true; // patients 행 없음 = 미완료
    rethrow;                              // 다른 오류는 미완료 판정에 쓰지 않는다
  }
});

/// AUTH-SIGNUP-11 — 별도 enum 값을 만들지 않는다. Task 11 라우터가 `signedIn && profileMissing`으로
/// 「가입 미완료」를 표현하고 `/signup/step3`로 보낸다. 로딩 중엔 false라 튕기지 않는다.
final profileMissingProvider =
    Provider<bool>((ref) => ref.watch(profileStatusProvider).valueOrNull ?? false);
