import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/tokens.dart';

// ⭐ 안 읽은 알림 개수 provider(`unreadNotificationCountProvider`)의 **본체는 Task 18이 채웠다**
//    → `features/notifications/notification_data.dart`(양방향 악수 갚음). 홈은 그쪽 provider를 watch한다.

/// NAV-HOME-12 — 종을 눌러 알림함에 들어가는 순간 「전부 읽음」으로 표시한다(NOTI-READ).
/// **창구 본체는 Task 18** — 홈은 이 seam을 호출만 한다(양방향 악수).
abstract class NotificationReadMarker {
  Future<void> markAllRead();
}

class _NoopReadMarker implements NotificationReadMarker {
  @override
  Future<void> markAllRead() async {}
}

final notificationReadMarkerProvider =
    Provider<NotificationReadMarker>((ref) => _NoopReadMarker());

/// HOME-BAR-01·02 — 앱바 종(알림함). 안 읽은 게 1건 이상일 때만 개수 배지(0은 그리지 않는다).
class NotificationBell extends StatelessWidget {
  const NotificationBell({super.key, required this.unreadCount, this.onTap});
  final int unreadCount;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          const Icon(Icons.notifications),
          if (unreadCount >= 1) // HOME-BAR-02: 0이면 배지 자체가 없다
            Positioned(
              right: -4,
              top: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                    color: AppTokens.warn, borderRadius: BorderRadius.circular(8)),
                constraints: const BoxConstraints(minWidth: 16),
                child: Text('$unreadCount',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 11)),
              ),
            ),
        ],
      ),
    );
  }
}
