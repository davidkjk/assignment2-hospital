import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_row.dart'; // kListRailWidth
import 'package:hospital_patient_app/features/appointments/appointment_list_qnr_line.dart';
import 'package:hospital_patient_app/widgets/warn_text.dart';

AppointmentView _qv(String status, {String qnr = '미작성', int answered = 0, int total = 8}) =>
    AppointmentView.fromJson({
      'id': 'a',
      'status': status,
      'for_patient_name': '본인',
      'is_self': true,
      'department_name': '내과',
      'doctor_name': '이의사',
      'booking_code': 'A',
      'has_questionnaire': true, // 문진 보유 진료과
      'questionnaire_state': qnr,
      'questionnaire_answered': answered,
      'questionnaire_total': total,
      'slot_date': '2026-09-01',
      'start_time': '10:00',
    });

Widget _wrap(Widget w) => MaterialApp(home: Scaffold(body: w));

void main() {
  testWidgets('[LIST-QNR-01][LIST-QNR-08] 미작성 → 배경 없이 주의색 한 줄 「사전문진 미작성 · 작성하기」', (t) async {
    final w = appointmentListQnrLine(_qv('예약확정', qnr: '미작성'), onOpen: () {});
    await t.pumpWidget(_wrap(w!));
    expect(find.textContaining('사전문진 미작성'), findsOneWidget);
    expect(find.textContaining('작성하기'), findsOneWidget);
    expect(find.byType(WarnText), findsOneWidget); // DISP-WARN-01: 배경 없이 글자 + 좌측 4px 바
  });
  testWidgets('[LIST-QNR-03] 작성 중 → 「사전문진 작성 중 (3/8) · 이어서 쓰기」', (t) async {
    final w = appointmentListQnrLine(_qv('예약확정', qnr: '작성 중', answered: 3, total: 8), onOpen: () {});
    await t.pumpWidget(_wrap(w!));
    expect(find.textContaining('작성 중 (3/8)'), findsOneWidget);
    expect(find.textContaining('이어서 쓰기'), findsOneWidget);
  });
  test('[LIST-QNR-02][LIST-QNR-05] 작성완료 → null (목록엔 안 뜨고, 완료분은 상세에서 본다)', () {
    expect(appointmentListQnrLine(_qv('예약확정', qnr: '작성완료'), onOpen: () {}), isNull);
  });
  test('[LIST-QNR-04] 진료중 이후 → null (지금 할 일이 있는 줄에만 준다)', () {
    expect(appointmentListQnrLine(_qv('진료중', qnr: '미작성'), onOpen: () {}), isNull);
    expect(appointmentListQnrLine(_qv('도착', qnr: '작성 중'), onOpen: () {}), isNull); // 도착=진료 임박도 대상 아님
  });
  test('[LIST-QNR-04] 문진 미보유 진료과 → null', () {
    final v = AppointmentView.fromJson({
      'id': 'a', 'status': '예약확정', 'for_patient_name': '본인', 'is_self': true,
      'department_name': '내과', 'doctor_name': '이의사', 'booking_code': 'A',
      'has_questionnaire': false, 'slot_date': '2026-09-01', 'start_time': '10:00',
    });
    expect(appointmentListQnrLine(v, onOpen: () {}), isNull);
  });
  testWidgets('[LIST-QNR-06] 누르면 문진 화면으로 (상세를 거치지 않는다)', (t) async {
    var opened = false;
    final w = appointmentListQnrLine(_qv('예약확정', qnr: '미작성'), onOpen: () => opened = true);
    await t.pumpWidget(_wrap(w!));
    await t.tap(find.byType(WarnText));
    expect(opened, isTrue); // onOpen = MyAppointmentsScreen.openQuestionnaire (NAV-LIST-04)
  });
  testWidgets('[LIST-QNR-07] 왼쪽을 레일 폭만큼 띄워 같은 상자임을 보인다', (t) async {
    final w = appointmentListQnrLine(_qv('예약확정', qnr: '미작성'), onOpen: () {});
    await t.pumpWidget(_wrap(w!));
    final pad = t.widget<Padding>(
        find.ancestor(of: find.byType(WarnText), matching: find.byType(Padding)).first);
    expect((pad.padding as EdgeInsets).left, kListRailWidth); // 레일 폭(T30 상수)만큼 들여쓴다
  });
}
