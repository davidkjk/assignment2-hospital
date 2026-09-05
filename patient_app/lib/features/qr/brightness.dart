import 'package:screen_brightness/screen_brightness.dart';

/// QR-BRIGHT — 접수용 QR 전체화면에서만 밝기를 올린다(스캔 잘 되게). 화면을 떠나면 원래대로.
/// 인터페이스로 두어 테스트가 스파이를 주입한다(플랫폼 채널 없이). 실 기기 impl은 예외를 삼켜
/// 밝기 조절이 안 되는 환경에서도 QR 화면은 그대로 뜨게 한다.
abstract class BrightnessController {
  Future<void> max(); // QR-BRIGHT-01: 최대로
  Future<void> restore(); // QR-BRIGHT-02: 원래 밝기로
}

class ScreenBrightnessController implements BrightnessController {
  @override
  Future<void> max() async {
    try {
      await ScreenBrightness().setApplicationScreenBrightness(1.0);
    } catch (_) {
      // 밝기 조절 불가(권한·데스크톱 등) — QR 화면은 그대로 뜬다.
    }
  }

  @override
  Future<void> restore() async {
    try {
      await ScreenBrightness().resetApplicationScreenBrightness();
    } catch (_) {}
  }
}
