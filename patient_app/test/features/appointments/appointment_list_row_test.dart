import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_row.dart';

AppointmentView _v(String status, {DateTime? change, String name = '본인', bool self = true}) =>
    AppointmentView.fromJson({
      'id': 'a',
      'status': status,
      'for_patient_name': name,
      'is_self': self,
      'department_name': '정형외과',
      'doctor_name': '박서준',
      'booking_code': 'A-1',
      'has_questionnaire': false,
      'slot_date': '2026-09-01',
      'start_time': '14:00',
      'support_requested_at': null,
      'request_type': null,
      'hospital_change_prev_time': change?.toIso8601String(),
      'hospital_change_kind': change == null ? null : 'time',
    });

Widget _wrap(Widget w) => MaterialApp(home: Scaffold(body: w));
final now = DateTime(2026, 9, 1, 9, 0);

void main() {
  testWidgets('[LIST-LIST-07][Task10] 데모 컴팩트 행 — 시각 + 이름 옆 관계(본인/딸), 컬러 레일 없음', (t) async {
    await t.pumpWidget(_wrap(AppointmentListRow(view: _v('예약확정'), now: now)));
    expect(find.text('14:00'), findsOneWidget);
    expect(find.text('본인'), findsWidgets); // LIST-LIST-15: 본인도 '본인'으로 표기
    expect(find.byKey(const Key('list-rail')), findsNothing); // 큰 컬러 레일 블록 폐기
  });
  testWidgets('[LIST-LIST-08][Task10] 예약신청은 딥틸 레일 대신 오른쪽 「확인 중」 회색 글자로 알린다', (t) async {
    await t.pumpWidget(_wrap(AppointmentListRow(view: _v('예약신청'), now: now)));
    expect(find.text('확인 중'), findsOneWidget);
    expect(find.byKey(const Key('list-rail')), findsNothing);
  });
  testWidgets('[LIST-LIST-09][LIST-LIST-10] 이름이 굵게 먼저, 그 아래 진료과·의사 선생님', (t) async {
    await t.pumpWidget(_wrap(AppointmentListRow(view: _v('예약확정', name: '딸', self: false), now: now)));
    expect(find.text('딸'), findsWidgets);
    expect(find.text('정형외과 · 박서준 선생님'), findsOneWidget);
  });
  testWidgets('[LIST-LIST-11] 줄 오른쪽에 상태 글자, 상태가 없으면 › 하나', (t) async {
    await t.pumpWidget(_wrap(AppointmentListRow(view: _v('예약신청'), now: now)));
    expect(find.text('확인 중'), findsOneWidget);
    await t.pumpWidget(_wrap(AppointmentListRow(view: _v('예약확정'), now: now))); // 글자 없음
    expect(find.byIcon(AppIcons.chevron_right), findsOneWidget);
  });
  testWidgets('[LIST-LIST-12][LIST-ST-15][LIST-ST-17] 줄에는 어떤 버튼도 두지 않는다(변경·취소·문진·QR·확인)', (t) async {
    await t.pumpWidget(_wrap(AppointmentListRow(view: _v('예약확정', change: DateTime(2026, 8, 20, 9)), now: now)));
    expect(find.byType(ElevatedButton), findsNothing);
    expect(find.byType(OutlinedButton), findsNothing);
    expect(find.byType(TextButton), findsNothing);
    expect(find.text('확인'), findsNothing); // 병원발 변경이어도 [확인] 없음
  });
  testWidgets('[LIST-ST-14] 시간 지남 줄에 「병원에 연락해 주세요」 안내 한 줄을 붙이지 않는다(B-43)', (t) async {
    await t.pumpWidget(_wrap(AppointmentListRow(view: _v('예약확정'), now: DateTime(2026, 9, 1, 15))));
    expect(find.text('시간 지남'), findsOneWidget);
    expect(find.textContaining('연락'), findsNothing);
  });
  testWidgets('[LIST-ST-18] 병원발 변경 줄에도 [확인]을 두지 않는다 — 확인은 예약 1건에 한 곳(상세)에서만', (t) async {
    await t.pumpWidget(_wrap(AppointmentListRow(view: _v('예약확정', change: DateTime(2026, 8, 20, 9)), now: now)));
    expect(find.text('시간 변경됨'), findsOneWidget); // 상태 글자만 알린다
    expect(find.widgetWithText(OutlinedButton, '확인'), findsNothing);
    expect(find.widgetWithText(TextButton, '확인'), findsNothing);
  });
  testWidgets('[LIST-LIST-06] 한 예약 = 테두리로 묶인 한 상자(줄 + 문진 슬롯)', (t) async {
    await t.pumpWidget(_wrap(AppointmentBox(
        view: _v('예약확정'), now: now, questionnaireSlot: const Text('문진 슬롯'))));
    expect(find.byKey(const Key('appointment-box')), findsOneWidget);
    expect(find.text('문진 슬롯'), findsOneWidget); // T31이 채울 자리를 상자가 함께 감싼다
    expect(find.text('정형외과 · 박서준 선생님'), findsOneWidget); // 줄도 같은 상자 안
  });
}
