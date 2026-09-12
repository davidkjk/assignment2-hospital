import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/notifications/notification_view.dart';
import 'package:hospital_patient_app/features/chat/chat_deep_link.dart';

void main() {
  NotificationView n({String? thread}) => NotificationView.fromJson({
        'id': 'n1',
        'notification_type': 'support_answered',
        'body': '상담 답변이 도착했어요', // 실제 fromJson은 body가 필수
        'appointment_id': null, // C3-2 정본(2026-08-20)
        'chat_thread_id': thread,
        'sent_at': '2026-08-19T09:00:00Z',
      });

  test('[CHAT-HISTORY-DEEP-01] thread가 있으면 그 상담방으로 이동한다', () {
    expect(resolveChatDeepLink(n(thread: 't9')), '/chat/room/t9');
  });

  test('[CHAT-HISTORY-DEEP-02] thread가 없으면 이전 상담 목록(/chat)으로 — 뒤로가기 도착지', () {
    expect(resolveChatDeepLink(n(thread: null)), '/chat');
  });

  test('[CHAT-HISTORY-DEEP-01] T18 resolveNotificationRoute도 thread면 방으로 정밀화된다', () {
    // 셸이 T18의 support_answered → /chat 폴백을 thread 있을 때만 방으로 좁힌다.
    expect(resolveNotificationRoute(n(thread: 't9')), '/chat/room/t9');
    expect(resolveNotificationRoute(n(thread: null)), '/chat'); // 폴백 유지
  });
}
