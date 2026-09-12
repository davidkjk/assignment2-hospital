import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
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
    debugPrint('[PUSH] init() 시작');
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      debugPrint('[PUSH] 알림 권한 상태 = ${settings.authorizationStatus}');
    } catch (e) {
      debugPrint('[PUSH] requestPermission 오류: $e');
    }

    // ⭐ 토큰 등록(핵심 경로) — 아래 표시 설정보다 먼저·독립적으로. 표시 설정이 iOS에서 막히거나
    //    예외를 던져도 토큰 등록에는 영향이 없게 한다(그동안 이 순서 때문에 등록이 통째로 건너뛰었다).
    await registerToken();

    // FCM 리스너는 표시 초기화보다 먼저 건다(표시 초기화가 막혀도 갱신 재등록·탭 이동은 살아 있게).
    if (!_wired) {
      _wired = true;
      FirebaseMessaging.onMessage.listen(_showForeground);
      FirebaseMessaging.onMessageOpenedApp.listen((_) => _openFromTap());
      // FCM 토큰은 갱신될 수 있다 — 갱신되면 서버에 다시 등록(#100 죽은 토큰 정리와 짝).
      FirebaseMessaging.instance.onTokenRefresh.listen(_postToken);
    }

    // 포그라운드 표시 설정(best-effort) — 실패해도 등록·수신엔 영향 없음. 단계별 로그로 원인 추적.
    try {
      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);
      debugPrint('[PUSH] setForegroundOptions 완료');
      await _local.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: (_) => _openFromTap(),
      );
      debugPrint('[PUSH] local.initialize 완료');
      await _local
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_androidChannel);
    } catch (e) {
      debugPrint('[PUSH] 포그라운드 표시 설정 오류(무시): $e');
    }

    // 앱이 완전히 꺼진 상태에서 알림 탭으로 열렸으면 알림함으로.
    try {
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) _openFromTap();
    } catch (e) {
      debugPrint('[PUSH] getInitialMessage 오류(무시): $e');
    }
  }

  // 로그인 직후: FCM 토큰을 Task 10 엔드포인트로 등록(같은 기기 재등록은 서버가 on conflict로 무해).
  Future<void> registerToken() async {
    // iOS: APNS 토큰이 세팅된 뒤에야 FCM 토큰을 받을 수 있다 — 준비될 때까지 잠깐 기다린다(타이밍 방어).
    try {
      for (var i = 0; i < 8; i++) {
        final apns = await FirebaseMessaging.instance.getAPNSToken();
        debugPrint('[PUSH] getAPNSToken try$i = ${apns == null ? "null" : "OK"}');
        if (apns != null) break;
        await Future<void>.delayed(const Duration(milliseconds: 800));
      }
    } catch (e) {
      debugPrint('[PUSH] getAPNSToken 오류: $e');
    }
    String? token;
    try {
      token = await FirebaseMessaging.instance.getToken();
    } catch (e) {
      debugPrint('[PUSH] getToken 오류: $e');
    }
    debugPrint('[PUSH] getToken = ${token == null ? "null" : "${token.substring(0, 12)}…(len ${token.length})"}');
    await _postToken(token);
  }

  Future<void> _postToken(String? token) async {
    if (token == null) {
      debugPrint('[PUSH] 토큰이 null이라 등록을 건너뜁니다.');
      return;
    }
    try {
      await _api.post('/device-tokens', {'fcm_token': token}, (_) {});
      debugPrint('[PUSH] /device-tokens 등록 성공');
    } catch (e) {
      debugPrint('[PUSH] /device-tokens 등록 실패: $e');
    }
  }

  // 로그아웃·탈퇴: 등록 해제(죽은 토큰의 남은 절반은 서버 T30가 발송 시 정리 — #100).
  Future<void> unregisterToken() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _api.delete('/device-tokens', (_) {}, body: {'fcm_token': token});
  }

  void _showForeground(RemoteMessage message) {
    final n = message.notification;
    if (n == null) return; // 데이터-only 메시지는 표시하지 않는다(현재 서버는 알림형만 보냄).
    try {
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
    } catch (e) {
      debugPrint('[PUSH] 포그라운드 표시 실패(무시): $e');
    }
  }

  // NOTI-GONE-05: 알림 탭 딥링크는 알림함으로 보낸다 — 거기서 개별 항목 라우팅(예약 존재 확인·
  // 사라진 예약 팝업)을 openNotification이 그대로 처리한다. 서버 푸시는 목적지 data를 싣지 않으므로
  // 여기서 예약 상세로 직접 보내지 않는다(항목 단위 딥링크는 서버가 data를 실으면 확장).
  void _openFromTap() {
    appRouter.go('/notifications');
  }
}
