import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/booking/booking_submit.dart';
import 'package:hospital_patient_app/features/booking/booking_wizard.dart';
import 'package:hospital_patient_app/features/booking/steps/done_step.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'booking_test_support.dart';

Map<String, dynamic> _apptJson({required String status, required String code, String id = 'a1'}) => {
      'id': id,
      'status': status,
      'for_patient_name': '김순자',
      'department_name': '내과',
      'doctor_name': '김의사',
      'booking_code': code,
      'slot_date': '2026-08-20',
      'start_time': '09:00:00',
      'has_questionnaire': false,
      'is_self': true,
    };

Future<void> pumpDone(WidgetTester t, {required Map<String, dynamic> appt}) async {
  final id = appt['id'] as String;
  await pumpBooking(
    t,
    const DoneStep(),
    overrides: [
      bookedAppointmentProvider(id)
          .overrideWith((ref) async => AppointmentView.fromJson(appt)),
    ],
    advance: (ctl) => ctl.finishTo(id), // 완료 상태 + 예약 id
  );
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[BOOK-DONE-02] 예약신청으로 생성되면 "예약이 신청되었습니다"', (t) async {
    await pumpDone(t, appt: _apptJson(status: '예약신청', code: 'A-2413'));
    expect(find.text('예약이 신청되었습니다'), findsOneWidget);
  });

  testWidgets('[BOOK-DONE-03] 즉시확정 병원은 "예약이 확정되었습니다"', (t) async {
    await pumpDone(t, appt: _apptJson(status: '예약확정', code: 'A-2413'));
    expect(find.text('예약이 확정되었습니다'), findsOneWidget);
  });

  testWidgets('[BOOK-DONE-01b][BOOK-DONE-01c] 번호를 함께 보여주고 용어가 상태를 따른다', (t) async {
    await pumpDone(t, appt: _apptJson(status: '예약신청', code: 'A-2413'));
    expect(find.text('신청번호 A-2413'), findsOneWidget); // 확정 전 = 신청번호
  });

  testWidgets('[BOOK-DONE-04][BOOK-DONE-05] 사전문진 작성하기 + 안내 + 나중에 할게요', (t) async {
    await pumpDone(t, appt: _apptJson(status: '예약확정', code: 'A-1'));
    expect(find.text('사전문진 작성하기'), findsOneWidget);
    expect(find.text('나중에 할게요'), findsOneWidget);
    expect(find.text('사전문진을 미리 써두시면 진료가 더 빨라집니다.'), findsOneWidget);
  });

  testWidgets('[BOOK-DONE-01] 가운데 체크 표시 + 제목 + 요약', (t) async {
    await pumpDone(t, appt: _apptJson(status: '예약확정', code: 'A-1'));
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
    expect(find.textContaining('내과 · 김의사 선생님'), findsOneWidget);
  });

  testWidgets('[NAV-BOOK-17] 사전문진 작성하기 → 그 예약의 문진 화면', (t) async {
    await pumpDone(t, appt: _apptJson(status: '예약확정', code: 'A-1', id: 'appt-9'));
    await t.tap(find.text('사전문진 작성하기'));
    await t.pumpAndSettle();
    expect(wentTo('qnr:appt-9'), isTrue);
  });

  testWidgets('[NAV-BOOK-18][BOOK-DONE-06] 나중에 할게요 → 홈', (t) async {
    await pumpDone(t, appt: _apptJson(status: '예약확정', code: 'A-1'));
    await t.tap(find.text('나중에 할게요'));
    await t.pumpAndSettle();
    expect(wentTo('home'), isTrue);
  });

  testWidgets('[BOOK-DONE-07][NAV-BOOK-14] 완료 화면에서 뒤로 = 홈(마법사로 안 돌아감)', (t) async {
    final appt = _apptJson(status: '예약확정', code: 'A-1', id: 'a1');
    await pumpBooking(
      t,
      const BookingWizard(),
      overrides: [
        bookedAppointmentProvider('a1')
            .overrideWith((ref) async => AppointmentView.fromJson(appt)),
      ],
      advance: (ctl) => ctl.finishTo('a1'), // step 7 완료
    );
    await t.pumpAndSettle();
    await t.tap(find.byType(BackButtonIcon));
    await t.pumpAndSettle();
    expect(wentTo('home'), isTrue);
  });
}
