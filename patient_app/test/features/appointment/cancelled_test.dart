import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/appointment/appointment_actions.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/appointment/cancelled_view.dart';
import 'package:hospital_patient_app/features/appointment/reject_banner.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show homeAppointmentsProvider;

import 'flow_harness.dart';
import 'harness.dart';

AppointmentView _v({
  String? cancelledBy,
  String? cancelledByRelation,
  String? cancelledByName,
}) =>
    AppointmentView(
      id: 'a1',
      status: '병원취소',
      forPatientName: '김순자',
      departmentName: '정형외과',
      doctorName: '김의사',
      hasQuestionnaire: false,
      cancelledBy: cancelledBy,
      cancelledByRelation: cancelledByRelation,
      cancelledByName: cancelledByName,
      cancelledAt: DateTime(2026, 8, 4, 10, 0),
    );

void main() {
  // ── CANCEL-DONE: 취소된 뒤 상세(상세 화면 재사용) ──────────────────────────
  testWidgets('[CANCEL-DONE-01][CANCEL-DONE-02] 회색 머리·취소됨 배지 + 취소 일시·주체', (t) async {
    await pumpDetail(t,
        detail: detail(status: '병원취소', cancelledBy: 'hospital', cancelledAt: DateTime(2026, 8, 4, 10, 0)));
    expect(find.text('취소됨'), findsOneWidget); // 배지
    expect(find.text('병원에서 취소했습니다'), findsOneWidget); // 누가
    expect(find.textContaining('8월 4일'), findsWidgets); // 언제
  });

  testWidgets('[CANCEL-DONE-03][CANCEL-DONE-08] [새로 예약하기] 하나, 새 예약은 문진 자동 안 끌어옴', (t) async {
    final h = await pumpDetail(t, detail: detail(status: '병원취소', cancelledBy: 'hospital'));
    expect(find.text('새로 예약하기'), findsOneWidget);
    expect(find.text('예약 변경'), findsNothing); // 변경/취소 버튼은 없다
    await t.tap(find.text('새로 예약하기'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/booking'); // 새 문진(변경과 다름, C-6은 변경에만)
  });

  testWidgets('[CANCEL-DONE-07] 취소돼도 문진은 읽기 전용으로 볼 수 있다(안 지움)', (t) async {
    await pumpDetail(t, detail: detail(status: '병원취소', cancelledBy: 'hospital', qnr: 'readonly'));
    expect(find.textContaining('작성완료'), findsOneWidget);
  });

  // ── APPT-RACE-04: 누가 취소했는지(직원 이름 없이) ─────────────────────────
  test('[APPT-RACE-04][APPT-RACE-05] 취소 주체 문구 — 병원/가족/본인, 직원 이름 안 씀', () {
    expect(cancellerActor(_v(cancelledBy: 'hospital')), '병원에서 취소했습니다');
    expect(cancellerActor(_v(cancelledBy: 'patient', cancelledByRelation: '어머니', cancelledByName: '김영자')),
        '어머니 김영자 님이 취소했습니다');
    expect(cancellerActor(_v(cancelledBy: 'patient')), '취소하셨습니다');
    expect(cancellerActor(_v(cancelledBy: 'hospital')).contains('선생님'), isFalse); // RACE-05
  });

  // ── APPT-RACE-03: 병원발 시각 변경 배너(전→후 + 확인) ─────────────────────
  testWidgets('[APPT-RACE-03][APPT-RACE-06] 시각만 바뀌면 병원 사정 변경 문구 + 전→후 + [확인]', (t) async {
    final fake = FakeAppointmentActions();
    final d = detail(
      status: '예약확정',
      slot: DateTime(2026, 8, 5, 16, 0),
      hospitalChangePrevTime: DateTime(2026, 8, 5, 14, 30),
      hospitalChangeKind: 'changed',
    );
    await t.pumpWidget(ProviderScope(
      overrides: [
        appointmentActionsProvider.overrideWithValue(fake),
        appointmentDetailProvider('a1').overrideWith((ref) async => d),
        homeAppointmentsProvider.overrideWith((ref) async => <AppointmentView>[]),
      ],
      child: MaterialApp(
        theme: AppTheme.theme,
        home: Consumer(builder: (c, ref, _) {
          ref.watch(appointmentDetailProvider('a1'));
          return Scaffold(body: SingleChildScrollView(child: ChangeNoticeBanner(d)));
        }),
      ),
    ));
    await t.pump();
    expect(find.textContaining('변경되었습니다'), findsOneWidget); // 병원 사정으로 …으로 변경되었습니다
    expect(find.textContaining('→'), findsOneWidget); // 전 → 후
    expect(find.text('확인'), findsOneWidget);
    await t.tap(find.text('확인'));
    await t.pumpAndSettle();
    expect(fake.ackChanges, ['a1']); // APPT-RACE-06 — [확인]이 서버 두 칸을 비운다
  });

  testWidgets('[APPT-RACE-03b] 병원발 변경이 없으면 배너는 자리를 차지하지 않는다', (t) async {
    final d = detail(status: '예약확정');
    await t.pumpWidget(ProviderScope(
      child: MaterialApp(theme: AppTheme.theme, home: Scaffold(body: ChangeNoticeBanner(d))),
    ));
    await t.pump();
    expect(find.textContaining('변경되었습니다'), findsNothing);
  });
}
