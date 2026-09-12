import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../support/golden_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/family/family_edit_screen.dart';
import 'package:hospital_patient_app/features/family/family_list_screen.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';

import 'harness.dart';

// 골든 게이트(핸드오프 정본): 데모(docs/design/mockups/22-family-v2.html · demo FamilyList/FamilyEdit)와
// 눈으로 대조하기 위해 실제 렌더를 PNG로 남긴다. AppTheme.theme(데모 디자인 시스템)를 입힌다.

Widget _wrap(List<FamilyMember> members, {required String initial}) {
  final router = GoRouter(initialLocation: initial, routes: [
    GoRoute(path: '/family', builder: (c, s) => const FamilyListScreen()),
    GoRoute(
        path: '/family/:id/edit',
        builder: (c, s) => FamilyEditScreen(familyPatientId: s.pathParameters['id']!)),
  ]);
  return ProviderScope(
    overrides: [familyRepositoryProvider.overrideWithValue(FakeFamilyRepo(members))],
    child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
  );
}

Future<void> _shoot(WidgetTester t, String name, Widget w) async {
  await t.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(w);
  await t.pumpAndSettle();
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/family-$name.png'));
}

void main() {
  setUpAll(() async {
    await loadGoldenFonts();
    // 데모 눈대조를 위해 한글 글리프를 로드한다(auth 골든과 동일 — macOS AppleGothic을 기본체로).
    final f = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (f.existsSync()) {
      final loader = FontLoader('Roboto')
        ..addFont(Future.value(f.readAsBytesSync().buffer.asByteData()));
      await loader.load();
    }
  });

  testWidgets('family list golden', (t) async {
    await _shoot(t, 'list', _wrap([
      self(name: '김순자'),
      fam(id: 'p-mom', name: '박영희', relation: '어머니', gender: 'F', birth: '1952-09-08',
          canEdit: false, lock: 'linked', upcoming: up(id: 'a1', date: '2026-09-01', dept: '내과')),
      fam(id: 'p-son', name: '김지훈', relation: '아들', gender: 'M', birth: '2010-01-15'),
    ], initial: '/family'));
  });

  testWidgets('family edit (new, editable) golden', (t) async {
    await _shoot(t, 'edit-editable',
        _wrap([fam(id: 'p-son', name: '김지훈', relation: '아들', gender: 'M', birth: '2010-01-15')],
            initial: '/family/p-son/edit'));
  });

  testWidgets('family edit (linked, locked) golden', (t) async {
    await _shoot(t, 'edit-locked',
        _wrap([fam(id: 'p-mom', name: '박영희', relation: '어머니', gender: 'F', birth: '1952-09-08',
            canEdit: false, lock: 'linked')],
            initial: '/family/p-mom/edit'));
  });
}
