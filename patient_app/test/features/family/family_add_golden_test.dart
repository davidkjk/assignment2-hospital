import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/family/family_add_choice_screen.dart';
import 'package:hospital_patient_app/features/family/family_add_repository.dart';
import 'package:hospital_patient_app/features/family/family_link_form_screen.dart';
import 'package:hospital_patient_app/features/family/family_link_otp_page.dart';
import 'package:hospital_patient_app/features/family/family_new_screen.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';

import 'add_harness.dart';
import 'harness.dart';

// 골든 게이트(핸드오프 정본): 데모(docs/design/mockups/25-family-add-final.html · demo FamilyAdd/
// NewFamily/ExistingFamily)와 눈으로 대조하기 위해 실제 렌더를 PNG로 남긴다. AppTheme.theme를 입힌다.
// ㉯는 플랜대로 입력 화면 + 인증 화면(T13 OtpScreen 재사용)으로 나뉘어 있다(규칙 승 — 데모는 한 화면).

class _MockStorage extends Mock implements FlutterSecureStorage {}

PhoneCooldownStore _cooldown() {
  final s = _MockStorage();
  final m = <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value')))
      .thenAnswer((i) async => m[i.namedArguments[#key] as String] = i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key')))
      .thenAnswer((i) async => m[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key')))
      .thenAnswer((i) async => m.remove(i.namedArguments[#key] as String));
  return PhoneCooldownStore(s);
}

Widget _wrap(String initial, {LinkDraft? draft}) {
  final router = GoRouter(initialLocation: initial, routes: [
    GoRoute(path: '/family/add', builder: (c, s) => const FamilyAddChoiceScreen()),
    GoRoute(path: '/family/add/new', builder: (c, s) => const FamilyNewScreen()),
    GoRoute(path: '/family/add/link', builder: (c, s) => const FamilyLinkFormScreen()),
    GoRoute(path: '/family/add/link/otp', builder: (c, s) => const FamilyLinkOtpPage()),
  ]);
  return ProviderScope(
    overrides: [
      familyRepositoryProvider.overrideWithValue(FakeFamilyRepo([self(name: '김보호')])),
      familyAddRepoProvider.overrideWithValue(FakeFamilyAddRepo()),
      phoneCooldownStoreProvider.overrideWithValue(_cooldown()),
      if (draft != null) linkDraftProvider.overrideWith((ref) => draft),
    ],
    child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
  );
}

Future<void> _shoot(WidgetTester t, String name, Widget w) async {
  await t.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(w);
  await t.pumpAndSettle();
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/family-add-$name.png'));
}

void main() {
  setUpAll(() async {
    final f = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (f.existsSync()) {
      final loader = FontLoader('Roboto')
        ..addFont(Future.value(f.readAsBytesSync().buffer.asByteData()));
      await loader.load();
    }
  });

  testWidgets('family add choice golden', (t) async {
    await _shoot(t, 'choice', _wrap('/family/add'));
  });

  testWidgets('family add new golden', (t) async {
    await _shoot(t, 'new', _wrap('/family/add/new'));
  });

  testWidgets('family add link form golden', (t) async {
    await _shoot(t, 'link', _wrap('/family/add/link'));
  });

  testWidgets('family add link otp golden', (t) async {
    await _shoot(
        t,
        'otp',
        _wrap('/family/add/link/otp',
            draft: LinkDraft(
                name: '김영수',
                birthDate: DateTime(1948, 5, 20),
                phone: '01012345678',
                relation: '어머니',
                requestId: 'req-1')));
  });
}
