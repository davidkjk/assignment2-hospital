import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../support/golden_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show hospitalInfoProvider, HospitalInfo;
import 'package:hospital_patient_app/features/settings/hospital_info_repository.dart';
import 'package:hospital_patient_app/features/settings/hospital_info_screen.dart';
import 'package:hospital_patient_app/features/settings/notification_prefs_repository.dart';
import 'package:hospital_patient_app/features/settings/notification_settings_screen.dart';
import 'package:hospital_patient_app/features/settings/settings_home_screen.dart';
import 'package:hospital_patient_app/features/settings/settings_password_screen.dart';
import 'package:hospital_patient_app/features/settings/withdraw_repository.dart';
import 'package:hospital_patient_app/features/settings/withdraw_screen.dart';

import 'harness.dart';

// 골든 게이트(핸드오프 정본): 데모(demo/src/routes/patient/settings Settings/Notifications/Hospital)와
// 눈으로 대조하기 위해 실제 렌더를 PNG로 남긴다. AppTheme.theme(데모 teal 시스템)를 입힌다.

const _me = MyProfile(name: '김순자', phone: '010-1234-5678');
const _hospital = HospitalInfo(phone: '02-1234-5678', address: '서울특별시 강남구 테헤란로 123');

Future<void> _shoot(WidgetTester t, String name, Widget child, List<Override> overrides) async {
  await t.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(ProviderScope(
    overrides: overrides,
    child: MaterialApp.router(
      theme: AppTheme.theme,
      routerConfig: GoRouter(routes: [GoRoute(path: '/', builder: (c, s) => child)]),
    ),
  ));
  await t.pumpAndSettle();
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/settings-$name.png'));
}

void main() {
  setUpAll(() async {
    await loadGoldenFonts();
    final f = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (f.existsSync()) {
      final loader = FontLoader('Roboto')
        ..addFont(Future.value(f.readAsBytesSync().buffer.asByteData()));
      await loader.load();
    }
  });

  testWidgets('settings home golden', (t) async {
    await _shoot(t, 'home', const SettingsHomeScreen(), [
      myProfileProvider.overrideWith((ref) async => _me),
      hospitalInfoProvider.overrideWith((ref) async => _hospital),
    ]);
  });

  testWidgets('settings notifications golden', (t) async {
    await _shoot(t, 'notifications', const NotificationSettingsScreen(), [
      notificationPrefsRepositoryProvider.overrideWithValue(FakeNotificationPrefsRepo(allOn)),
    ]);
  });

  testWidgets('settings hospital golden', (t) async {
    await _shoot(t, 'hospital', const HospitalInfoScreen(), [
      hospitalInfoProvider.overrideWith((ref) async => _hospital),
      hospitalHoursProvider.overrideWith((ref) async => sampleHours()),
      linkLauncherProvider.overrideWithValue(FakeLinkLauncher()),
    ]);
  });

  testWidgets('settings password golden', (t) async {
    await _shoot(t, 'password', SettingsPasswordScreen(onDone: () {}), [
      settingsAuthGatewayProvider.overrideWithValue(FakeSettingsAuthGateway()),
    ]);
  });

  testWidgets('settings withdraw golden', (t) async {
    await _shoot(t, 'withdraw', const WithdrawScreen(), [
      withdrawRepositoryProvider.overrideWithValue(FakeWithdrawRepo(const [])),
    ]);
  });
}
