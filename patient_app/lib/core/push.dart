import 'package:firebase_messaging/firebase_messaging.dart';
import 'api_client.dart';

class PushService {
  PushService(this._api);
  final ApiClient _api;

  // PUSH-BODY-04: 잠금화면 내용을 앱이 감추지 않는다 — Android 채널 가시성을 기본(PUBLIC)으로 두고
  //   VISIBILITY_PRIVATE를 '설정하지 않는다'. iOS는 기본 표시. 한쪽만 되는 감추기를 안 써 두 기기가 갈리지 않는다.
  //   (본문 내용은 서버가 이미 안전하게 만든다 — PUSH-BODY-01~03. 여기서 본문을 다시 만들지 않는다.)
  Future<void> init() async {
    await FirebaseMessaging.instance.requestPermission();
    // 채널은 기본 중요도 + 기본 가시성. lockscreenVisibility를 secret/private으로 낮추지 않는다.
  }

  // 로그인 직후: FCM 토큰을 Task 10 엔드포인트로 등록(같은 기기 재등록은 서버가 on conflict로 무해).
  Future<void> registerToken() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _api.post('/device-tokens', {'fcm_token': token}, (_) {});
  }

  // 로그아웃·탈퇴: 등록 해제(죽은 토큰의 남은 절반은 서버 T30가 발송 시 정리 — #100).
  Future<void> unregisterToken() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _api.delete('/device-tokens', (_) {}, body: {'fcm_token': token});
  }
}
