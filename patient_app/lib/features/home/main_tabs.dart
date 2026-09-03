import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/tokens.dart';
import 'home_data.dart'; // homeAppointmentsProvider(예약 탭 복귀 시 재조회 — LIST-REFRESH-06)

/// 하단 탭 셸 5개(데모 정본): 홈·예약·가족·이력·AI 상담. 설정은 탭이 아니라 홈 앱바 톱니(HOME-BAR-01).
/// DISP-ICON-03 — 아이콘 아래 글자 라벨을 항상 유지한다. 오프라인에도 눌린다(NAV-GLOBAL-02).
///
/// 겉모양 = 데모 커스텀 플랫 바(`BottomTabBar.tsx`, 결정3): Material 기본 BottomNavigationBar가
/// 아래로 떨어지는 elevation 그림자를 주는 것과 달리, 데모는 흰 면(bg-card) + 위쪽 얇은 테두리
/// (border-t border-border/60) + **위로 뜨는** 옅은 그림자(0 -1px 10px rgba(0,0,0,.05))로 셸과
/// 본문을 가른다. 각 탭은 아이콘 20(h-5)·라벨 11px·활성 primary/비활성 muted.
class MainTabs extends ConsumerWidget {
  const MainTabs({super.key});

  // 글리프는 Phosphor fill(Home·CalendarDays·Users·History·MessageCircle)의 Material 근사 채움본.
  static const _dests = [
    ('/home', AppIcons.home, '홈'),
    ('/my', AppIcons.calendar_month, '예약'), // NAV-LIST-01: 탭은 목록(/my)이다 — 마법사(/booking) 아님. 데모 CalendarDays(체크 없는 달력)에 맞춤(DISP-ICON-03)
    ('/family', AppIcons.groups, '가족'),
    ('/history', AppIcons.history, '이력'),
    ('/chat', AppIcons.chat_bubble, 'AI 상담'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = GoRouterState.of(context).matchedLocation;
    var index = _dests.indexWhere((d) => loc.startsWith(d.$1));
    if (index < 0) index = 0;

    void onTap(int i) {
      final dest = _dests[i].$1;
      // LIST-REFRESH-06: 예약 탭을 (다시) 누르면 나의 예약을 다시 조회한다(홈·이력과 같은 규칙 NAV-HIST-13).
      if (dest == '/my') ref.invalidate(homeAppointmentsProvider);
      context.go(dest);
    }

    return DecoratedBox(
      decoration: const BoxDecoration(
        color: AppTokens.surface, // 데모 bg-card
        border: Border(top: BorderSide(color: _topBorder)), // border-t border-border/60
        boxShadow: [
          // 위로 뜨는 옅은 그림자(데모 0 -1px 10px rgba(0,0,0,.05))
          BoxShadow(color: Color(0x0D000000), offset: Offset(0, -1), blurRadius: 10),
        ],
      ),
      // InkWell 리플을 위한 Material(투명) — DecoratedBox의 흰 면·테두리·그림자는 그대로 비친다.
      child: Material(
        type: MaterialType.transparency,
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              for (var i = 0; i < _dests.length; i++)
                Expanded(
                  child: _TabButton(
                    icon: _dests[i].$2,
                    label: _dests[i].$3,
                    active: i == index,
                    onTap: () => onTap(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// border-border/60 = 테두리 색을 60% 불투명으로(데모).
const Color _topBorder = Color(0x99C7C7C7); // AppTokens.border(C7C7C7 중립) @ 0.6 alpha (0x99)

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppTokens.primary : AppTokens.grayPending;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8), // 데모 py-2
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 23, color: color), // 데모 h-5 기준서 살짝 키움(사용자 요청 — 탭 아이콘 더 크게)
            const SizedBox(height: 2), // 데모 gap-0.5
            Text(
              label, // 라벨 유지(DISP-ICON-03)
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: color),
            ),
          ],
        ),
      ),
    );
  }
}
