import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/api_client.dart';
import '../../core/offline_cache.dart';
import '../../core/providers.dart';
import 'signup_phone_screen.dart'; // AuthOtpSender(추상)
import 'signup_profile_screen.dart'; // SignupProfileRepo(추상)
import 'new_password_screen.dart'; // PasswordResetRepo(추상)

/// 010… → +8210…(Supabase는 E.164를 받는다). 숫자만 남겨 변환한다.
String toE164(String phone) {
  final d = phone.replaceAll(RegExp(r'\D'), '');
  if (d.startsWith('82')) return '+$d'; // 이미 국가코드 포함(세션 currentUser.phone) — +82 이중부착 방지(재인증 AUTH-REAUTH)
  return d.startsWith('0') ? '+82${d.substring(1)}' : '+82$d';
}

/// 로그인·OTP·재인증·로그아웃·중복 판정의 단일 창구. 화면·컨트롤러는 이 추상에만 의존한다.
abstract class AuthRepo implements AuthOtpSender, PasswordResetRepo {
  Future<void> sendOtp(String phone, {required bool createUser});
  Future<String?> verifyOtp(String phone, String code); // null=성공, 아니면 화면에 띄울 문구
  Future<String?> signInWithPassword(String phone, String password); // 〃
  Future<String?> reauthenticate(String password); // 현재 세션의 번호로 비밀번호 재확인
  Future<bool> hasProfile(); // GET /patient/me == 200
  Future<void> signOut(); // 세션 + 예약 보관본 삭제(AUTH-SESS-04)
}

class SupabaseAuthRepo implements AuthRepo {
  SupabaseAuthRepo({required this.auth, required this.api, required this.cache});
  final GoTrueClient auth;
  final ApiClient api;
  final UpcomingCache cache;

  static const _loginFail = '전화번호 또는 비밀번호가 올바르지 않습니다'; // AUTH-LOGIN-05
  static const _otpFail = '인증번호가 올바르지 않습니다'; // AUTH-OTP-09(서버 문장 대체)

  @override
  Future<void> sendSignupOtp(String phone) => sendOtp(phone, createUser: true); // AuthOtpSender

  @override
  Future<void> sendOtp(String phone, {required bool createUser}) =>
      auth.signInWithOtp(phone: toE164(phone), shouldCreateUser: createUser);

  @override
  Future<String?> verifyOtp(String phone, String code) async {
    try {
      await auth.verifyOTP(phone: toE164(phone), token: code, type: OtpType.sms);
      return null;
    } on AuthException {
      return _otpFail;
    }
  }

  @override
  Future<String?> signInWithPassword(String phone, String password) async {
    try {
      await auth.signInWithPassword(phone: toE164(phone), password: password);
      return null;
    } on AuthException {
      return _loginFail; // AUTH-LOGIN-05·06: 원인을 나누지도, 횟수로 잠그지도 않는다
    }
  }

  @override
  Future<String?> reauthenticate(String password) async {
    final phone = auth.currentUser?.phone; // 이미 로그인된 세션의 번호
    if (phone == null || phone.isEmpty) return _loginFail;
    return signInWithPassword(phone, password); // AUTH-REAUTH-01: 문자가 아니라 비밀번호
  }

  @override
  Future<bool> hasProfile() async {
    try {
      await api.get<dynamic>('/patient/me', (j) => j);
      return true;
    } on ApiException catch (e) {
      if (e.statusCode == 403) return false; // 인증만 통과·프로필 없음
      rethrow;
    }
  }

  @override
  Future<void> signOut() async {
    await auth.signOut();
    await cache.clear(); // AUTH-SESS-04 = OFF-CACHE-02
  }

  @override
  Future<void> reset(String name, String password) => // PasswordResetRepo — 서버 경유(갭 #78)
      api.post<void>('/patient/me/password-reset', {'name': name, 'password': password}, (_) {});
}

final authRepoProvider = Provider<AuthRepo>((ref) => SupabaseAuthRepo(
      auth: ref.watch(supabaseClientProvider).auth,
      api: ref.watch(apiClientProvider),
      cache: ref.watch(upcomingCacheStoreProvider),
    ));

/// 가입 ③의 비밀번호 설정 + 프로필 생성(SignupProfileRepo 실체). AuthRepo와 별도 — 회원가입 1회용.
class SupabaseSignupProfileRepo implements SignupProfileRepo {
  SupabaseSignupProfileRepo({required this.auth, required this.api});
  final GoTrueClient auth;
  final ApiClient api;

  @override
  Future<void> setPassword(String pw) => auth.updateUser(UserAttributes(password: pw));

  @override
  Future<void> createProfile({
    required String name,
    required String birthDate,
    required String gender,
    required bool adsAgreed,
    required String termsVersion, // 서버가 자체 상수를 쓰므로 본문엔 담지 않는다(CONSENT-LOG-01)
  }) =>
      api.post<void>('/patient',
          {'name': name, 'birth_date': birthDate, 'gender': gender, 'ads_agreed': adsAgreed}, (_) {});
}

final signupProfileRepoProvider = Provider<SignupProfileRepo>((ref) => SupabaseSignupProfileRepo(
      auth: ref.watch(supabaseClientProvider).auth,
      api: ref.watch(apiClientProvider),
    ));
