import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/doctor_step.dart';
import 'booking_test_support.dart';

Future<ProviderContainer> pumpDoctor(WidgetTester t,
    {required List<Doctor> docs, BookingTarget target = kSelf}) async {
  final c = await pumpBooking(t, const DoctorStep(),
      overrides: [doctorsProvider(kInternal.id).overrideWith((ref) async => docs)],
      target: target,
      department: kInternal);
  await t.pumpAndSettle();
  return c;
}

void main() {
  testWidgets('[BOOK-DOC-02][BOOK-DOC-03] 사진 원형 + 이름/진료시간/분야 세 줄', (t) async {
    await pumpDoctor(t, docs: const [kDocPhoto]);
    expect(find.byType(CircleAvatar), findsOneWidget);
    expect(find.text('김의사'), findsOneWidget);
    expect(find.text('월·수·금 오전'), findsOneWidget); // 갭 #9 서버 요약을 그대로 표시
    expect(find.text('소화기내과'), findsOneWidget); // 갭 #7 전공
  });

  testWidgets('[BOOK-DOC-05] 사진 없는 의사는 회색 원 + 이름 첫 글자', (t) async {
    await pumpDoctor(t, docs: const [kDocNoPhoto]);
    final av = t.widget<CircleAvatar>(find.byType(CircleAvatar));
    expect(av.backgroundColor, AppTokens.grayPending); // 회색 원(흰 글자 대비 위해 진한 쪽)
    expect(find.text('이'), findsOneWidget); // 첫 글자('사진 없음' 문구 아님)
  });

  testWidgets('[BOOK-DOC-06] 소개글(bio)은 화면에 나타나지 않는다', (t) async {
    await pumpDoctor(t, docs: const [kDocPhoto]);
    // Doctor 모델에 bio 필드 자체가 없다(list_doctors가 반환 안 함) → 화면에 문장 카드가 없다.
    expect(find.textContaining('소개'), findsNothing);
  });

  testWidgets('[BOOK-DOC-08] 예약 대상은 작고 차분한 보조 라벨(강조 아님)', (t) async {
    await pumpDoctor(t, docs: const [kDocPhoto], target: kSelf);
    final lbl = t.widget<Text>(find.text('김순자 님'));
    expect(lbl.style!.fontSize, 13); // 의사 이름(16)보다 작다
    expect(lbl.style!.color, AppTokens.grayPending);
  });

  testWidgets('[BOOK-DOC-01][BOOK-DOC-04] 의사 줄 전체가 터치 영역이고 누르면 4단계로', (t) async {
    final c = await pumpDoctor(t, docs: const [kDocPhoto]);
    await t.tap(find.text('김의사')); // 이름을 눌러도 줄(카드) 전체가 반응
    await t.pump();
    expect(c.read(bookingProvider).step, 3);
  });

  testWidgets('[BOOK-DOC-07][BOOK-DOC-09] 전공·사진·진료시간이 실제로 채워진다(다음가능시간 없음)', (t) async {
    await pumpDoctor(t, docs: const [kDocPhoto]);
    expect(find.text('소화기내과'), findsOneWidget); // 갭 #7 해소 — 이름 외 정보가 있다
    expect(find.text('월·수·금 오전'), findsOneWidget); // 정기 진료시간
    expect(find.textContaining('다음 가능'), findsNothing); // 다음 가능 시간은 표시하지 않는다
  });
}
