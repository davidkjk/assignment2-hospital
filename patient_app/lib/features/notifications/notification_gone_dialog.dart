import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/tokens.dart';
import 'notification_data.dart';
import 'notification_view.dart';

/// 알림 한 줄을 눌렀을 때: 종류별 목적지로 가되, 갈 곳이 없어졌으면 팝업만(이동 안 함).
/// ⭐ 딥링크(Task 11 PushService)도 resolveNotificationDestination·showNotificationGoneDialog를 재사용한다(NOTI-GONE-05).
Future<void> openNotification(BuildContext context, WidgetRef ref, NotificationView view) async {
  final route = resolveNotificationRoute(view);
  if (route == null) {
    // 직원 직접 안내(staff_direct)가 특정 예약을 가리키지 않으면 = 순수 공지다. 열 곳이 없을 뿐
    // 「사라진 예약」이 아니므로 오도 팝업(이 예약은 볼 수 없습니다)을 띄우지 않고 조용히 넘긴다.
    if (view.notificationType == 'staff_direct' && view.appointmentId == null) return;
    // 목적지 자체가 정의되지 않음(예: appointment_id 없는 변경 알림) → 갈 곳 없음.
    showNotificationGoneDialog(context);
    return;
  }
  final exists = await resolveNotificationDestination(ref, view); // NOTI-GONE-03: 누른 그 순간에만 확인
  if (!context.mounted) return;
  if (!exists) {
    showNotificationGoneDialog(context); // 팝업 + 이동 안 함 + 알림은 목록에 그대로(GONE-01·02)
    return;
  }
  context.go(route); // NAV-HOME-16
}

/// 누른 그 순간 목적지 존재 확인. 예약 기반이면 GET /my/appointments/{id}(없음/권한없음 → false).
/// 상담방(support_answered)은 4단계 챗봇이 소유 — 항상 true(그전엔 그 타입 행 자체가 없어 무해).
Future<bool> resolveNotificationDestination(WidgetRef ref, NotificationView view) async {
  if (view.notificationType == 'support_answered') return true;
  final id = view.appointmentId;
  if (id == null) return false;
  return ref.read(notificationApiProvider).appointmentExists(id);
}

/// NOTI-GONE-01·04: 사유를 단정하지 않고 두 가능성을 함께. 이동 없음.
void showNotificationGoneDialog(BuildContext context) {
  showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: AppTokens.surface,
      title: const Text('이 예약은 더 이상 볼 수 없습니다',
          style: TextStyle(fontWeight: FontWeight.bold)),
      content: const Text('예약이 취소되었거나 가족 연결이 해제되었을 수 있습니다',
          style: TextStyle(color: AppTokens.grayPending)),
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(),
          child: const Text('닫기'),
        ),
      ],
    ),
  );
}
