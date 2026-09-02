import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/appointment/cancel_flow.dart';
import 'package:hospital_patient_app/widgets/app_dialog.dart';

import 'flow_harness.dart';
import 'harness.dart';

// 확인창 → [취소합니다]까지 눌러 흐름을 진행한다.
Future<FlowHarness> _openCancel(WidgetTester t,
    {required AppointmentDetail d, FakeAppointmentActions? fake}) async {
  final h = await pumpFlow(t,
      fixture: d,
      fake: fake ?? FakeAppointmentActions(),
      onTap: (c, r) => openCancelFlow(c, r, d));
  await t.tap(find.text('go'));
  await t.pump(); // 확인창 뜸
  return h;
}

Future<void> _tapConfirm(WidgetTester t) async {
  await t.tap(find.text('취소합니다'));
  await t.pumpAndSettle();
}

void main() {
  // ── CANCEL-PRE: 마감 전 취소 확인창 ─────────────────────────────────────────
  testWidgets('[CANCEL-PRE-01][CANCEL-PRE-02] 확인창에 취소 대상(누구·언제)을 다시 적는다', (t) async {
    await _openCancel(t,
        d: detail(relation: '어머니', forName: '박영자', isSelf: false, slot: DateTime(2026, 8, 5, 14, 30)));
    expect(find.byType(AppDialogCard), findsOneWidget); // 데모 커스텀 모달(AlertDialog 아님)
    expect(find.textContaining('박영자'), findsOneWidget); // 대상
    expect(find.textContaining('8월 5일'), findsOneWidget); // 언제
  });

  testWidgets('[CANCEL-PRE-03][CANCEL-PRE-04] 왼쪽 아니요(테두리) / 오른쪽 취소합니다(빨강)', (t) async {
    await _openCancel(t, d: detail());
    expect(find.widgetWithText(OutlinedButton, '아니요'), findsOneWidget);
    final del = t.widget<FilledButton>(find.widgetWithText(FilledButton, '취소합니다'));
    expect(del.style!.backgroundColor!.resolve({}), kDestructiveRed); // 확인창 안에서만 빨강(채움)
  });

  testWidgets('[CANCEL-PRE-05][CANCEL-PRE-06] 취소 사유 입력·타이핑 확인이 없다', (t) async {
    await _openCancel(t, d: detail());
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('[CANCEL-PRE-07] 마감 전 취소 성공하면 화면을 안 옮기고 취소된 상세로 다시 그린다', (t) async {
    final h = await _openCancel(t,
        d: detail(), fake: FakeAppointmentActions(cancelResult: (cancelled: true, afterDeadline: false)));
    await _tapConfirm(t);
    expect(h.invalidatedDetail, isTrue); // invalidate로 재그림(NavigatorObserver 이동 없음)
    expect(find.byType(LateSupportDialog), findsNothing);
  });

  // ── CANCEL-NEW: 갓 만든 예약 30분 유예 ─────────────────────────────────────
  testWidgets('[CANCEL-NEW-01] 만든 지 30분 이내면 확인창→즉시 취소(마감 후 팝업 안 뜸)', (t) async {
    final h = await _openCancel(t,
        d: detail(createdAt: DateTime.now()),
        fake: FakeAppointmentActions(cancelResult: (cancelled: true, afterDeadline: false)));
    await _tapConfirm(t);
    expect(find.byType(LateSupportDialog), findsNothing); // 마감 후 안내 안 뜸
    expect(h.invalidatedDetail, isTrue);
  });

  testWidgets('[CANCEL-NEW-06] 예약 상세에 "30분 안에 취소" 재촉을 미리 띄우지 않는다', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정', createdAt: DateTime.now()));
    expect(find.textContaining('30분 안에 취소'), findsNothing);
  });

  // ── CANCEL-LATE: 마감 후 안내 팝업 + 상담 연결 ──────────────────────────────
  Future<FlowHarness> openLate(WidgetTester t, {AppointmentDetail? d, FakeAppointmentActions? fake}) async {
    final fx = d ?? detail(deadlineHours: 24);
    final h = await _openCancel(t,
        d: fx, fake: fake ?? FakeAppointmentActions(cancelResult: (cancelled: false, afterDeadline: true)));
    await _tapConfirm(t); // 확인 → cancel(afterDeadline:true) → 안내 팝업
    return h;
  }

  testWidgets('[CANCEL-LATE-01] 마감 후엔 확인창이 아니라 안내 팝업(시계 + 마감 문구)', (t) async {
    await openLate(t);
    expect(find.text('취소 마감 시간이 지났습니다'), findsOneWidget);
  });

  testWidgets('[CANCEL-LATE-02][CANCEL-LATE-03] 설정값 N시간을 채우고 의사 이름은 안 붙인다', (t) async {
    await openLate(t, d: detail(deadlineHours: 24));
    expect(find.text('진료 시작 24시간 전까지만 앱에서 취소할 수 있습니다.'), findsOneWidget);
    expect(find.textContaining('의사'), findsNothing);
    expect(find.textContaining('선생님'), findsNothing);
  });

  testWidgets('[CANCEL-LATE-04][CANCEL-LATE-05] 채팅 먼저·전화 나중 두 경로', (t) async {
    await openLate(t);
    expect(find.text('상담 채팅으로 문의하시거나 병원으로 전화해 주세요.'), findsOneWidget);
    expect(find.text('상담 채팅 연결'), findsOneWidget);
  });

  testWidgets('[CANCEL-LATE-06] 전화번호는 테두리 상자', (t) async {
    await openLate(t, d: detail(phone: '02-1-2', deadlineHours: 24));
    expect(find.widgetWithText(OutlinedButton, '02-1-2'), findsOneWidget);
  });

  testWidgets('[CANCEL-LATE-07] [닫기]로 빠져나갈 문이 있다', (t) async {
    await openLate(t);
    expect(find.text('닫기'), findsOneWidget);
  });

  testWidgets('[CANCEL-LATE-11][CANCEL-LATE-12] 상담 채팅 연결을 누르면 support_requested + 상담으로', (t) async {
    final h = await openLate(t);
    await t.tap(find.text('상담 채팅 연결'));
    await t.pumpAndSettle();
    expect(h.fake.supportRequests, ['취소']); // request_type='취소'
    expect(h.lastRoute, contains('/chat'));
  });

  testWidgets('[CANCEL-LATE-13] "취소 요청이 접수되었습니다" 류 금지', (t) async {
    await openLate(t);
    expect(find.textContaining('접수되었습니다'), findsNothing);
    expect(find.textContaining('요청해 두었습니다'), findsNothing);
  });

  // ── APPT-RACE: 낙관적 잠금 409(취소 경로) ─────────────────────────────────
  testWidgets('[APPT-RACE-01][APPT-RACE-02] 409면 화면 안 옮기고 상세를 다시 그린다', (t) async {
    final h = await _openCancel(t,
        d: detail(),
        fake: FakeAppointmentActions(cancelError: ApiException('changed', statusCode: 409)));
    await _tapConfirm(t);
    expect(h.invalidatedDetail, isTrue); // 다시 그림
    expect(h.lastRoute, '/'); // 상세에 머묾(다른 곳으로 안 감)
  });

  testWidgets('[APPT-RACE-08] 상세만이 아니라 홈까지 한 벌로 고친다', (t) async {
    final h = await _openCancel(t,
        d: detail(),
        fake: FakeAppointmentActions(cancelError: ApiException('x', statusCode: 409)));
    await _tapConfirm(t);
    expect(h.invalidatedDetail, isTrue);
    expect(h.invalidatedHome, isTrue); // UpcomingCache/홈까지
  });

  testWidgets('[APPT-RACE-07] 409 뒤 처리 중 잠금이 풀려 다시 누를 수 있다', (t) async {
    await _openCancel(t,
        d: detail(),
        fake: FakeAppointmentActions(cancelError: ApiException('x', statusCode: 409)));
    await _tapConfirm(t);
    final container = ProviderScope.containerOf(t.element(find.byType(FlowHost)));
    final st = container.read(detailActionProvider('a1'));
    expect(st.isLoading, isFalse); // 버튼 다시 활성
    expect(st.hasError, isFalse);
  });
}
