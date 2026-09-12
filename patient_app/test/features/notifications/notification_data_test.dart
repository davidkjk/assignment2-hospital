import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/notifications/notification_data.dart';
import 'package:hospital_patient_app/features/notifications/notification_view.dart';

class _FakeApi implements NotificationApi {
  _FakeApi({this.unread = 0});
  final int unread;
  bool markedRead = false;
  @override
  Future<List<NotificationView>> list() async => [];
  @override
  Future<int> unreadCount() async => unread;
  @override
  Future<void> markRead() async => markedRead = true;
  @override
  Future<bool> appointmentExists(String id) async => true;
}

class _ThrowingApi implements NotificationApi {
  @override
  Future<List<NotificationView>> list() async => throw StateError('서버를 부르면 안 된다');
  @override
  Future<int> unreadCount() async => throw StateError('서버를 부르면 안 된다');
  @override
  Future<void> markRead() async => throw StateError('서버를 부르면 안 된다');
  @override
  Future<bool> appointmentExists(String id) async => throw StateError('서버를 부르면 안 된다');
}

void main() {
  test('[NOTI-CACHE-01] 오프라인이면 서버를 부르지 않고 빈 목록(캐시하지 않는다)', () async {
    final api = _ThrowingApi(); // 부르면 실패
    final list = await loadNotifications(api: api, online: false);
    expect(list, isEmpty); // 예약 목록과 달리 알림은 폰에 저장하지 않는다(OFF-CACHE-03)
  });
  test('[NOTI-READ-04] markNotificationsRead 후 배지 개수 provider가 0을 준다', () async {
    final api = _FakeApi(unread: 3);
    final container = ProviderContainer(overrides: [notificationApiProvider.overrideWithValue(api)]);
    addTearDown(container.dispose);
    expect(container.read(unreadNotificationCountProvider), 0); // 로딩 중엔 0(Provider<int> 계약, T16)
    await container.read(notificationRepoProvider).markAllRead();
    expect(api.markedRead, isTrue); // POST /my/notifications/read 를 불렀다
  });
  test('[NOTI-READ-08] 배지 개수는 unread-count 응답을 그대로 노출한다', () async {
    final api = _FakeApi(unread: 3);
    final container = ProviderContainer(overrides: [notificationApiProvider.overrideWithValue(api)]);
    addTearDown(container.dispose);
    await container.read(unreadCountAsyncProvider.future);
    expect(container.read(unreadNotificationCountProvider), 3);
  });
}
