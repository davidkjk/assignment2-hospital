import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'home_data.dart'; // homeAppointmentsProvider(예약 탭 복귀 시 재조회 — LIST-REFRESH-06)

/// 하단 탭 셸 5개(데모 정본): 홈·예약·가족·이력·AI 상담. 설정은 탭이 아니라 홈 앱바 톱니(HOME-BAR-01).
/// DISP-ICON-03 — 아이콘 아래 글자 라벨을 항상 유지한다. 오프라인에도 눌린다(NAV-GLOBAL-02).
class MainTabs extends ConsumerWidget {
  const MainTabs({super.key});

  static const _dests = [
    ('/home', Icons.home, '홈'),
    ('/my', Icons.calendar_month, '예약'), // NAV-LIST-01: 탭은 목록(/my)이다 — 마법사(/booking) 아님. 데모 CalendarDots(체크 없는 달력)에 맞춤(DISP-ICON-03)

    ('/family', Icons.groups, '가족'),
    ('/history', Icons.history, '이력'),
    ('/chat', Icons.chat_bubble, 'AI 상담'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = GoRouterState.of(context).matchedLocation;
    var index = _dests.indexWhere((d) => loc.startsWith(d.$1));
    if (index < 0) index = 0;
    return BottomNavigationBar(
      currentIndex: index,
      type: BottomNavigationBarType.fixed,
      onTap: (i) {
        final dest = _dests[i].$1;
        // LIST-REFRESH-06: 예약 탭을 (다시) 누르면 나의 예약을 다시 조회한다(홈·이력과 같은 규칙 NAV-HIST-13).
        if (dest == '/my') ref.invalidate(homeAppointmentsProvider);
        context.go(dest);
      },
      items: [
        for (final d in _dests)
          BottomNavigationBarItem(icon: Icon(d.$2), label: d.$3), // 라벨 유지(DISP-ICON-03)
      ],
    );
  }
}
