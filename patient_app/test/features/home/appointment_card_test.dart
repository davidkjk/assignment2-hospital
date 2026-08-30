import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/features/home/appointment_card.dart';
import 'package:hospital_patient_app/widgets/status_label.dart';

import 'card_test_helpers.dart';

void main() {
  testWidgets('[CARD-COMMON-01] 카드는 누구의 예약인지(대상자 이름)를 먼저 쓴다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: reqView(name: '김순자', code: 'A-2413'))));
    expect(find.textContaining('김순자'), findsOneWidget); // 대상자 이름이 보인다
  });

  testWidgets('[CARD-COMMON-02] 확정 전에는 신청번호로 부른다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: reqView(code: 'A-2413'))));
    expect(find.textContaining('신청번호'), findsOneWidget); // 예약번호가 아니라 신청번호
  });

  testWidgets('[CARD-COMMON-03] 확정 후에는 예약번호로 부른다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: waitView(code: 'A-2413'))));
    expect(find.textContaining('예약번호'), findsOneWidget);
  });

  testWidgets('[CARD-COMMON-04] 상태 라벨은 병원 내부 이름을 그대로 노출하지 않는다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: waitView())));
    // 서버 내부 이름 '진료대기'가 화면에 그대로 나오지 않는다.
    expect(find.textContaining('진료대기'), findsNothing);
  });

  testWidgets('[CARD-COMMON-05] 상태는 색만이 아니라 배지 글자로도 구분된다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: reqView())));
    expect(find.widgetWithText(StatusLabel, '확인 중'), findsOneWidget); // 글자 배지 존재
  });

  testWidgets('[CARD-COMMON-06] 가운데 본문은 132px로 고정된다(상태가 바뀌어도 불변)', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: reqView())));
    expect(bodyHeight(t), AppTokens.cardBodyHeight);
    await t.pumpWidget(wrap(AppointmentCard(view: waitView())));
    expect(bodyHeight(t), AppTokens.cardBodyHeight); // wait로 갈아끼워도 같은 높이
  });
}
