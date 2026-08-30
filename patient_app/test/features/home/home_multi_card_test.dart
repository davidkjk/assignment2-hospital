import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_multi_card.dart';
import 'package:hospital_patient_app/widgets/action_button.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

AppointmentView _view(String id, String status, {String name = '본인', String? code = 'A-1'}) =>
    AppointmentView.fromJson({
      'id': id,
      'status': status,
      'for_patient_name': name,
      'is_self': name == '본인',
      'booking_code': code,
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': '2030-08-18',
      'start_time': '09:00',
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

void main() {
  testWidgets('[HOME-CARD-02] 각 줄에 시각 레일 + 이름 + [QR] 버튼', (t) async {
    await t.pumpWidget(_wrap(HomeMultiCard(views: [
      _view('1', '예약확정', name: '본인', code: 'A-1'),
      _view('2', '예약확정', name: '김순자', code: 'A-2'),
    ])));
    expect(find.widgetWithText(ActionButton, 'QR'), findsNWidgets(2)); // 확정 예약마다 QR 줄
    expect(find.textContaining('오전 9:00'), findsWidgets); // 시각 레일
    expect(find.textContaining('김순자'), findsOneWidget); // 각 줄에 이름
  });

  testWidgets('[HOME-CARD-02] 확인 중(신청)인 줄은 QR 대신 확인 중 글자', (t) async {
    await t.pumpWidget(_wrap(HomeMultiCard(views: [
      _view('3', '예약신청', name: '본인'),
      _view('4', '예약확정', name: '김순자'),
    ])));
    expect(find.text('확인 중'), findsOneWidget); // CARD-REQ-06와 같은 규칙(줄 형태)
    expect(find.widgetWithText(ActionButton, 'QR'), findsOneWidget); // 확정인 줄만 QR
  });
}
