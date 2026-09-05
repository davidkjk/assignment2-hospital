import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_qnr_line.dart';

AppointmentView _qv(String status, {String qnr = '미작성', int answered = 0, int total = 8}) =>
    AppointmentView.fromJson({
      'id': 'a',
      'status': status,
      'for_patient_name': '본인',
      'is_self': true,
      'department_name': '내과',
      'doctor_name': '이의사',
      'booking_code': 'A',
      // ⭐ 실계약: has_questionnaire = 응답 행 존재 = 「작성 시작함」. 미작성이면 행이 없어 false다
      //    (list API `exists(questionnaire_responses)`). 문진 보유 여부는 questionnaire_total>0로 가른다.
      'has_questionnaire': qnr != '미작성',
      'questionnaire_state': qnr,
      'questionnaire_answered': answered,
      'questionnaire_total': total,
      'slot_date': '2026-09-01',
      'start_time': '10:00',
    });

Widget _wrap(Widget w) => MaterialApp(home: Scaffold(body: w));

void main() {
  testWidgets('[LIST-QNR-01][Task10] 미작성 → 딥틸 틴트 밴드 「사전문진 미작성 · 작성하기」 + ›', (t) async {
    final w = appointmentListQnrLine(_qv('예약확정', qnr: '미작성'), onOpen: () {});
    await t.pumpWidget(_wrap(w!));
    expect(find.textContaining('사전문진 미작성'), findsOneWidget);
    expect(find.textContaining('작성하기'), findsOneWidget);
    expect(find.byKey(const Key('qnr-band')), findsOneWidget); // 데모 카드 아래 밴드
    expect(find.byIcon(AppIcons.chevron_right), findsOneWidget);
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
    await t.tap(find.byKey(const Key('qnr-band')));
    expect(opened, isTrue); // onOpen = MyAppointmentsScreen.openQuestionnaire (NAV-LIST-04)
  });
  testWidgets('[LIST-QNR-07][Task10] 상단 경계 있는 밴드로 줄과 한 상자임을 보인다(데모 border-t)', (t) async {
    final w = appointmentListQnrLine(_qv('예약확정', qnr: '미작성'), onOpen: () {});
    await t.pumpWidget(_wrap(w!));
    final band = t.widget<Container>(find.byKey(const Key('qnr-band')));
    final deco = band.decoration as BoxDecoration;
    expect(deco.border?.top.color, isNot(Colors.transparent)); // 위 경계로 줄에 이어 붙는다
  });
}
