import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// 하단 탭 셸 5개(데모 정본): 홈·예약·가족·이력·AI 상담. 설정은 탭이 아니라 홈 앱바 톱니(HOME-BAR-01).
/// DISP-ICON-03 — 아이콘 아래 글자 라벨을 항상 유지한다. 오프라인에도 눌린다(NAV-GLOBAL-02).
class MainTabs extends StatelessWidget {
  const MainTabs({super.key});

  static const _dests = [
    ('/home', Icons.home_outlined, '홈'),
    ('/booking', Icons.event_available_outlined, '예약'),
    ('/family', Icons.groups_outlined, '가족'),
    ('/history', Icons.history, '이력'),
    ('/chat', Icons.chat_bubble_outline, 'AI 상담'),
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
