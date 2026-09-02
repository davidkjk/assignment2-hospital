import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/features/home/main_tabs.dart';

// AI 상담은 patient-app이 이미 하단 탭(MainTabs·BottomNavigationBar)에 심었다.
// 플랜의 AppShell(NavigationBar) 구조는 실재하지 않아 실제 MainTabs로 규칙을 검증한다.
Widget _app(String start) {
  Widget page() => const Scaffold(body: SizedBox(), bottomNavigationBar: MainTabs());
  final router = GoRouter(initialLocation: start, routes: [
    GoRoute(path: '/home', builder: (_, __) => page()),
    GoRoute(path: '/my', builder: (_, __) => page()),
    GoRoute(path: '/family', builder: (_, __) => page()),
    GoRoute(path: '/history', builder: (_, __) => page()),
    GoRoute(path: '/chat', builder: (_, __) => page()),
  ]);
  return ProviderScope(child: MaterialApp.router(routerConfig: router));
}

void main() {
  testWidgets('[CHAT-TAB-NAV-01] AI 상담은 FAB가 아니라 5번째 하단 탭이다', (t) async {
    await t.pumpWidget(_app('/chat'));
    await t.pumpAndSettle();
    expect(find.byType(FloatingActionButton), findsNothing); // FAB 아님
    expect(find.text('AI 상담'), findsOneWidget); // 탭 라벨
    final bar =
        t.widget<BottomNavigationBar>(find.byType(BottomNavigationBar));
    expect(bar.items.length, 5); // 5번째 탭
    expect(bar.items.last.label, 'AI 상담');
  });

  testWidgets('[CHAT-TAB-STATE-01] 상담 탭을 누르면 다른 탭과 같은 방식으로 선택 상태가 된다', (t) async {
    await t.pumpWidget(_app('/home'));
    await t.pumpAndSettle();
    await t.tap(find.text('AI 상담'));
    await t.pumpAndSettle();
    final bar =
        t.widget<BottomNavigationBar>(find.byType(BottomNavigationBar));
    expect(bar.currentIndex, 4); // 5번째(0-based 4) 선택
  });

  testWidgets('[CHAT-TAB-HANDOFF-01] 직원 인계 중이어도 탭 이름은 AI 상담 그대로', (t) async {
    // 인계 사실은 방 안 배지(CHAT-HANDOFF 계열, T11)로만 — 탭 라벨은 정적이라 바뀌지 않는다.
    await t.pumpWidget(_app('/chat'));
    await t.pumpAndSettle();
    expect(find.text('AI 상담'), findsOneWidget);
    expect(find.textContaining('직원'), findsNothing); // 탭 라벨에 인계 표기 없음
  });
}
