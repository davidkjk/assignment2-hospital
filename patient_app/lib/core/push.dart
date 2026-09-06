import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api_client.dart';
import 'router.dart';

/// 안드로이드에서 앱을 보고 있는 중(포그라운드)에 알림을 그릴 로컬 채널.
/// PUSH-BODY-04: 잠금화면 가시성을 낮추지 않는다(VISIBILITY_PRIVATE/SECRET 미설정 = 기본 표시).
///   한쪽만 감추면 두 기기가 갈리므로, 본문은 서버가 안전하게 만든 걸 그대로 쓴다(PUSH-BODY-01~03).
const _androidChannel = AndroidNotificationChannel(
  'gaon_default',
  '가온병원 알림',
  description: '예약·안내 등 병원에서 보내는 알림',
  importance: Importance.high,
);

class PushService {
  PushService(this._api);
  final ApiClient _api;
  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  bool _wired = false;

  /// 로그인 직후 호출(app.dart가 signedIn을 감지해 부름). 권한 요청 + 리스너 배선.
  /// 여러 번 불려도 무해하다(리스너는 한 번만 건다).
  Future<void> init() async {
    await FirebaseMessaging.instance.requestPermission();
    // iOS: 앱을 보고 있는 중에도 OS가 배너를 띄우게 한다(안드로이드는 아래 로컬 알림으로 처리).
    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

    // 안드로이드 포그라운드 표시용 로컬 알림 초기화 + 채널 등록.
    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
      onDidReceiveNotificationResponse: (_) => _openFromTap(),
    );
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);

    if (!_wired) {
      _wired = true;
      // 포그라운드 수신 → 안드로이드에서 로컬 알림으로 표시(iOS는 위 옵션으로 OS가 표시).
      FirebaseMessaging.onMessage.listen(_showForeground);
      // 백그라운드 상태에서 알림을 눌러 앱이 열림 → 알림함으로.
      FirebaseMessaging.onMessageOpenedApp.listen((_) => _openFromTap());
      // FCM 토큰은 갱신될 수 있다 — 갱신되면 서버에 다시 등록(#100 죽은 토큰 정리와 짝).
      FirebaseMessaging.instance.onTokenRefresh.listen(_postToken);
    }

    // 앱이 완전히 꺼진 상태에서 알림 탭으로 열렸으면 알림함으로.
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _openFromTap();
  }

  // 로그인 직후: FCM 토큰을 Task 10 엔드포인트로 등록(같은 기기 재등록은 서버가 on conflict로 무해).
  Future<void> registerToken() async {
    await _postToken(await FirebaseMessaging.instance.getToken());
  }

  Future<void> _postToken(String? token) async {
    if (token != null) await _api.post('/device-tokens', {'fcm_token': token}, (_) {});
  }

  // 로그아웃·탈퇴: 등록 해제(죽은 토큰의 남은 절반은 서버 T30가 발송 시 정리 — #100).
  Future<void> unregisterToken() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _api.delete('/device-tokens', (_) {}, body: {'fcm_token': token});
  }

  void _showForeground(RemoteMessage message) {
    final n = message.notification;
    if (n == null) return; // 데이터-only 메시지는 표시하지 않는다(현재 서버는 알림형만 보냄).
    _local.show(
      id: n.hashCode,
      title: n.title ?? '가온병원',
      body: n.body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'gaon_default',
          '가온병원 알림',
          channelDescription: '예약·안내 등 병원에서 보내는 알림',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }

  // NOTI-GONE-05: 알림 탭 딥링크는 알림함으로 보낸다 — 거기서 개별 항목 라우팅(예약 존재 확인·
  // 사라진 예약 팝업)을 openNotification이 그대로 처리한다. 서버 푸시는 목적지 data를 싣지 않으므로
  // 여기서 예약 상세로 직접 보내지 않는다(항목 단위 딥링크는 서버가 data를 실으면 확장).
  void _openFromTap() {
    appRouter.go('/notifications');
  }
}
