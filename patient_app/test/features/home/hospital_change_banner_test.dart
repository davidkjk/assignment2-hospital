import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_card.dart';
import 'package:hospital_patient_app/features/home/hospital_change_banner.dart';
import 'package:hospital_patient_app/widgets/action_button.dart';

import 'card_test_helpers.dart';

void main() {
  testWidgets('[CARD-CHG-02] 변경 안내는 전·후 시각을 함께 보이고 [확인]을 둔다', (t) async {
    await t.pumpWidget(wrap(HospitalChangeBanner(
        view: changedView(prev: DateTime(2026, 8, 18, 14, 30), next: DateTime(2026, 8, 18, 16, 0)),
        onConfirm: () {})));
    expect(find.textContaining('병원 사정으로 시간이 변경되었습니다'), findsOneWidget);
    expect(find.textContaining('오후 2:30 → 오후 4:00'), findsOneWidget); // 전 → 후
    expect(find.widgetWithText(ActionButton, '확인'), findsOneWidget);
  });

  testWidgets('[CARD-CHG-03] 안내문의 시각은 새 시간을 보인다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(
        view: changedView(prev: DateTime(2026, 8, 18, 14, 30), next: DateTime(2026, 8, 18, 16, 0)))));
    expect(find.textContaining('오후 4:00'), findsWidgets); // 새 시간이 보인다
  });

  testWidgets('[CARD-CHG-04] [확인]을 누르면 onConfirm(=서버 acknowledge)이 불린다', (t) async {
    var acked = false;
    await t.pumpWidget(wrap(HospitalChangeBanner(
        view: changedView(prev: DateTime(2026, 8, 18, 14, 30), next: DateTime(2026, 8, 18, 16, 0)),
        onConfirm: () => acked = true)));
    await t.tap(find.widgetWithText(ActionButton, '확인'));
    expect(acked, isTrue); // 두 칸을 비우는 서버 호출로 이어진다(껐다 켜도 안 뜸)
  });

  testWidgets('[CARD-CHG-06] 병원발 취소는 취소 사실을 알리고 [새로 예약하기]를 준다', (t) async {
    await t.pumpWidget(wrap(HospitalChangeBanner(view: cancelledView(), onConfirm: () {})));
    expect(find.textContaining('병원 사정으로 예약이 취소되었습니다'), findsOneWidget);
    expect(find.widgetWithText(ActionButton, '새로 예약하기'), findsOneWidget);
  });

  testWidgets('[CARD-CHG-01][CARD-CHG-05] 안내문은 그 카드 위에 한 덩어리로 붙는다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(
        view: changedView(prev: DateTime(2026, 8, 18, 14, 30), next: DateTime(2026, 8, 18, 16, 0)))));
    // AppCard.announcement 슬롯(DISP-ATT-01)에 배너가 들어가 카드와 간격 0으로 붙는다.
    expect(find.byType(HospitalChangeBanner), findsOneWidget);
  });
}
