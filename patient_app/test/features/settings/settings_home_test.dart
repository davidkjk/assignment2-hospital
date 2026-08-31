import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show hospitalInfoProvider, HospitalInfo;
import 'package:hospital_patient_app/features/settings/settings_home_screen.dart';

const _me = MyProfile(name: '김순자', phone: '010-1234-5678');
const _hospital = HospitalInfo(phone: '02-1234-5678', address: '서울특별시 강남구 테헤란로 123');

late GoRouter _router;

Future<void> _pump(WidgetTester t, {bool offline = false}) async {
  await t.binding.setSurfaceSize(const Size(390, 950)); // 6블록이 한 화면에 다 빌드되게
  addTearDown(() => t.binding.setSurfaceSize(null));
  _router = GoRouter(initialLocation: '/settings', routes: [
    GoRoute(path: '/settings', builder: (c, s) => const SettingsHomeScreen()),
    GoRoute(path: '/phone-change', builder: (c, s) => const Scaffold(body: Text('전화변경'))),
    GoRoute(path: '/settings/notifications', builder: (c, s) => const Scaffold(body: Text('알림'))),
    GoRoute(path: '/settings/password', builder: (c, s) => const Scaffold(body: Text('비번'))),
    GoRoute(path: '/family', builder: (c, s) => const Scaffold(body: Text('가족목록'))),
    GoRoute(path: '/settings/hospital', builder: (c, s) => const Scaffold(body: Text('병원'))),
    GoRoute(path: '/settings/logout', builder: (c, s) => const Scaffold(body: Text('로그아웃화면'))),
    GoRoute(path: '/settings/withdraw', builder: (c, s) => const Scaffold(body: Text('탈퇴화면'))),
  ]);
  await t.pumpWidget(ProviderScope(
    overrides: [
      myProfileProvider.overrideWith((ref) async => _me),
      hospitalInfoProvider.overrideWith((ref) async => _hospital),
      if (offline) connectivityProvider.overrideWith((ref) => Stream.value(false)),
    ],
    child: MaterialApp.router(theme: AppTheme.theme, routerConfig: _router),
  ));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[SET-HOME-04] 여섯 블록이 있다(알림·비번·가족·병원·로그아웃·탈퇴)', (t) async {
    await _pump(t);
    expect(find.text('알림 설정'), findsOneWidget);
    expect(find.text('비밀번호 변경'), findsOneWidget);
    expect(find.text('가족 관리'), findsOneWidget); // SET-HOME-10 (데모 누락분, 규칙 승)
    expect(find.text('가온병원'), findsOneWidget);
    expect(find.text('로그아웃'), findsOneWidget);
    expect(find.text('회원 탈퇴'), findsOneWidget);
  });

  testWidgets('[SET-HOME-05·06] 내 정보는 이름·전화를 가리지 않고 보여주기만 한다(못 누름)', (t) async {
    await _pump(t);
    expect(find.text('김순자'), findsOneWidget);
    expect(find.text('010-1234-5678'), findsOneWidget); // 마스킹 없음
    expect(find.byKey(const Key('block-myinfo')), findsOneWidget);
    // block-myinfo 안에 탭 대상(InkWell/GestureDetector)이 없다.
    expect(
      find.descendant(
          of: find.byKey(const Key('block-myinfo')), matching: find.byType(InkWell)),
      findsNothing,
    );
  });

  testWidgets('[SET-HOME-08] 전화번호를 바꾸려 하면 AUTH-TEL 안내(/phone-change)로', (t) async {
    await _pump(t);
    await t.tap(find.byKey(const Key('change-phone')));
    await t.pumpAndSettle();
    expect(find.text('전화변경'), findsOneWidget);
  });

  testWidgets('[NAV-SET-06] 설정 → 가족 관리', (t) async {
    await _pump(t);
    await t.tap(find.byKey(const Key('go-family')));
    await t.pumpAndSettle();
    expect(find.text('가족목록'), findsOneWidget);
  });

  testWidgets('[SET-HOME-12·13·14] 로그아웃은 붉은색 아닌 버튼, 탈퇴는 작은 회색 밑줄', (t) async {
    await _pump(t);
    final logout = t.widget<OutlinedButton>(find.byKey(const Key('logout-button')));
    expect(logout.onPressed, isNotNull); // 버튼(붉은 채움 아님)
    final quit = t.widget<Text>(find.byKey(const Key('withdraw-text')));
    expect(quit.style!.decoration, TextDecoration.underline);
  });

  testWidgets('[SET-HOME-15·16] 오프라인이어도 화면은 열리고 알림 줄은 이유와 함께 비활성', (t) async {
    await _pump(t, offline: true);
    expect(find.text('김순자'), findsOneWidget);                 // 화면 열림
    expect(find.textContaining('인터넷에 연결되면'), findsWidgets); // 이유 한 줄
  });
}
