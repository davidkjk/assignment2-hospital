import 'package:flutter_riverpod/flutter_riverpod.dart';

/// HOME-REFRESH-02 — 도착·진료대기·진료중 카드가 있으면 실시간 구독을 연다(대기실에서 아무것도
/// 안 눌러도 저절로 바뀌게). 끝난 카드만 있으면 열지 않는다(붙잡지 않는다).
///
/// ⚠️ 실제 Supabase realtime 채널 배선은 아직 없다(앱 전역 인프라 미구축) — 여기서는 「언제 구독을
/// 여는가」의 판정과 호출 지점만 못박는 얇은 seam이다(PushService 스텁과 같은 방식). 실배선 시 이 인터페이스의
/// no-op 구현을 실제 채널로 바꾸면 화면 코드는 그대로다.
abstract class HomeRealtime {
  void subscribe(List<String> appointmentIds); // 살아있는 카드가 있을 때만 불린다
  void unsubscribe();
}

class _NoopRealtime implements HomeRealtime {
  @override
  void subscribe(List<String> appointmentIds) {}
  @override
  void unsubscribe() {}
}

/// 홈이 소비한다. 테스트는 override로 스파이를 주입한다.
final homeRealtimeProvider = Provider<HomeRealtime>((ref) => _NoopRealtime());

/// 살아있는(실시간으로 바뀔 수 있는) 상태 — 여기 들면 구독을 연다.
const liveStatuses = {'도착', '진료대기', '진료중'};
