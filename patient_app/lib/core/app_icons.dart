// ignore_for_file: constant_identifier_names
import 'package:flutter/widgets.dart';

/// 앱 공용 아이콘 — 데모 icons.tsx(= @phosphor-icons/react, weight="fill") 재현.
///
/// 데모는 아이콘을 한 파일에 모아 화면마다 같은 걸 쓰게 한다. 실앱도 Material Icons.*를
/// 직접 부르지 말고 여기서만 가져온다 — 앱 전체가 한 세트(Phosphor 채움)로 통일된다(DISP-ICON-03).
///
/// 폰트는 assets/fonts/Phosphor-Fill.ttf·Phosphor-Bold.ttf(pubspec에 family PhosphorFill/PhosphorBold).
/// phosphor_flutter 패키지는 최신 Flutter의 final IconData를 상속하려다 컴파일 실패 → 폰트·코드포인트만
/// 가져와 여기서 직접 IconData를 만든다(호출부는 Material과 동일하게 IconData 그대로 사용).
/// 멤버 이름은 옛 Material 이름을 유지(무대뽀 교체). 방향 캐럿·라디오 링만 bold, 나머지는 fill.
class AppIcons {
  AppIcons._();

  // ── 방향 캐럿·라디오 미선택 링: PhosphorBold ──
  static const IconData chevron_left = IconData(0xe138, fontFamily: 'PhosphorBold', matchTextDirection: true);
  static const IconData chevron_right = IconData(0xe13a, fontFamily: 'PhosphorBold', matchTextDirection: true);
  static const IconData expand_less = IconData(0xe13c, fontFamily: 'PhosphorBold', matchTextDirection: true);
  static const IconData expand_more = IconData(0xe136, fontFamily: 'PhosphorBold', matchTextDirection: true);
  static const IconData radio_button_unchecked = IconData(0xe18a, fontFamily: 'PhosphorBold', matchTextDirection: true);

  // ── 나머지: PhosphorFill(채움) ──
  static const IconData access_time_filled = IconData(0xe19a, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData arrow_back = IconData(0xe058, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData assignment = IconData(0xe198, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData auto_awesome = IconData(0xe6a2, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData calendar_month = IconData(0xe7b4, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData calendar_today = IconData(0xe7b4, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData call = IconData(0xe3b8, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData campaign = IconData(0xe324, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData cancel = IconData(0xe4f8, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData chat_bubble = IconData(0xe168, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData chat_bubble_outline = IconData(0xe168, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData check = IconData(0xe182, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData check_circle = IconData(0xe184, fontFamily: 'PhosphorFill', matchTextDirection: true);
  // 닫기 X — Fill(0xe4f6)은 두꺼운 획이라 뭉툭해 보인다(2026-09-03 사용자 지적) → 같은 글리프의
  // Bold 굵기로(얇게). X 코드포인트는 굵기 무관 동일하고, 로드된 폰트 중 Bold가 가장 얇다.
  static const IconData close = IconData(0xe4f6, fontFamily: 'PhosphorBold', matchTextDirection: true);
  static const IconData cloud_off_outlined = IconData(0xe1b6, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData description = IconData(0xe23a, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData edit = IconData(0xe3b4, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData emergency_outlined = IconData(0xe56e, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData error = IconData(0xe4e2, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData error_outline = IconData(0xe4e2, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData event_available = IconData(0xe712, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData explore_outlined = IconData(0xe1c8, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData flag_outlined = IconData(0xe244, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData groups = IconData(0xe68e, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData help = IconData(0xe3e8, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData history = IconData(0xe1a0, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData home = IconData(0xe2c2, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData inbox = IconData(0xe4aa, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData info_outline = IconData(0xe2ce, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData local_hospital = IconData(0xe844, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData lock = IconData(0xe2fe, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData logout = IconData(0xe42a, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData map = IconData(0xe31a, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData medical_services = IconData(0xe7ea, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData notifications = IconData(0xe0ce, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData open_in_new = IconData(0xe5de, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData person = IconData(0xe4c2, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData person_add_alt_1 = IconData(0xe4d0, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData person_search = IconData(0xe6fc, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData phone = IconData(0xe3b8, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData place = IconData(0xe316, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData qr_code = IconData(0xe3e6, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData radio_button_checked = IconData(0xe18a, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData send = IconData(0xe398, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData settings = IconData(0xe272, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData tune = IconData(0xe228, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData verified_user = IconData(0xe40c, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData visibility = IconData(0xe220, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData visibility_off = IconData(0xe224, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData warning = IconData(0xe4e0, fontFamily: 'PhosphorFill', matchTextDirection: true);
  static const IconData wifi_off = IconData(0xe4f2, fontFamily: 'PhosphorFill', matchTextDirection: true);
}
