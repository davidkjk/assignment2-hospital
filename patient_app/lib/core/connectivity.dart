import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// connectivity_plus 6.x는 List<ConnectivityResult>를 준다(단일 값 아님) — none만 아니면 온라인으로 본다.
bool _isOnline(List<ConnectivityResult> results) =>
    results.any((r) => r != ConnectivityResult.none);

// NAV-GLOBAL-01: 오프라인이 돼도 화면을 옮기지 않는다 — 이 provider는 배너·버튼상태만 바꾼다(하던 일을 안 빼앗는다).
// 초기값은 '온라인 가정'(첫 프레임에 배너가 깜빡이지 않게); 실제 상태가 오면 갱신.
final connectivityProvider = StreamProvider<bool>((ref) async* {
  yield _isOnline(await Connectivity().checkConnectivity());
  yield* Connectivity().onConnectivityChanged.map(_isOnline);
});
