import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show hospitalInfoProvider, HospitalInfo;
import 'package:hospital_patient_app/features/settings/hospital_info_repository.dart';
import 'package:hospital_patient_app/features/settings/hospital_info_screen.dart';

import 'harness.dart';

const _info = HospitalInfo(phone: '02-1234-5678', address: '서울특별시 강남구 테헤란로 123');

void main() {
  Future<FakeLinkLauncher> pumpScreen(WidgetTester t,
      {bool hoursError = false, bool mapCanLaunch = true, bool offline = false}) async {
    final launcher = FakeLinkLauncher(canLaunch: mapCanLaunch);
    await t.pumpWidget(ProviderScope(
      overrides: [
        hospitalInfoProvider.overrideWith((ref) async => _info),
        hospitalHoursProvider.overrideWith(
            (ref) async => hoursError ? throw Exception('fail') : sampleHours()),
        linkLauncherProvider.overrideWithValue(launcher),
        if (offline) connectivityProvider.overrideWith((ref) => Stream.value(false)),
      ],
      child: MaterialApp(theme: AppTheme.theme, home: const HospitalInfoScreen()),
    ));
    await t.pumpAndSettle();
    return launcher;
  }

  testWidgets('[SET-HOSP-02·04] 전화 걸기가 번호를 함께 보여주고 전화 앱을 연다(숫자만)', (t) async {
    final launcher = await pumpScreen(t);
    expect(find.textContaining('02-1234-5678'), findsWidgets);
    await t.tap(find.byKey(const Key('call-button')));
    expect(launcher.launched, contains('tel:0212345678'));
  });

  testWidgets('[SET-HOSP-05] 진료시간 네 줄이 보인다', (t) async {
    await pumpScreen(t);
    expect(find.textContaining('평일 09:00–18:00'), findsOneWidget);
    expect(find.textContaining('점심시간'), findsOneWidget);
  });

  testWidgets('[SET-HOSP-06·07] 주소 + 길찾기가 주소 문자열을 지도 앱에 넘긴다(좌표 아님)', (t) async {
    final launcher = await pumpScreen(t);
    expect(find.textContaining('강남구'), findsWidgets);
    await t.tap(find.byKey(const Key('map-button')));
    await t.pumpAndSettle();
    expect(launcher.launched.last, contains(Uri.encodeComponent('강남구')));
  });

  testWidgets('[SET-HOSP-09] 지도 앱이 없으면 오류 한 줄(막다른 길 아님)', (t) async {
    await pumpScreen(t, mapCanLaunch: false);
    await t.tap(find.byKey(const Key('map-button')));
    await t.pumpAndSettle();
    expect(find.textContaining('지도 앱을 열 수 없습니다'), findsOneWidget);
  });

  testWidgets('[SET-HOSP-10] 진료시간 조회가 실패해도 화면은 열리고 전화는 동작한다', (t) async {
    final launcher = await pumpScreen(t, hoursError: true, offline: true);
    expect(find.textContaining('진료시간을 불러오지 못했습니다'), findsOneWidget);
    await t.tap(find.byKey(const Key('call-button')));         // 전화는 인터넷 불필요
    expect(launcher.launched.any((u) => u.startsWith('tel:')), isTrue);
  });
}
