import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/connectivity.dart';
import '../../core/providers.dart';
import 'notification_view.dart';

/// 알림함 데이터 창구. 화면·배지·읽음·목적지 존재 확인이 모두 이 API를 지난다(테스트는 Fake로 대체).
abstract class NotificationApi {
  Future<List<NotificationView>> list();
  Future<int> unreadCount();
  Future<void> markRead();
  Future<bool> appointmentExists(String id); // NOTI-GONE-03: 누른 순간 목적지 존재 확인
}

class HttpNotificationApi implements NotificationApi {
  HttpNotificationApi(this._api);
  final ApiClient _api;

  @override
  Future<List<NotificationView>> list() => _api.get(
        '/my/notifications',
        (j) => (j as List)
            .map((e) => NotificationView.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  @override
  Future<int> unreadCount() =>
      _api.get('/my/notifications/unread-count', (j) => (j as Map)['unread'] as int);

  @override
  Future<void> markRead() => _api.post('/my/notifications/read', const {}, (_) {});

  @override
  Future<bool> appointmentExists(String id) async {
    // NOTI-GONE-03: 누른 그 순간에만 확인. 없음/권한 없음(404/403) → false(갈 곳 없음).
    try {
      await _api.get('/my/appointments/$id', (_) => null);
      return true;
    } on ApiException {
      return false;
    }
  }
}

final notificationApiProvider =
    Provider<NotificationApi>((ref) => HttpNotificationApi(ref.watch(apiClientProvider)));

/// NOTI-CACHE-01·OFF-CACHE-03: 예약과 달리 알림은 폰에 저장하지 않는다 — 오프라인이면 서버를 부르지 않고 빈 목록.
Future<List<NotificationView>> loadNotifications(
    {required NotificationApi api, required bool online}) async {
  if (!online) return [];
  return api.list();
}

final notificationsProvider = FutureProvider<List<NotificationView>>((ref) async {
  final online = ref.watch(connectivityProvider).valueOrNull ?? true;
  return loadNotifications(api: ref.watch(notificationApiProvider), online: online);
});

// 배지 개수는 connectivity 게이트가 필요 없다 — 오프라인이면 unreadCount() 호출이 실패해
// AsyncError가 되고 아래 unreadNotificationCountProvider가 0으로 떨군다(자연 처리).
final unreadCountAsyncProvider =
    FutureProvider<int>((ref) async => ref.watch(notificationApiProvider).unreadCount());

/// T16이 `Provider<int>`로 선언한 종 배지 개수의 **본체**(양방향 악수 갚음). 로딩·오프라인·오류는 0.
final unreadNotificationCountProvider = Provider<int>(
    (ref) => ref.watch(unreadCountAsyncProvider).maybeWhen(data: (n) => n, orElse: () => 0));

class NotificationRepo {
  NotificationRepo(this._ref);
  final Ref _ref;
  Future<void> markAllRead() async {
    await _ref.read(notificationApiProvider).markRead(); // POST /my/notifications/read
    _ref.invalidate(unreadCountAsyncProvider); // 배지 0(NOTI-READ-04)
  }
}

final notificationRepoProvider = Provider<NotificationRepo>((ref) => NotificationRepo(ref));

/// 알림함 화면이 진입 시 부르는 얇은 래퍼(NOTI-READ-04). 목록 조회가 끝난 뒤 부른다(색 바 보존).
Future<void> markNotificationsRead(WidgetRef ref) =>
    ref.read(notificationRepoProvider).markAllRead();
