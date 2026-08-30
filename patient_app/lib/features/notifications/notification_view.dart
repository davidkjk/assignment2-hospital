import 'package:flutter/material.dart';

/// 알림 한 건. Task 9(발송)가 notification_log에 쓴 행을 그대로 표시한다(NOTI-BODY-01).
class NotificationView {
  final String id;
  final String notificationType;
  final String kind;
  final String body; // Task 9가 PUSH 규칙대로 만든 표시 문구(대상자 이름 포함) — 그대로 쓴다(NOTI-BODY-01)
  final String? appointmentId;
  final DateTime sentAt;
  final bool isRead;
  NotificationView({
    required this.id,
    required this.notificationType,
    required this.kind,
    required this.body,
    required this.appointmentId,
    required this.sentAt,
    required this.isRead,
  });
  factory NotificationView.fromJson(Map<String, dynamic> j) => NotificationView(
        id: j['id'] as String,
        notificationType: j['notification_type'] as String,
        kind: j['kind'] as String? ?? 'transactional',
        body: j['body'] as String,
        appointmentId: j['appointment_id'] as String?,
        sentAt: DateTime.parse(j['sent_at'] as String).toLocal(),
        isRead: j['is_read'] as bool? ?? false,
      );
}

/// NOTI-GO-*: 종류 → 눌렀을 때 가는 라우트. null이면 목적지 없음(탭 시 갈 곳 없음 팝업).
String? resolveNotificationRoute(NotificationView n) {
  switch (n.notificationType) {
    case 'requested':
    case 'confirmed':
    case 'changed':
    case 'reminder_day_before':
    case 'reminder_today':
    case 'cancellation_rejected':
      return n.appointmentId == null ? null : '/appointments/${n.appointmentId}'; // GO-01·02
    case 'hospital_cancelled':
    case 'cancellation_approved':
    case 'visit_completed':
      return n.appointmentId == null ? null : '/history?appointment=${n.appointmentId}'; // GO-03·06(이력)
    case 'questionnaire_missing':
      return n.appointmentId == null ? null : '/questionnaire/${n.appointmentId}'; // GO-04
    case 'support_answered':
      return '/chat'; // GO-05(4단계) · C3-2 정본(2026-08-20, chat_reply → 통일)
    case 'family_unlinked':
      // NAV-FAM-20(환자앱 T26) — 「가족 연결 해제」 알림은 갈 곳이 없다(해제된 연결로는 열 화면이 없다).
      // null → openNotification이 showNotificationGoneDialog를 띄우고, 알림은 목록에 그대로 남는다.
      return null;
    default:
      return null;
  }
}

/// NOTI-READ-01: 중요(변경·취소)=주의색 / 일반=딥틸.
bool notificationImportant(String type) => const {
      'changed',
      'hospital_cancelled',
      'cancellation_approved',
      'cancellation_rejected',
    }.contains(type);

/// NOTI-LIST-01: 종류별 제목.
String notificationTitle(String type) => switch (type) {
      'requested' => '예약 신청',
      'confirmed' => '예약 확정',
      'changed' => '예약 변경',
      'reminder_day_before' => '내일 예약 안내',
      'reminder_today' => '오늘 예약 안내',
      'hospital_cancelled' => '예약 취소',
      'cancellation_approved' => '취소 처리',
      'cancellation_rejected' => '취소 안내',
      'questionnaire_missing' => '사전문진 안내',
      'visit_completed' => '진료 후 안내',
      'support_answered' => '상담 답변', // C3-2 정본(2026-08-20)
      _ => '알림',
    };

/// NOTI-LIST-01: 종류별 아이콘(데모 NOTIFICATION_ICON 정본 — booking=일정확인·reminder=시계·
/// change/cancel=경고·questionnaire=문진판·chat=말풍선·aftercare=문서). 채움 벡터, 이모지 금지.
IconData notificationIcon(String type) => switch (type) {
      'requested' || 'confirmed' => Icons.event_available, // 예약(CalendarCheck2)
      'reminder_day_before' || 'reminder_today' => Icons.schedule, // 리마인더(CalendarClock)
      'changed' || 'hospital_cancelled' || 'cancellation_approved' || 'cancellation_rejected' =>
        Icons.error_outline, // 변경·취소(AlertCircle)
      'questionnaire_missing' => Icons.assignment_outlined, // 문진(ClipboardList)
      'support_answered' => Icons.chat_bubble_outline, // 상담(MessageCircle)
      'visit_completed' => Icons.description_outlined, // 진료 후 안내(FileText)
      _ => Icons.notifications_none,
    };

/// NOTI-LIST-01: 날짜 묶음 머리(오늘/어제/M월 D일).
String notificationDateGroup(DateTime sentAt, DateTime now) {
  final d = DateTime(sentAt.year, sentAt.month, sentAt.day);
  final today = DateTime(now.year, now.month, now.day);
  final diff = today.difference(d).inDays;
  if (diff <= 0) return '오늘';
  if (diff == 1) return '어제';
  return '${sentAt.month}월 ${sentAt.day}일';
}
