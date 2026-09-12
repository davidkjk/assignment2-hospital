import 'package:flutter/material.dart';
import 'offline_banner.dart';

// 모든 탭 화면을 감싸 배너를 맨 위에 얹는다(NAV-GLOBAL-01: 화면은 그대로, 띠만 얹음).
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.body, required this.bottomTabs});
  final Widget body;
  final Widget bottomTabs;                    // EMPTY-TAB-01·NAV-GLOBAL-02: 오프라인에도 탭은 눌린다(막지 않는다)

  @override
  Widget build(BuildContext context) {
    // A안: 키보드가 올라오면 탭바를 숨긴다. 루트(Column)는 키보드를 회피하지 않아 탭바가 키보드 뒤에 깔리는데,
    // 안쪽 화면 Scaffold가 resizeToAvoidBottomInset으로 키보드 전체 높이를 또 빼 **탭바 높이만큼 간격**이 떴다.
    // 타이핑 중 탭바를 빼면 화면(Expanded) 바닥이 물리적 바닥까지 내려가 입력창이 키보드 바로 위에 붙는다(간격 0).
    // 키보드를 내리면(전역 탭-디스미스) 탭바가 즉시 복귀해 다른 탭으로 갈 수 있다(막다른 길 아님).
    final keyboardUp = MediaQuery.of(context).viewInsets.bottom > 0;
    return Column(children: [
      const OfflineBanner(),                  // OFF-BAN-05(QR 전체화면은 그 화면이 같은 줄을 따로 넣는다 — 셸 밖이라 cross-ref)
      Expanded(child: body),
      if (!keyboardUp) bottomTabs,            // NAV-GLOBAL-02: 오프라인엔 눌린다(막지 않음) — 키보드 내리면 복귀
    ]);
  }
}
