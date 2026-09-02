import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../support/golden_fonts.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/booking_submit.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/conf_step.dart';
import 'package:hospital_patient_app/features/booking/steps/date_step.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_bot_sheet.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_step.dart';
import 'package:hospital_patient_app/features/booking/steps/doctor_step.dart';
import 'package:hospital_patient_app/features/booking/steps/done_step.dart';
import 'package:hospital_patient_app/features/booking/steps/time_step.dart';
import 'package:hospital_patient_app/features/booking/steps/who_step.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'booking_test_support.dart';

// conf 골든용 — bookingSubmitProvider를 대기 없음 상태로 고정.
class _IdleSubmit extends StateNotifier<AsyncValue<void>> implements BookingSubmit {
  _IdleSubmit() : super(const AsyncData(null));
  @override
  Future<void> submit() async {}
}

// 골든 게이트(핸드오프 정본): 데모(demo/ 환자앱 예약 마법사)와 눈으로 대조하기 위해 실제 렌더를 PNG로 남긴다.
// ⚠️ tofu(□): 헤드리스엔 아이콘 폰트가 없어 chevron·help 등 아이콘은 □로 나온다(실기기 정상).
//    이 골든은 레이아웃·간격·색·본문 문구를 데모와 대조하는 용도.
const _docA = Doctor('doc1', '김소화', '소화기내과', null, '월·수·금 오전');
const _docB = Doctor('doc2', '이순환', '순환기내과', null, '화·목 오후');

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

  testWidgets('booking time golden', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final d = DateTime(2026, 8, 20);
    Slot s(String hhmm) {
      final p = hhmm.split(':');
      return Slot('s-$hhmm', DateTime(d.year, d.month, d.day, int.parse(p[0]), int.parse(p[1])));
    }

    await pumpBooking(t, const TimeStep(),
        overrides: [
          availableSlotsProvider((doctorId: kDocPhoto.id, date: d)).overrideWith(
              (ref) async => [s('09:00'), s('09:20'), s('10:00'), s('14:00'), s('14:30')]),
        ],
        target: kSelf,
        department: kInternal,
        doctor: kDocPhoto,
        date: d);
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/booking-time.png'));
  });

  testWidgets('booking conf golden', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await pumpBooking(t, const ConfStep(),
        overrides: [
          hospitalInfoProvider
              .overrideWith((ref) async => const HospitalInfo(address: '서울 강남구 테헤란로 1', phone: '02-123-4567')),
          bookingSubmitProvider.overrideWith((ref) => _IdleSubmit()),
        ],
        target: kSelf,
        department: kInternal,
        doctor: kDocPhoto,
        date: DateTime(2026, 8, 20),
        advance: (ctl) {
          ctl.selectSlot('s1', DateTime(2026, 8, 20, 9));
          ctl.setReason('3일 전부터 기침과 콧물이 있어요');
        });
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/booking-conf.png'));
  });

  testWidgets('booking done golden', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final appt = AppointmentView.fromJson({
      'id': 'a1',
      'status': '예약신청',
      'for_patient_name': '김순자',
      'department_name': '내과',
      'doctor_name': '김소화',
      'booking_code': 'A-2413',
      'slot_date': '2026-08-20',
      'start_time': '09:00:00',
      'has_questionnaire': false,
      'is_self': true,
    });
    await pumpBooking(t, const DoneStep(),
        overrides: [bookedAppointmentProvider('a1').overrideWith((ref) async => appt)],
        advance: (ctl) => ctl.finishTo('a1'));
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/booking-done.png'));
  });

  testWidgets('booking bot-sheet golden', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final container = ProviderContainer(
        overrides: [deptBotSuggestionProvider.overrideWithValue(kInternal)]);
    addTearDown(container.dispose);
    container.read(bookingProvider.notifier).selectTarget(kSelf);
    await t.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: AppTheme.theme,
        home: const Scaffold(body: Align(alignment: Alignment.bottomCenter, child: DeptBotSheet())),
      ),
    ));
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/booking-bot.png'));
  });
}
