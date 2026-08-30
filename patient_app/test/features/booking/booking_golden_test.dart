import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/date_step.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_step.dart';
import 'package:hospital_patient_app/features/booking/steps/doctor_step.dart';
import 'package:hospital_patient_app/features/booking/steps/who_step.dart';
import 'booking_test_support.dart';

// 골든 게이트(핸드오프 정본): 데모(demo/ 환자앱 예약 마법사)와 눈으로 대조하기 위해 실제 렌더를 PNG로 남긴다.
// ⚠️ tofu(□): 헤드리스엔 아이콘 폰트가 없어 chevron·help 등 아이콘은 □로 나온다(실기기 정상).
//    이 골든은 레이아웃·간격·색·본문 문구를 데모와 대조하는 용도.
const _docA = Doctor('doc1', '김소화', '소화기내과', null, '월·수·금 오전');
const _docB = Doctor('doc2', '이순환', '순환기내과', null, '화·목 오후');

void main() {
  setUpAll(() async {
    final f = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (f.existsSync()) {
      final loader = FontLoader('Roboto')
        ..addFont(Future.value(f.readAsBytesSync().buffer.asByteData()));
      await loader.load();
    }
  });

  testWidgets('booking who golden', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await pumpBooking(t, const WhoStep(), overrides: [targetsOverride(const [kSelf, kMom])]);
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/booking-who.png'));
  });

  testWidgets('booking dept golden', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await pumpBooking(t, const DeptStep(), overrides: [
      departmentsProvider
          .overrideWith((ref) async => const [kInternal, Department('d2', '정형외과'), Department('d3', '소아과')]),
    ], target: kSelf);
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/booking-dept.png'));
  });

  testWidgets('booking doctor golden', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await pumpBooking(t, const DoctorStep(),
        overrides: [doctorsProvider(kInternal.id).overrideWith((ref) async => const [_docA, _docB])],
        target: kSelf,
        department: kInternal);
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/booking-doctor.png'));
  });

  testWidgets('booking date(calendar) golden', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(MaterialApp(
      theme: AppTheme.theme,
      home: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: MonthCalendar(
            available: {DateTime(2026, 8, 20), DateTime(2026, 8, 21), DateTime(2026, 8, 25)},
            now: DateTime(2026, 8, 10),
            onPick: (_) {},
          ),
        ),
      ),
    ));
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/booking-date.png'));
  });
}
