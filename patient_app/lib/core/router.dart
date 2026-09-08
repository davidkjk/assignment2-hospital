import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState; // 세션 변화 → 라우터 새로고침
import 'connectivity.dart';
import 'phone_cooldown.dart';
import 'profile_status.dart';
import 'sensitive_reauth.dart';
import 'session_guard.dart';
import '../features/auth/auth_state.dart';
import '../features/auth/auth_repo.dart';
import '../features/auth/consent_screen.dart';
import '../features/auth/duplicate_account_screen.dart';
import '../features/auth/landing_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/new_password_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/auth/password_find_screen.dart';
import '../features/auth/phone_change_screen.dart';
import '../features/auth/reauth_screen.dart';
import '../features/appointment/appointment_detail.dart';
import '../features/appointment/change_flow.dart';
import '../features/appointment/cancel_flow.dart';
import '../features/history/history_screen.dart';
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
import '../features/appointments/my_appointments_screen.dart';
import '../features/chat/chat_history_view.dart';
import '../features/chat/chat_room_entry.dart';
import '../widgets/app_shell.dart';

// NAV-LIST-01: 하단 '예약' 탭의 목적지는 목록(/my)이다 — 예약 마법사(/booking)가 아니다(LIST-ROLE-01).
// /booking은 [+ 새 예약하기]·홈 [진료 예약하기]만 그리로 가고, 탭은 목록이다.
const appointmentsTabRoute = '/my';

// AUTH-REAUTH-05: 민감 경로(설정·가족·탈퇴). 탈퇴는 /settings 하위. Task 11 redirect가 이 판정을 부른다.
// NAV-LIST-13: 목록(/my)은 여기 없다 — 재인증 없이 본다(가족·설정과 다르고 이력과 같다).
bool _isSensitive(String loc) =>
    loc.startsWith('/settings') || loc.startsWith('/family');
bool isSensitiveLocation(String loc) => _isSensitive(loc); // 테스트용 공개 래퍼

// 전역 redirect 정책(순수 함수 — router_guard_test가 직접 부른다). NAV-GLOBAL-03·04·05.
String? computeRedirect({
  required AuthStatus auth,
  required bool profileMissing,
  required bool needsReauth,
  required String loc,
}) {
  // #40(2026-09-05): 로그인 전 첫 화면은 랜딩(AUTH-LAND-01, [로그인]+[회원가입]). 랜딩·로그인·가입은 비보호.
  final protected =
      !loc.startsWith('/login') && !loc.startsWith('/signup') && !loc.startsWith('/landing');
  // NAV-GLOBAL-03: 진짜 로그아웃(온라인 401)만 랜딩으로(가입 입구가 랜딩에 있다). expiredOffline은 안 걸린다.
  if (auth == AuthStatus.signedOut && protected) return '/landing';
  // OFF-AUTH-01: expiredOffline이면 캐시 읽기전용 화면 유지 — 로그인으로 보내지 않는다.
  if (auth == AuthStatus.expiredOffline) return null;
  // NAV-GLOBAL-04(갭 #43): 인증됐지만 프로필 미완료면 가입 ③으로(profileMissingProvider는 Task 13이 채운다).
  if (auth == AuthStatus.signedIn &&
      profileMissing &&
      !loc.startsWith('/signup')) {
    return '/signup/step3';
  }
  // #6(2026-09-05): 앱을 껐다 켜도 Supabase 세션은 살아 있다(supabase_flutter가 저장·자동복원).
  // 초기 위치가 /landing이라 세션이 있어도 로그인 화면처럼 보였다 → 세션 있고 프로필 완료면 홈으로 보낸다.
  // (profileMissing이면 위에서 이미 step3로 갔다.) /login은 로그인 후 사용자가 직접 갈 일이 없어 건드리지 않는다.
  if (auth == AuthStatus.signedIn && !profileMissing && loc == '/landing') {
    return '/home';
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
Future<void> _afterSignupOtp(
    BuildContext context, WidgetRef ref, String phone) async {
  final exists = await ref.read(authRepoProvider).hasProfile();
  if (!context.mounted) return;
  if (exists) {
    context.go('/duplicate', extra: {'phone': phone});
  } else {
    context.go('/signup/step3');
  }
}

/// 스트림(세션 변화 등)을 GoRouter의 refreshListenable로 잇는 얇은 어댑터.
/// go_router 14엔 GoRouterRefreshStream 공개 export가 없어 직접 둔다.
class _StreamRefresh extends ChangeNotifier {
  _StreamRefresh(Stream<dynamic> stream) {
    _sub = stream.asBroadcastStream().listen((_) => notifyListeners());
  }
  late final StreamSubscription<dynamic> _sub;
  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

/// 라우터를 함수로 감싸 테스트가 시작 위치를 주입할 수 있게 한다. main.dart는 기본 인스턴스를 쓴다.
/// [refresh]가 있으면 그 신호마다 redirect를 다시 평가한다(세션 복원 시 /landing→/home, #6).
GoRouter buildAppRouter({String initialLocation = '/landing', Listenable? refresh}) => GoRouter(
      initialLocation: initialLocation,
      refreshListenable: refresh,
      redirect: _authRedirect,
      routes: [
        // #40: 로그인 전 첫 화면 — [로그인]+[회원가입] 큰 버튼(AUTH-LAND-01). 가입 입구가 여기 있다.
        GoRoute(path: '/landing', builder: (c, s) => const LandingScreen()),
        GoRoute(
          path: '/login',
          builder: (c, s) {
            final extra = s.extra as Map?; // NAV-AUTH-06: 갈림길에서 온 번호
            final next = s.uri.queryParameters['next']; // NAV-AUTH-18: 딥링크 목적지
            return Consumer(
                builder: (c, ref, _) => LoginScreen(
                      controller: LoginController(ref.read(authRepoProvider)),
                      prefillPhone: extra?['phone'] as String?,
                      onSuccess: () =>
                          c.go(next ?? '/home'), // AUTH-LOGIN-09·NAV-AUTH-10·18
                      onForgot: () => c.push('/password-find'), // NAV-AUTH-11
                      onPhoneChanged: () =>
                          c.push('/phone-change'), // NAV-AUTH-12
                    ));
          },
        ),
        // ⓪동의 → ①전화 → ②인증(분기) → ③기본정보 (화면은 T13, 여기선 콜백만 잇는다)
        GoRoute(
            path: '/signup',
            builder: (c, s) => const ConsentScreen()), // NAV-AUTH-02
        GoRoute(
          path: '/signup/phone',
          builder: (c, s) => Consumer(
              builder: (c, ref, _) => SignupPhoneScreen(
                  controller: SignupPhoneController(ref.read(authRepoProvider),
                      ref.read(phoneCooldownStoreProvider)))), // NAV-AUTH-03
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
                onSuccess: () =>
                    _afterSignupOtp(c, ref, phone), // NAV-AUTH-04·05
              );
            });
          },
        ),
        GoRoute(
          path: '/signup/step3',
          builder: (c, s) => Consumer(
              builder: (c, ref, _) {
                final consent = ref.watch(consentProvider); // 동의 화면이 들고 온 실제 체크 상태
                return SignupProfileScreen(
                  controller:
                      SignupProfileController(ref.read(signupProfileRepoProvider)),
                  adsAgreed: consent.ads,
                  // 서버 계약(F-05v1)에 실을 필수 동의 3종 — 실제 체크 상태 그대로.
                  consents: (
                    terms: consent.terms,
                    privacy: consent.privacy,
                    sensitive: consent.sensitive,
                  ),
                  onDone: () => c.go('/home'), // AUTH-SIGNUP-07: 홈으로(축하 화면 없음)
                );
              }), // NAV-AUTH-08·09
        ),
        GoRoute(
          path: '/duplicate',
          builder: (c, s) {
            final phone = (s.extra as Map)['phone'] as String;
            return Consumer(
                builder: (c, ref, _) => DuplicateAccountScreen(
                      phone: phone,
                      repo: ref.read(authRepoProvider),
                      onLogin: () => c.go('/login',
                          extra: {'phone': phone}), // NAV-AUTH-06(번호 채워)
                      onChangePassword: () =>
                          c.go('/new-password'), // NAV-AUTH-07
                      onRecentlyReceived: () =>
                          c.push('/phone-change'), // AUTH-DUP-14
                    ));
          },
        ),
        GoRoute(
          path: '/password-find',
          builder: (c, s) => Consumer(
              builder: (c, ref, _) => PasswordFindScreen(
                    controller:
                        PasswordFindController(ref.read(authRepoProvider)),
                    onSent: (phone) => c.push('/password-find/otp',
                        extra: {'phone': phone}), // NAV-AUTH-13
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
                    controller:
                        NewPasswordController(ref.read(authRepoProvider)),
                    onDone: () => c.go(
                        '/login'), // AUTH-PWNEW-04(로그인 화면으로) — NAV-AUTH-15 갱신
                  )),
        ),
        GoRoute(
            path: '/phone-change',
            builder: (c, s) => const PhoneChangeScreen()),
        // ⭐ 재인증(/reauth)은 셸 밖이 아니라 셸 안이다 — 막다른 길 방지로 **탭바가 있어야** 한다
        //    (AUTH-REAUTH-02b, 사용자 지적 2026-09-01). redirect로 들어와 뒤로가기가 없으니, 홈·예약 등
        //    아무 탭이나 눌러 빠져나갈 수 있어야 한다. 정의는 아래 ShellRoute 안.
        // QR 전체화면은 몰입(탭바·오프라인 띠 없음) — 셸 밖. 그 화면이 자체 줄을 넣는다(OFF-BAN-05).
        GoRoute(
            path: '/qr/:id',
            builder: (c, s) => QrRoute(
                appointmentId: s.pathParameters['id']!)), // NAV-HOME-02(화면=T17)
        // ── 로그인 후 전역 셸: 하단 탭 5개 + 오프라인 띠(NAV-GLOBAL-01). 데모 BottomTabBar 모델 ──
        // 탭 소속 아닌 화면(설정·상세·문진…)에도 탭바를 얹어 막다른 길을 없앤다(활성 강조만 없음).
        ShellRoute(
          builder: (c, s, child) =>
              AppShell(body: child, bottomTabs: const MainTabs()),
          routes: [
            // 홈(NAV-HOME-19: 로그인 후 홈에는 탭 바가 있다).
            GoRoute(path: '/home', builder: (c, s) => const HomeScreen()),
            // 민감화면 재인증(NAV-GLOBAL-05·AUTH-REAUTH-*). 셸 안에 둬 탭바로 빠져나갈 수 있게 한다
            // (AUTH-REAUTH-02b 막다른 길 방지). _isSensitive는 /reauth를 안 덮어 무한 redirect 없음.
            GoRoute(
              path: '/reauth',
              builder: (c, s) {
                final next = s.uri.queryParameters['next'] ?? '/home';
                return Consumer(
                    builder: (c, ref, _) => ReauthScreen(
                          controller: ReauthController(ref.read(authRepoProvider)),
                          guard: ref.read(sensitiveReauthGuardProvider),
                          onPassed: () =>
                              c.go(next), // NAV-GLOBAL-05: 원래 가려던 민감 화면으로
                          onForgot: () => c.push('/password-find'), // NAV-AUTH-17
                          onCancel: () =>
                              c.go('/home'), // 닫기(X)도 남긴다 — 탭바와 함께 나가는 문 둘
                        ));
              },
            ),
            // 예약 마법사 — 탭 다녀와도 상태 유지(NAV-BOOK-21 = BOOK-KEEP-01).
            GoRoute(
              path: '/booking',
              builder: (c, s) => const BookingWizard(),
              redirect: (c, s) {
                // BOOK-NAV-09 — 예약은 오프라인에서 못 한다. 진입점 버튼이 이미 회색이지만 딥링크 방어로 한 번 더.
                final online = ProviderScope.containerOf(c)
                        .read(connectivityProvider)
                        .valueOrNull ??
                    true;
                return online ? null : '/home';
              },
            ),
            // 나의 예약 목록(T30, NAV-LIST-01: 예약 탭 목적지). HOME-KILL·상세·탈퇴도 여기로 온다.
            GoRoute(
                path: '/my', builder: (c, s) => const MyAppointmentsScreen()),
            GoRoute(
                path: '/family',
                builder: (c, s) => const FamilyListScreen()), // 환자앱 T25
            // 환자앱 T26 — 가족 추가 갈래·㉮ 등록·㉯ OTP 연결. _isSensitive가 이미 /family를 덮는다.
            GoRoute(
                path: '/family/add',
                builder: (c, s) => const FamilyAddChoiceScreen()),
            GoRoute(
                path: '/family/add/new',
                builder: (c, s) => const FamilyNewScreen()),
            GoRoute(
                path: '/family/add/link',
                builder: (c, s) => const FamilyLinkFormScreen()),
            GoRoute(
                path: '/family/add/link/otp',
                builder: (c, s) => const FamilyLinkOtpPage()),
            GoRoute(
                path: '/family/:id/edit',
                builder: (c, s) =>
                    FamilyEditScreen(familyPatientId: s.pathParameters['id']!)),
            GoRoute(
                path: '/appointments/:id',
                builder: (c, s) => AppointmentDetailScreen(
                      s.pathParameters['id']!,
                      changed: s.uri.queryParameters['changed'] ==
                          '1', // APPT-CHG-12 변경 완료 안내
                    )), // 환자앱 T21
            // 환자앱 T22 — 변경 마법사·취소 흐름(상세 [예약 변경]·[예약 취소]가 push, NAV-APPT-07·12).
            GoRoute(
                path: '/appointments/:id/change',
                builder: (c, s) => ChangeScreen(s.pathParameters['id']!)),
            GoRoute(
                path: '/appointments/:id/cancel',
                builder: (c, s) =>
                    CancelLauncherScreen(s.pathParameters['id']!)),

            GoRoute(
                path: '/history',
                builder: (c, s) => HistoryScreen(
                    deepLinkAppointment: s.uri.queryParameters['appointment'])),
            // ── 설정(Task 28) — T14 redirect가 /settings 하위를 이미 지킨다(NAV-SET-01·02) ──
            GoRoute(
                path: '/settings',
                builder: (c, s) => const SettingsHomeScreen()), // SET-HOME
            GoRoute(
                path: '/settings/notifications',
                builder: (c, s) =>
                    const NotificationSettingsScreen()), // NAV-SET-04
            // T26 자리표시자(_Placeholder('병원 안내'))를 실화면으로 교체 — NAV-FAM-12·AUTH-OTP-11의 도착지가 실화면이 됐다.
            GoRoute(
                path: '/settings/hospital',
                builder: (c, s) => const HospitalInfoScreen()), // NAV-SET-07
            // ── T29 실화면 (로그아웃은 팝업이라 라우트 없음, NAV-SET-08) ──
            GoRoute(
              path: '/settings/password', // NAV-SET-05·14
              builder: (c, s) => SettingsPasswordScreen(onDone: () {
                c.go('/settings');
                ScaffoldMessenger.of(c).showSnackBar(const SnackBar(
                    content: Text('비밀번호를 바꿨습니다'))); // NAV-SET-14·SET-PW-13
              }),
            ),
            GoRoute(
                path: '/settings/withdraw',
                builder: (c, s) => const WithdrawScreen()), // NAV-SET-09·10~13
            // NAV-HOME 목적지(화면은 T17·18·23 소유 — 여기선 라우트 표만 잇는다).
            // 알림함(데모 정본대로 탭바 있음 — 전역 셸이 담당).
            GoRoute(
                path: '/notifications',
                builder: (c, s) =>
                    const NotificationInbox()), // NAV-HOME-12(T18)
            GoRoute(
                path: '/questionnaire',
                builder: (c, s) => const _Placeholder('사전문진')), // 문진 탭
            GoRoute(
                path: '/questionnaire/:id',
                builder: (c, s) {
                  final id = s.pathParameters['id']!;
                  final start = s.uri.queryParameters['start'];
                  // ?start=N → 마법사가 그 문항으로(이어쓰기 [이어서]/[처음부터], 확인 [고치기]). 없으면 상태 분기.
                  // from=confirm이면 [고치기] 한 문항 편집 → 저장 후 확인으로 복귀(#4·NAV-QNR-14).
                  if (start != null) {
                    return QuestionnaireWizard(
                        appointmentId: id,
                        startIndex: int.tryParse(start) ?? 0,
                        from: s.uri.queryParameters['from']);
                  }
                  return QuestionnaireEntry(appointmentId: id);
                }), // NAV-HOME-05·NAV-QNR (화면=T23)
            GoRoute(
                path: '/questionnaire/:id/confirm',
                builder: (c, s) {
                  final id = s.pathParameters['id']!;
                  final from = s.uri.queryParameters['from'];
                  return ConfirmScreen(
                      appointmentId: id,
                      readOnly: false,
                      returnTo: returnRouteFor(from, id));
                }),
            // AI 상담 탭 = 곧바로 상담방(CHAT-TAB-NAV-01·NAV-CHATAPP-01). 세션 확보 후 방을 연다.
            // 이전 상담 목록은 방 앱바의 '지난 상담' 아이콘 → /chat/history 로 옮겼다(옛날엔 이 탭이
            // 목록이라 규칙·데모와 어긋났다).
            GoRoute(
                path: '/chat',
                builder: (c, s) => const ChatRoomEntry(showHistory: true)),
            GoRoute(
                path: '/chat/history',
                // push로 열어 뒤로가기 스택을 남긴다 — 방에서 뒤로가면 목록으로 돌아온다(NAV-CHATAPP-10).
                // go면 스택이 없어 셸 밖 방이 막다른 길이 됐다(⑦). 콜드스타트 딥링크는 스택이 없어도
                // ChatRoomView.onExit가 /chat/history로 보낸다(CHAT-HISTORY-DEEP-02).
                builder: (c, s) => ChatHistoryView(
                    onOpen: (id) => c.push('/chat/room/$id'))), // NAV-CHATAPP-10 · CHAT-HISTORY-LIST-01
            // 지난 상담 이어보기(상세). ⭐ 셸 **안**에 둬 하단 탭바를 유지한다(막다른 길 금지·다른 상세
            // 화면과 일관) — 예전엔 셸 밖 풀스크린이라 탭이 없어 갇혔다(2026-09-08 실기기 지적).
            // push 스택이 있으면 방 앱바 뒤로가기=목록, 콜드스타트(스택 0)는 onExit가 /chat/history로.
            // 전역 _authRedirect가 미인증 콜드스타트를 로그인으로 보낸다(CHAT-HISTORY-DEEP-02).
            GoRoute(
                path: '/chat/room/:threadId',
                // [새 대화]로 연 방(extra==true, primary)=현재 대화처럼 연다(뒤로가기 없음·'지난 상담' 아이콘 有).
                // 목록에서 연 방(extra 없음)=뒤로가기로 이전 상담 목록 복귀(CHAT-HISTORY-DEEP-02).
                builder: (c, s) => ChatRoomEntry(
                    threadId: s.pathParameters['threadId']!,
                    primary: s.extra == true)),
          ],
        ),
      ],
    );

// 세션 변화(로그인/로그아웃/앱 재시작 시 초기세션 복원)마다 redirect를 다시 평가하는 신호.
// Supabase 미초기화(위젯 테스트 등)면 null — 예전처럼 새로고침 없이 동작한다.
Listenable? _authRefresh() {
  try {
    return _StreamRefresh(Supabase.instance.client.auth.onAuthStateChange);
  } catch (_) {
    return null; // 테스트 등 Supabase.initialize 전 환경
  }
}

// main.dart가 쓰는 기본 인스턴스. top-level final은 최초 접근(app.dart build) 시 지연 초기화되므로
// 프로덕션에선 Supabase.initialize 이후 실행된다 — 저장된 세션이 살아나면 /landing→/home(#6).
final GoRouter appRouter = buildAppRouter(refresh: _authRefresh());

class _Placeholder extends StatelessWidget {
  const _Placeholder(this.label);
  final String label;
  @override
  Widget build(BuildContext context) =>
      Scaffold(body: Center(child: Text(label)));
}
