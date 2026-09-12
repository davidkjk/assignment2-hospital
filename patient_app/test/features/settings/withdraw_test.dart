import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/settings/logout_confirm.dart' show pushServiceProvider;
import 'package:hospital_patient_app/features/settings/withdraw_repository.dart';
import 'package:hospital_patient_app/features/settings/withdraw_screen.dart';

import 'harness.dart';

late GoRouter _router;

Future<(FakeWithdrawRepo, FakePushService)> _pump(WidgetTester t,
    {required List<WithdrawBlock> blocks, bool offline = false}) async {
  await t.binding.setSurfaceSize(const Size(390, 950));
  addTearDown(() => t.binding.setSurfaceSize(null));
  final repo = FakeWithdrawRepo(blocks);
  final push = FakePushService();
  _router = GoRouter(initialLocation: '/settings/withdraw', routes: [
    GoRoute(path: '/settings/withdraw', builder: (c, s) => const WithdrawScreen()),
    GoRoute(path: '/my', builder: (c, s) => const Scaffold(body: Text('나의예약'))),
    GoRoute(path: '/login', builder: (c, s) => const Scaffold(body: Text('로그인화면'))),
  ]);
  await t.pumpWidget(ProviderScope(
    overrides: [
      withdrawRepositoryProvider.overrideWithValue(repo),
      pushServiceProvider.overrideWithValue(push),
      if (offline) connectivityProvider.overrideWith((ref) => Stream.value(false)),
    ],
    child: MaterialApp.router(theme: AppTheme.theme, routerConfig: _router),
  ));
  await t.pumpAndSettle();
  return (repo, push);
}

void main() {
  testWidgets('[SET-QUIT-04·06·07·08] 전용 화면에 고지 네 줄', (t) async {
    await _pump(t, blocks: []);
    expect(find.textContaining('법으로 정해진 기간 동안 병원에 안전하게 보관'), findsOneWidget);
    expect(find.textContaining('예약·가족·사전문진을 더 이상 볼 수 없'), findsOneWidget);
    expect(find.textContaining('가족 연결이 모두 해제'), findsOneWidget);
    expect(find.textContaining('같은 휴대폰 번호로 다시 가입'), findsOneWidget);
  });

  testWidgets('[SET-QUIT-03·19·20] 무게 3단 — 화면 버튼 → 확인창 → 채운 빨강', (t) async {
    await _pump(t, blocks: []);
    expect(t.widget<OutlinedButton>(find.byKey(const Key('withdraw-proceed'))).onPressed, isNotNull);
    await t.tap(find.byKey(const Key('withdraw-proceed')));
    await t.pumpAndSettle();
    expect(find.textContaining('정말 탈퇴하시겠어요'), findsOneWidget); // SET-QUIT-19
    expect(find.byKey(const Key('withdraw-final')), findsOneWidget);   // SET-QUIT-20 채운 빨강
  });

  testWidgets('[SET-QUIT-15·17·18] 막는 예약이 있으면 목록 + 비활성 버튼(사라지지 않음)', (t) async {
    await _pump(t, blocks: [block(name: '김순자', dept: '내과', isFamily: true)]);
    expect(find.text('먼저 예약을 취소해 주세요'), findsOneWidget);
    expect(find.textContaining('김순자'), findsOneWidget);            // 가족이면 이름
    expect(t.widget<OutlinedButton>(find.byKey(const Key('withdraw-proceed'))).onPressed, isNull);
    await t.tap(find.byKey(const Key('go-appointments')));            // NAV-SET-11
    await t.pumpAndSettle();
    expect(find.text('나의예약'), findsOneWidget);
  });

  testWidgets('[SET-QUIT-19·21·23·26] 확인창에서 탈퇴 실행 → 로그인', (t) async {
    final (repo, push) = await _pump(t, blocks: []);
    await t.tap(find.byKey(const Key('withdraw-proceed')));           // NAV-SET-10
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('withdraw-final')));
    await t.pumpAndSettle();
    expect(repo.deactivateCalls, 1);
    expect(push.unregisterCalls, 1);                                 // SET-QUIT-23
    expect(find.text('로그인화면'), findsOneWidget);                  // SET-QUIT-26·NAV-SET-12
  });

  testWidgets('[NAV-SET-13] 확인창에서 [아니요]는 탈퇴 화면 그 자리로', (t) async {
    await _pump(t, blocks: []);
    await t.tap(find.byKey(const Key('withdraw-proceed')));
    await t.pumpAndSettle();
    await t.tap(find.text('아니요'));
    await t.pumpAndSettle();
    expect(find.byType(WithdrawScreen), findsOneWidget);
  });

  testWidgets('[SET-QUIT-27] 오프라인이면 탈퇴 버튼 비활성 + 이유', (t) async {
    await _pump(t, blocks: [], offline: true);
    expect(t.widget<OutlinedButton>(find.byKey(const Key('withdraw-proceed'))).onPressed, isNull);
    expect(find.textContaining('인터넷에 연결된 뒤에'), findsOneWidget);
  });
}
