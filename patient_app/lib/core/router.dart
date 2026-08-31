import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'connectivity.dart';
import 'phone_cooldown.dart';
import 'profile_status.dart';
import 'sensitive_reauth.dart';
import 'session_guard.dart';
import '../features/auth/auth_state.dart';
import '../features/auth/auth_repo.dart';
import '../features/auth/consent_screen.dart';
import '../features/auth/duplicate_account_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/new_password_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/auth/password_find_screen.dart';
import '../features/auth/phone_change_screen.dart';
import '../features/auth/reauth_screen.dart';
import '../features/appointment/appointment_detail.dart';
import '../features/appointment/change_flow.dart';
import '../features/appointment/cancel_flow.dart';
import '../features/qr/qr_fullscreen.dart';
import '../features/auth/signup_phone_screen.dart';
import '../features/auth/signup_profile_screen.dart';
import '../features/booking/booking_wizard.dart';
import '../features/questionnaire/questionnaire_wizard.dart';
import '../features/questionnaire/confirm_screen.dart';
import '../features/questionnaire/questionnaire_entry.dart';
import '../features/family/family_list_screen.dart';
import '../features/family/family_edit_screen.dart';
import '../features/family/family_add_choice_screen.dart';
import '../features/family/family_new_screen.dart';
import '../features/family/family_link_form_screen.dart';
import '../features/family/family_link_otp_page.dart';
import '../features/home/home_screen.dart';
import '../features/home/main_tabs.dart';
import '../features/notifications/notification_inbox.dart';
import '../features/settings/settings_home_screen.dart';
import '../features/settings/notification_settings_screen.dart';
import '../features/settings/hospital_info_screen.dart';
import '../features/settings/settings_password_screen.dart';
import '../features/settings/withdraw_screen.dart';
import '../widgets/app_shell.dart';

// AUTH-REAUTH-05: 민감 경로(설정·가족·탈퇴). 탈퇴는 /settings 하위. Task 11 redirect가 이 판정을 부른다.
bool _isSensitive(String loc) => loc.startsWith('/settings') || loc.startsWith('/family');
bool isSensitiveLocation(String loc) => _isSensitive(loc); // 테스트용 공개 래퍼

// 전역 redirect 정책(순수 함수 — router_guard_test가 직접 부른다). NAV-GLOBAL-03·04·05.
String? computeRedirect({
  required AuthStatus auth,
  required bool profileMissing,
  required bool needsReauth,
  required String loc,
}) {
  final protected = !loc.startsWith('/login') && !loc.startsWith('/signup');
  // NAV-GLOBAL-03: 진짜 로그아웃(온라인 401)만 로그인으로. expiredOffline은 여기서 안 걸린다.
  if (auth == AuthStatus.signedOut && protected) return '/login';
  // OFF-AUTH-01: expiredOffline이면 캐시 읽기전용 화면 유지 — 로그인으로 보내지 않는다.
  if (auth == AuthStatus.expiredOffline) return null;
  // NAV-GLOBAL-04(갭 #43): 인증됐지만 프로필 미완료면 가입 ③으로(profileMissingProvider는 Task 13이 채운다).
  if (auth == AuthStatus.signedIn && profileMissing && !loc.startsWith('/signup')) {
    return '/signup/step3';
  }
  // NAV-GLOBAL-05: 민감 경로이고 떠난 지 5분 지났으면 재인증 먼저(Task 14 AUTH-REAUTH-*).
  if (_isSensitive(loc) && needsReauth) return '/reauth?next=$loc';
  return null;
}

// 전역 가드: effectiveAuthProvider(세 신호 합성)·profileMissing·재인증 가드를 읽어 어디로 갈지 정한다.
String? _authRedirect(BuildContext context, GoRouterState state) {
  final container = ProviderScope.containerOf(context);
  return computeRedirect(
    auth: container.read(effectiveAuthProvider),
    profileMissing: container.read(profileMissingProvider),
    needsReauth: container.read(sensitiveReauthGuardProvider).needsReauth,
    loc: state.matchedLocation,
  );
}

/// 가입 ② 인증 성공 후: 프로필 없음 → ③으로(NAV-AUTH-04), 이미 있으면 갈림길로(AUTH-DUP-02·NAV-AUTH-05).
Future<void> _afterSignupOtp(BuildContext context, WidgetRef ref, String phone) async {
  final exists = await ref.read(authRepoProvider).hasProfile();
  if (!context.mounted) return;
  if (exists) {
    context.go('/duplicate', extra: {'phone': phone});
  } else {
    context.go('/signup/step3');
  }
}

/// 라우터를 함수로 감싸 테스트가 시작 위치를 주입할 수 있게 한다. main.dart는 기본 인스턴스를 쓴다.
GoRouter buildAppRouter({String initialLocation = '/login'}) => GoRouter(
      initialLocation: initialLocation,
      redirect: _authRedirect,
      routes: [
        GoRoute(
          path: '/login',
          builder: (c, s) {
            final extra = s.extra as Map?; // NAV-AUTH-06: 갈림길에서 온 번호
            final next = s.uri.queryParameters['next']; // NAV-AUTH-18: 딥링크 목적지
            return Consumer(
                builder: (c, ref, _) => LoginScreen(
                      controller: LoginController(ref.read(authRepoProvider)),
                      prefillPhone: extra?['phone'] as String?,
                      onSuccess: () => c.go(next ?? '/home'), // AUTH-LOGIN-09·NAV-AUTH-10·18
                      onForgot: () => c.push('/password-find'), // NAV-AUTH-11
                      onPhoneChanged: () => c.push('/phone-change'), // NAV-AUTH-12
                    ));
          },
        ),
        // ⓪동의 → ①전화 → ②인증(분기) → ③기본정보 (화면은 T13, 여기선 콜백만 잇는다)
        GoRoute(path: '/signup', builder: (c, s) => const ConsentScreen()), // NAV-AUTH-02
        GoRoute(
          path: '/signup/phone',
          builder: (c, s) => Consumer(
              builder: (c, ref, _) => SignupPhoneScreen(
                  controller: SignupPhoneController(
                      ref.read(authRepoProvider), ref.read(phoneCooldownStoreProvider)))), // NAV-AUTH-03
        ),
        GoRoute(
          path: '/signup/otp',
          builder: (c, s) {
            final extra = s.extra as Map;
            final phone = extra['phone'] as String;
            return Consumer(builder: (c, ref, _) {
              final repo = ref.read(authRepoProvider);
              return OtpScreen(
                phone: phone,
                purpose: OtpPurpose.signup,
                cooldown: ref.read(phoneCooldownStoreProvider),
                onResend: () => repo.sendOtp(phone, createUser: true),
                onVerify: (code) => repo.verifyOtp(phone, code),
                onSuccess: () => _afterSignupOtp(c, ref, phone), // NAV-AUTH-04·05
              );
            });
          },
        ),
        GoRoute(
          path: '/signup/step3',
          builder: (c, s) => Consumer(
              builder: (c, ref, _) => SignupProfileScreen(
                    controller: SignupProfileController(ref.read(signupProfileRepoProvider)),
                    adsAgreed: ref.watch(consentProvider).ads,
                    onDone: () => c.go('/home'), // AUTH-SIGNUP-07: 홈으로(축하 화면 없음)
                  )), // NAV-AUTH-08·09
        ),
        GoRoute(
          path: '/duplicate',
          builder: (c, s) {
            final phone = (s.extra as Map)['phone'] as String;
            return Consumer(
                builder: (c, ref, _) => DuplicateAccountScreen(
                      phone: phone,
                      repo: ref.read(authRepoProvider),
                      onLogin: () => c.go('/login', extra: {'phone': phone}), // NAV-AUTH-06(번호 채워)
                      onChangePassword: () => c.go('/new-password'), // NAV-AUTH-07
                      onRecentlyReceived: () => c.push('/phone-change'), // AUTH-DUP-14
                    ));
          },
        ),
        GoRoute(
          path: '/password-find',
          builder: (c, s) => Consumer(
              builder: (c, ref, _) => PasswordFindScreen(
                    controller: PasswordFindController(ref.read(authRepoProvider)),
                    onSent: (phone) =>
                        c.push('/password-find/otp', extra: {'phone': phone}), // NAV-AUTH-13
                  )),
        ),
        GoRoute(
          path: '/password-find/otp',
          builder: (c, s) {
            final phone = (s.extra as Map)['phone'] as String;
            return Consumer(builder: (c, ref, _) {
              final repo = ref.read(authRepoProvider);
              return OtpScreen(
                phone: phone,
                purpose: OtpPurpose.passwordFind,
                cooldown: ref.read(phoneCooldownStoreProvider),
                onResend: () => repo.sendOtp(phone, createUser: false),
                onVerify: (code) => repo.verifyOtp(phone, code),
                onSuccess: () => c.go('/new-password'), // NAV-AUTH-14
              );
            });
          },
        ),
        GoRoute(
          path: '/new-password',
          builder: (c, s) => Consumer(
              builder: (c, ref, _) => NewPasswordScreen(
                    controller: NewPasswordController(ref.read(authRepoProvider)),
                    onDone: () => c.go('/login'), // AUTH-PWNEW-04(로그인 화면으로) — NAV-AUTH-15 갱신
                  )),
        ),
        GoRoute(path: '/phone-change', builder: (c, s) => const PhoneChangeScreen()),
        GoRoute(
          path: '/reauth',
          builder: (c, s) {
            final next = s.uri.queryParameters['next'] ?? '/home';
            return Consumer(
                builder: (c, ref, _) => ReauthScreen(
                      controller: ReauthController(ref.read(authRepoProvider)),
                      guard: ref.read(sensitiveReauthGuardProvider),
                      onPassed: () => c.go(next), // NAV-GLOBAL-05: 원래 가려던 민감 화면으로
                      onForgot: () => c.push('/password-find'), // NAV-AUTH-17
                    ));
          },
        ),
        // 홈은 AppShell(하단 탭 셸)로 감싼다(NAV-HOME-19: 로그인 후 홈에는 탭 바가 있다).
        GoRoute(
            path: '/home',
            builder: (c, s) => const AppShell(body: HomeScreen(), bottomTabs: MainTabs())),
        // 나머지 보호 화면은 이후 태스크가 각자 AppShell로 감싼다(지금은 자리표시자).
        // 예약 마법사 — 하단 탭 셸 안(NAV-BOOK-21: 탭 다녀와도 상태 유지 = BOOK-KEEP-01).
        GoRoute(
          path: '/booking',
          builder: (c, s) =>
              const AppShell(body: BookingWizard(), bottomTabs: MainTabs()),
          redirect: (c, s) {
            // BOOK-NAV-09 — 예약은 오프라인에서 못 한다. 진입점 버튼이 이미 회색이지만 딥링크 방어로 한 번 더.
            final online =
                ProviderScope.containerOf(c).read(connectivityProvider).valueOrNull ?? true;
            return online ? null : '/home';
          },
        ),
        GoRoute(path: '/my', builder: (c, s) => const _Placeholder('나의 예약')), // T30 소유(HOME-KILL 확인 목적지)
        GoRoute(path: '/family', builder: (c, s) => const FamilyListScreen()),   // 환자앱 T25
        // 환자앱 T26 — 가족 추가 갈래·㉮ 등록·㉯ OTP 연결. _isSensitive가 이미 /family를 덮는다.
        GoRoute(path: '/family/add', builder: (c, s) => const FamilyAddChoiceScreen()),
        GoRoute(path: '/family/add/new', builder: (c, s) => const FamilyNewScreen()),
        GoRoute(path: '/family/add/link', builder: (c, s) => const FamilyLinkFormScreen()),
        GoRoute(path: '/family/add/link/otp', builder: (c, s) => const FamilyLinkOtpPage()),
        GoRoute(
            path: '/family/:id/edit',
            builder: (c, s) => FamilyEditScreen(familyPatientId: s.pathParameters['id']!)),
        GoRoute(
            path: '/appointments/:id',
            builder: (c, s) => AppointmentDetailScreen(
                  s.pathParameters['id']!,
                  changed: s.uri.queryParameters['changed'] == '1', // APPT-CHG-12 변경 완료 안내
                )), // 환자앱 T21
        // 환자앱 T22 — 변경 마법사·취소 흐름(상세 [예약 변경]·[예약 취소]가 push, NAV-APPT-07·12).
        GoRoute(
            path: '/appointments/:id/change',
            builder: (c, s) => ChangeScreen(s.pathParameters['id']!)),
        GoRoute(
            path: '/appointments/:id/cancel',
            builder: (c, s) => CancelLauncherScreen(s.pathParameters['id']!)),

        GoRoute(path: '/history', builder: (c, s) => const _Placeholder('방문이력')),
        // ── 설정(Task 28) — T14 redirect가 /settings 하위를 이미 지킨다(NAV-SET-01·02) ──
        GoRoute(path: '/settings', builder: (c, s) => const SettingsHomeScreen()), // SET-HOME
        GoRoute(
            path: '/settings/notifications',
            builder: (c, s) => const NotificationSettingsScreen()), // NAV-SET-04
        // T26 자리표시자(_Placeholder('병원 안내'))를 실화면으로 교체 — NAV-FAM-12·AUTH-OTP-11의 도착지가 실화면이 됐다.
        GoRoute(path: '/settings/hospital', builder: (c, s) => const HospitalInfoScreen()), // NAV-SET-07
        // ── T29 실화면 (로그아웃은 팝업이라 라우트 없음, NAV-SET-08) ──
        GoRoute(
          path: '/settings/password', // NAV-SET-05·14
          builder: (c, s) => SettingsPasswordScreen(onDone: () {
            c.go('/settings');
            ScaffoldMessenger.of(c).showSnackBar(
                const SnackBar(content: Text('비밀번호를 바꿨습니다'))); // NAV-SET-14·SET-PW-13
          }),
        ),
        GoRoute(path: '/settings/withdraw', builder: (c, s) => const WithdrawScreen()), // NAV-SET-09·10~13
        // NAV-HOME 목적지(화면은 T17·18·23 소유 — 여기선 라우트 표만 잇는다).
        // 알림함은 데모 정본대로 하단 탭 셸 안에서 렌더(데모 스샷에 탭바 있음) — AppShell(bottomTabs).
        GoRoute(
            path: '/notifications',
            builder: (c, s) =>
                const AppShell(body: NotificationInbox(), bottomTabs: MainTabs())), // NAV-HOME-12(T18)
        GoRoute(
            path: '/qr/:id',
            builder: (c, s) => QrRoute(appointmentId: s.pathParameters['id']!)), // NAV-HOME-02(화면=T17)
        GoRoute(path: '/questionnaire', builder: (c, s) => const _Placeholder('사전문진')), // 문진 탭
        GoRoute(
            path: '/questionnaire/:id',
            builder: (c, s) {
              final id = s.pathParameters['id']!;
              final start = s.uri.queryParameters['start'];
              // ?start=N → 마법사가 그 문항으로(이어쓰기 [이어서]/[처음부터], 확인 [고치기]). 없으면 상태 분기.
              if (start != null) {
                return QuestionnaireWizard(appointmentId: id, startIndex: int.tryParse(start) ?? 0);
              }
              return QuestionnaireEntry(appointmentId: id);
            }), // NAV-HOME-05·NAV-QNR (화면=T23)
        GoRoute(
            path: '/questionnaire/:id/confirm',
            builder: (c, s) {
              final id = s.pathParameters['id']!;
              final from = s.uri.queryParameters['from'];
              return ConfirmScreen(appointmentId: id, readOnly: false, returnTo: returnRouteFor(from, id));
            }),
        GoRoute(path: '/chat', builder: (c, s) => const _Placeholder('상담 채팅')), // NAV-HOME-11(화면=4단계)
      ],
    );

final GoRouter appRouter = buildAppRouter(); // main.dart가 쓰는 기본 인스턴스

class _Placeholder extends StatelessWidget {
  const _Placeholder(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(label)));
}
