import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// 하단 탭 셸 5개(홈·예약·문진·이력·설정). DISP-ICON-03 — 아이콘 아래 글자 라벨을 항상 유지한다.
/// 오프라인에도 눌린다(막지 않는다, NAV-GLOBAL-02) — 막는 판단은 각 탭 화면 몫.
class MainTabs extends StatelessWidget {
  const MainTabs({super.key});

  static const _dests = [
    ('/home', Icons.home_outlined, '홈'),
    ('/booking', Icons.event_available_outlined, '예약'),
    ('/questionnaire', Icons.assignment_outlined, '문진'),
    ('/history', Icons.history, '이력'),
    ('/settings', Icons.settings_outlined, '설정'),
  ];

  @override
  Widget build(BuildContext context) {
    final loc = GoRouterState.of(context).matchedLocation;
    var index = _dests.indexWhere((d) => loc.startsWith(d.$1));
    if (index < 0) index = 0;
    return BottomNavigationBar(
      currentIndex: index,
      type: BottomNavigationBarType.fixed,
      onTap: (i) => context.go(_dests[i].$1),
      items: [
        for (final d in _dests)
          BottomNavigationBarItem(icon: Icon(d.$2), label: d.$3), // 라벨 유지(DISP-ICON-03)
      ],
    );
  }
}
