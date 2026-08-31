import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';

import 'harness.dart';

// 골든 게이트(핸드오프 정본): 데모 demo/src/routes/patient/appt/ApptDetail.tsx 와 눈으로 대조하려고
// 실제 렌더를 PNG로 남긴다. AppTheme.theme(데모 teal 디자인 시스템)를 입힌다.

Widget _wrap(AppointmentDetail d) {
  final router = GoRouter(initialLocation: '/appointments/a1', routes: [
    GoRoute(
        path: '/appointments/:id',
        builder: (c, s) => AppointmentDetailScreen(s.pathParameters['id']!)),
  ]);
  return ProviderScope(
    overrides: [
      appointmentDetailProvider('a1').overrideWith((ref) async => d),
      connectivityProvider.overrideWith((ref) => Stream.value(true)),
    ],
    child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
  );
}

Future<void> _shoot(WidgetTester t, String name, AppointmentDetail d) async {
  await t.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(_wrap(d));
  // FutureProvider 로딩 스피너는 무한 애니메이션 → pump 두 번으로 data 분기까지 그린 뒤 정착시킨다.
  await t.pump();
  await t.pump();
  await t.pumpAndSettle();
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/appt-$name.png'));
}

void main() {
  setUpAll(() async {
    // 데모 눈대조를 위해 한글 글리프를 로드한다(auth·family 골든과 동일 — macOS AppleGothic).
    final f = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (f.existsSync()) {
      final loader = FontLoader('Roboto')
        ..addFont(Future.value(f.readAsBytesSync().buffer.asByteData()));
      await loader.load();
    }
  });

  // ⚠️ 골든은 결정적이어야 한다 — 일시는 고정 미래 날짜로(now-상대값 금지). 미래라 '예약확정'은 confirmed로 잡힌다.
  final fixed = DateTime(2030, 5, 20, 14, 30);

  testWidgets('appt detail confirmed golden', (t) async {
    await _shoot(t, 'confirmed',
        detail(status: '예약확정', slot: fixed, reason: '오른쪽 무릎이 아파요', qnr: 'none'));
  });

  testWidgets('appt detail pending golden', (t) async {
    await _shoot(t, 'pending',
        detail(status: '예약신청', slot: fixed, reason: '감기 기운이 있어요', qnr: 'none', code: null));
  });

  testWidgets('appt detail cancelled golden', (t) async {
    // T22: 취소된 상세는 머리에 취소 주체(CANCEL-DONE-02 · APPT-RACE-04)를 밝힌다.
    await _shoot(
        t,
        'cancelled',
        detail(
          status: '환자취소',
          slot: fixed,
          relation: '어머니',
          forName: '박영자',
          isSelf: false,
          qnr: 'readonly',
          cancelledBy: 'patient',
          cancelledByRelation: '어머니',
          cancelledByName: '박영자',
          cancelledAt: DateTime(2030, 5, 18, 10, 0),
        ));
  });
}
