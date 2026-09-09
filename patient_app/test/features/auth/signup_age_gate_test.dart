import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/profile_status.dart';
import 'package:hospital_patient_app/core/router.dart';
import 'package:hospital_patient_app/core/session_guard.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';
import 'package:hospital_patient_app/features/auth/consent_screen.dart';
import 'package:hospital_patient_app/features/auth/signup_age_gate.dart';
import 'package:hospital_patient_app/features/auth/signup_profile_screen.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/features/settings/hospital_info_repository.dart';

class _FakeAuthRepo extends Fake implements AuthRepo {}

class _FakeProfileRepo extends Fake implements SignupProfileRepo {}

/// 무엇을 열었는지만 기록하는 Fake(tel: 검증용).
class _RecordingLauncher implements LinkLauncher {
  final List<Uri> opened = [];
  @override
  Future<bool> open(Uri uri) async {
    opened.add(uri);
    return true;
  }
}

List<Override> _overrides(_RecordingLauncher launcher) => [
      authRepoProvider.overrideWithValue(_FakeAuthRepo()),
      signupProfileRepoProvider.overrideWithValue(_FakeProfileRepo()),
      effectiveAuthProvider.overrideWithValue(AuthStatus.signedOut),
      profileMissingProvider.overrideWithValue(false),
      hospitalInfoProvider.overrideWith(
          (ref) async => const HospitalInfo(address: '서울시 어딘가', phone: '02-1234-5678')),
      linkLauncherProvider.overrideWithValue(launcher),
    ];

Future<void> _pumpAt(WidgetTester t, String location,
    {_RecordingLauncher? launcher}) async {
  final l = launcher ?? _RecordingLauncher();
  final router = buildAppRouter(initialLocation: location);
  await t.pumpWidget(ProviderScope(
      overrides: _overrides(l), child: MaterialApp.router(routerConfig: router)));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[AGE-GATE-02] 만 14세 미만을 고르면 차단 안내로 간다', (t) async {
    await _pumpAt(t, '/signup/age');
    expect(find.byType(AgeGateScreen), findsOneWidget);
    await t.tap(find.text('만 14세 미만'));
    await t.pumpAndSettle();
    await t.tap(find.text('다음'));
    await t.pumpAndSettle();
    expect(find.byType(BlockedMinorScreen), findsOneWidget);
    expect(find.byType(ConsentScreen), findsNothing);
  });

  testWidgets('[AGE-GATE-02] 만 14세 이상을 고르면 ⓪동의로 간다', (t) async {
    await _pumpAt(t, '/signup/age');
    await t.tap(find.text('만 14세 이상'));
    await t.pumpAndSettle();
    await t.tap(find.text('다음'));
    await t.pumpAndSettle();
    expect(find.byType(ConsentScreen), findsOneWidget);
    expect(find.byType(BlockedMinorScreen), findsNothing);
  });

  testWidgets('[AGE-GATE-03] 고르기 전에는 [다음]이 꺼져 있다', (t) async {
    await _pumpAt(t, '/signup/age');
    final btn = t.widget<FilledButton>(
        find.ancestor(of: find.text('다음'), matching: find.byType(FilledButton)));
    expect(btn.onPressed, isNull); // 조용히 기본값을 만들지 않는다(BTN-STATE-01)
  });

  testWidgets('[AGE-GATE-04] 차단 화면은 병원 전화(공개 API 값)로 연결한다 — 막다른 길 아님', (t) async {
    final launcher = _RecordingLauncher();
    await _pumpAt(t, '/signup/blocked', launcher: launcher);
    expect(find.byType(BlockedMinorScreen), findsOneWidget);
    // 번호는 화면에 표시하지 않는다(누르면 바로 전화 연결되므로 군더더기). 라벨은 문구만.
    expect(find.text('병원에 전화하기'), findsOneWidget);
    expect(find.textContaining('02-1234-5678'), findsNothing);
    await t.tap(find.byKey(const Key('blocked-call-button')));
    await t.pumpAndSettle();
    // 하드코딩 아님, API 값으로 다이얼(tel:)한다 — 표시 없이도 올바른 번호로 연결.
    expect(launcher.opened.single, Uri.parse('tel:0212345678'));
  });

  testWidgets('[AGE-GATE-04] 차단 화면 [이전으로]는 연령 게이트로 돌아간다', (t) async {
    await _pumpAt(t, '/signup/age');
    await t.tap(find.text('만 14세 미만'));
    await t.pumpAndSettle();
    await t.tap(find.text('다음'));
    await t.pumpAndSettle();
    expect(find.byType(BlockedMinorScreen), findsOneWidget);
    await t.tap(find.text('이전으로'));
    await t.pumpAndSettle();
    expect(find.byType(AgeGateScreen), findsOneWidget);
    expect(find.byType(BlockedMinorScreen), findsNothing);
  });
}
