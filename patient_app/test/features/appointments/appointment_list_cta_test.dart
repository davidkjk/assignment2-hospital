import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_cta.dart';

Widget _wrap(Widget w) => MaterialApp(home: Scaffold(body: w));

void main() {
  testWidgets('[LIST-CTA-01][LIST-CTA-02] 항상 화면 하단에 「+ 새 예약하기」 하나', (t) async {
    await t.pumpWidget(_wrap(AppointmentListCta(offline: false, onNewBooking: () {})));
    expect(find.text('+ 새 예약하기'), findsOneWidget);
  });
  testWidgets('[LIST-CTA-04] 누르면 예약 1단계로 (onNewBooking 호출)', (t) async {
    var went = false;
    await t.pumpWidget(_wrap(AppointmentListCta(offline: false, onNewBooking: () => went = true)));
    await t.tap(find.text('+ 새 예약하기'));
    expect(went, isTrue);
  });
  testWidgets('[LIST-CTA-05] 오프라인이면 비활성 + 이유 문구(숨기지 않는다)', (t) async {
    var went = false;
    await t.pumpWidget(_wrap(AppointmentListCta(offline: true, onNewBooking: () => went = true)));
    await t.tap(find.text('+ 새 예약하기'));
    expect(went, isFalse); // 비활성
    expect(find.textContaining('연결'), findsWidgets); // disabledReason 문구 노출
  });
}
