import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/offline_cache.dart';
import 'package:hospital_patient_app/core/session_guard.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';
import 'package:hospital_patient_app/widgets/offline_banner.dart';

Widget _harness({
  required bool online,
  required AuthStatus auth,
  CachedUpcoming? cached,
}) {
  return ProviderScope(
    overrides: [
      connectivityProvider.overrideWith((ref) => Stream.value(online)),
      effectiveAuthProvider.overrideWithValue(auth),
      upcomingCacheProvider.overrideWith((ref) async => cached),
    ],
    child: const MaterialApp(home: Scaffold(body: OfflineBanner())),
  );
}

void main() {
  testWidgets('온라인 + signedIn이면 배너를 숨긴다 (OFF-BACK-01)', (t) async {
    await t.pumpWidget(_harness(online: true, auth: AuthStatus.signedIn));
    await t.pumpAndSettle();
    expect(find.textContaining('인터넷 연결 없음'), findsNothing);
  });

  testWidgets('오프라인이면 절대 시각 문구를 보인다 (OFF-BAN-01·03)', (t) async {
    final now = DateTime.now();
    final saved = DateTime(now.year, now.month, now.day, 15, 12);   // 오늘 오후 3:12
    await t.pumpWidget(_harness(
        online: false, auth: AuthStatus.signedOut,
        cached: CachedUpcoming(items: const [], savedAt: saved)));
    await t.pumpAndSettle();
    expect(find.textContaining('인터넷 연결 없음'), findsOneWidget);
    expect(find.textContaining('오후 3:12'), findsOneWidget);
  });

  testWidgets('만료가 겹치면 둘째 줄에 재로그인 안내 (OFF-AUTH-02)', (t) async {
    await t.pumpWidget(_harness(online: false, auth: AuthStatus.expiredOffline));
    await t.pumpAndSettle();
    expect(find.text('연결되면 다시 로그인해 주세요'), findsOneWidget);
  });

  testWidgets('어제 저장분은 날짜를 앞에 붙인다 (OFF-BAN-04)', (t) async {
    final y = DateTime.now().subtract(const Duration(days: 1));
    final saved = DateTime(y.year, y.month, y.day, 9, 5);
    await t.pumpWidget(_harness(
        online: false, auth: AuthStatus.signedOut,
        cached: CachedUpcoming(items: const [], savedAt: saved)));
    await t.pumpAndSettle();
    expect(find.textContaining('어제 오전 9:05'), findsOneWidget);
  });
}
