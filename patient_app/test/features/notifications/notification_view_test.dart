import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/notifications/notification_view.dart';

NotificationView _n(String type, {String? appt = 'ap1', bool read = false}) =>
    NotificationView.fromJson({
      'id': 'n-$type', 'notification_type': type, 'kind': 'transactional',
      'body': '예약 안내', 'appointment_id': appt, 'is_read': read,
      'sent_at': '2026-08-18T09:00:00Z',
    });

void main() {
  test('[NOTI-GO-01] 신청·확정·변경·리마인더·취소거부는 예약 상세로 간다', () {
    for (final t in ['requested', 'confirmed', 'changed', 'reminder_day_before',
                     'reminder_today', 'cancellation_rejected']) {
      expect(resolveNotificationRoute(_n(t)), '/appointments/ap1');
    }
  });
  test('[NOTI-GO-03] 병원취소·취소처리는 이력 탭의 그 줄로 간다(예약이 이미 없다)', () {
    expect(resolveNotificationRoute(_n('hospital_cancelled')), '/history?appointment=ap1');
    expect(resolveNotificationRoute(_n('cancellation_approved')), '/history?appointment=ap1');
  });
  test('[NOTI-GO-06] 진료 후 안내는 이력 탭의 그 줄(안내문 펼침)로 간다', () {
    expect(resolveNotificationRoute(_n('visit_completed')), '/history?appointment=ap1');
  });
  test('[NOTI-GO-04] 사전문진 안내는 문진 작성 화면으로 간다', () {
    expect(resolveNotificationRoute(_n('questionnaire_missing')), '/questionnaire/ap1');
  });
  test('[NOTI-GO-05] 상담 답변은 상담방으로 간다(4단계 챗봇)', () {
    expect(resolveNotificationRoute(_n('support_answered', appt: null)), '/chat');  // C3-2 정본(2026-08-20)
  });
  test('[NOTI-GO-02] 병원발 변경도 예약 상세로 가되 appointment_id가 없으면 목적지 없음(갈 곳 없음 판정)', () {
    expect(resolveNotificationRoute(_n('changed', appt: null)), isNull);   // → 탭 시 GONE 팝업
  });
  test('[NOTI-READ-01] 중요(변경·취소)는 주의색, 일반은 딥틸로 가른다', () {
    for (final t in ['changed', 'hospital_cancelled', 'cancellation_approved', 'cancellation_rejected']) {
      expect(notificationImportant(t), isTrue);
    }
    for (final t in ['confirmed', 'reminder_today', 'questionnaire_missing', 'visit_completed']) {
      expect(notificationImportant(t), isFalse);
    }
  });
  test('[NOTI-LIST-01] 제목은 종류별로 다르다', () {
    expect(notificationTitle('confirmed'), '예약 확정');
    expect(notificationTitle('questionnaire_missing'), '사전문진 안내');
    expect(notificationTitle('hospital_cancelled'), '예약 취소');
  });
  test('[NOTI-LIST-01] 날짜 묶음은 오늘/어제/그 밖 날짜로 가른다', () {
    final now = DateTime(2026, 8, 18, 15);
    expect(notificationDateGroup(DateTime(2026, 8, 18, 9), now), '오늘');
    expect(notificationDateGroup(DateTime(2026, 8, 17, 9), now), '어제');
    expect(notificationDateGroup(DateTime(2026, 8, 10, 9), now), '8월 10일');
  });
}
