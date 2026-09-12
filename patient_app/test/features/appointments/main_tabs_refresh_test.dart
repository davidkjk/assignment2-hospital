import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/features/home/main_tabs.dart';

void main() {
  testWidgets('[LIST-REFRESH-06] 다른 탭 갔다 예약 탭으로 돌아오면 나의 예약을 다시 조회한다', (t) async {
    var fetches = 0;
    // /my 화면이 homeAppointmentsProvider를 watch한다 — invalidate되면 다시 조회(count++)된다.
    Widget page(String label) => Consumer(builder: (c, ref, _) {
          ref.watch(homeAppointmentsProvider);
          return Scaffold(body: Text(label), bottomNavigationBar: const MainTabs());
        });
    final router = GoRouter(initialLocation: '/my', routes: [
      GoRoute(path: '/home', builder: (c, s) => page('홈')),
      GoRoute(path: '/my', builder: (c, s) => page('예약목록')),
      GoRoute(path: '/family', builder: (c, s) => page('가족')),
      GoRoute(path: '/history', builder: (c, s) => page('이력')),
      GoRoute(path: '/chat', builder: (c, s) => page('상담')),
    ]);
    await t.pumpWidget(ProviderScope(
      overrides: [homeAppointmentsProvider.overrideWith((ref) async {
        fetches++;
        return const [];
      })],
      child: MaterialApp.router(routerConfig: router),
    ));
    await t.pumpAndSettle();
    expect(fetches, 1); // /my 진입 시 1회

    await t.tap(find.text('이력')); // 다른 탭으로
    await t.pumpAndSettle();
    await t.tap(find.text('예약')); // 예약 탭 복귀 → invalidate → 재조회
    await t.pumpAndSettle();
    expect(fetches, greaterThan(1)); // 복귀 시 재조회(NAV-HIST-13과 같은 규칙)
  });
}
