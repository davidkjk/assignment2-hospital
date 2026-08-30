import 'package:flutter/material.dart';
import 'offline_banner.dart';

// 모든 탭 화면을 감싸 배너를 맨 위에 얹는다(NAV-GLOBAL-01: 화면은 그대로, 띠만 얹음).
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.body, required this.bottomTabs});
  final Widget body;
  final Widget bottomTabs;                    // EMPTY-TAB-01·NAV-GLOBAL-02: 오프라인에도 탭은 눌린다(막지 않는다)

  @override
  Widget build(BuildContext context) => Column(children: [
        const OfflineBanner(),                // OFF-BAN-05(QR 전체화면은 그 화면이 같은 줄을 따로 넣는다 — 셸 밖이라 cross-ref)
        Expanded(child: body),
        bottomTabs,
      ]);
}
