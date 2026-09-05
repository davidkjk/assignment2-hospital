import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:hospital_patient_app/features/home/appointment_card.dart';
import 'package:hospital_patient_app/features/home/card_bodies_b.dart';
import 'package:hospital_patient_app/features/home/hospital_change_banner.dart';
import 'package:hospital_patient_app/features/home/status_badge.dart';

import 'card_test_helpers.dart';

void main() {
  // ── 확정(CARD-OK) ──
  testWidgets('[CARD-OK-01] 확정 카드 가운데는 접수용 QR 미리보기 + 예약번호', (t) async {
    await t.pumpWidget(wrap(QrPreviewBody(view: bView('예약확정', code: '241401'))));
    expect(find.textContaining('접수용 QR'), findsOneWidget);
    expect(find.textContaining('241401'), findsOneWidget);
  });
  testWidgets('[CARD-OK-01b] 카드 안엔 실제 QR을 그리지 않는다(전체화면에만) — 아이콘 + 눌러서 크게', (t) async {
    await t.pumpWidget(wrap(QrPreviewBody(view: bView('예약확정'))));
    expect(find.byType(QrImageView), findsNothing); // 작은 카드엔 실 QR 안 그림
    expect(find.textContaining('눌러서 크게 보기'), findsOneWidget);
  });
  testWidgets('[CARD-OK-04] 확정 카드 버튼은 시간 변경 · 예약 취소(아웃라인)', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('예약확정'))));
    expect(find.widgetWithText(OutlinedButton, '시간 변경'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, '예약 취소'), findsOneWidget);
  });

  // ── 도착(CARD-IN) ──
  testWidgets('[CARD-IN-01] 도착 카드는 QR이 사라지고 접수됨 + 순서 준비 중', (t) async {
    await t.pumpWidget(wrap(const InBody()));
    expect(find.textContaining('접수되었습니다'), findsOneWidget);
    expect(find.textContaining('순서를 준비 중입니다'), findsOneWidget);
  });
  testWidgets('[CARD-IN-02][CARD-IN-03] 도착엔 내 앞 N명을 쓰지 않고 문장을 남긴다', (t) async {
    await t.pumpWidget(wrap(const InBody()));
    expect(find.textContaining('내 앞에'), findsNothing);
    expect(find.textContaining('순서를 준비'), findsOneWidget);
  });
  testWidgets('[CARD-IN-04] 도착 카드는 변경·취소 버튼을 숨긴다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('도착'))));
    expect(find.widgetWithText(OutlinedButton, '예약 취소'), findsNothing);
    expect(find.widgetWithText(OutlinedButton, '시간 변경'), findsNothing);
  });

  // ── 진료중(CARD-DOC) ──
  testWidgets('[CARD-DOC-01] 진료중 카드는 진료 중 표시 + 대기 인원 숫자를 지운다', (t) async {
    await t.pumpWidget(wrap(const DocBody()));
    expect(find.textContaining('진료 중입니다'), findsOneWidget);
    expect(find.textContaining('내 앞에'), findsNothing);
  });
  testWidgets('[CARD-DOC-03] 진료중 문진 줄은 숨기지 않고 자물쇠로 잠근다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('진료중', hasQuestionnaire: true))));
    expect(find.byIcon(AppIcons.lock), findsOneWidget);
    expect(find.textContaining('수정할 수 없습니다'), findsOneWidget);
  });

  // ── 완료(CARD-DONE) ──
  testWidgets('[CARD-DONE-01] 완료 카드 배지는 진료가 끝났습니다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('진료완료'))));
    expect(find.widgetWithText(StatusBadge, '진료가 끝났습니다'), findsOneWidget);
  });
  testWidgets('[CARD-DONE-04] 완료 카드 버튼은 방문 이력 보기', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('진료완료'))));
    expect(find.widgetWithText(OutlinedButton, '방문 이력 보기'), findsOneWidget);
  });
  testWidgets('[CARD-DONE-05] 완료 카드 문진 줄은 내가 작성한 사전문진 보기', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('진료완료', hasQuestionnaire: true))));
    expect(find.textContaining('내가 작성한 사전문진 보기'), findsOneWidget);
  });

  // ── 취소(CARD-CXL) 3갈래 ──
  testWidgets('[CARD-CXL-02] 병원이 취소하면 병원에서 취소했습니다(직원 이름 없음)', (t) async {
    await t.pumpWidget(wrap(CxlBody(view: bView('병원취소', cancelledBy: 'hospital'))));
    expect(find.text('병원에서 취소했습니다'), findsOneWidget);
  });
  testWidgets('[CARD-CXL-03] 가족이 취소하면 관계+이름으로 누가 취소했는지 보인다', (t) async {
    await t.pumpWidget(wrap(CxlBody(
        view: bView('환자취소',
            isSelf: false,
            relation: '배우자',
            cancelledBy: 'patient',
            cancelledByRelation: '배우자',
            cancelledByName: '김영수'))));
    expect(find.textContaining('배우자 김영수 님이 취소했습니다'), findsOneWidget);
  });
  testWidgets('[CARD-CXL-04] 본인이 취소하면 취소하셨습니다', (t) async {
    await t.pumpWidget(wrap(CxlBody(view: bView('환자취소', cancelledBy: 'patient', isSelf: true))));
    expect(find.text('취소하셨습니다'), findsOneWidget);
  });
  testWidgets('[CARD-CXL-01] 취소 카드 배지는 취소됨', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('병원취소', cancelledBy: 'hospital'))));
    expect(find.widgetWithText(StatusBadge, '취소됨'), findsOneWidget);
  });
  testWidgets('[CARD-CXL-07] 취소 카드에는 문진 줄이 없다', (t) async {
    await t.pumpWidget(wrap(
        AppointmentCard(view: bView('병원취소', cancelledBy: 'hospital', hasQuestionnaire: true))));
    expect(find.textContaining('사전문진'), findsNothing);
  });
  testWidgets('[CARD-CXL-08] 취소 카드 버튼은 새로 예약하기(변경·취소 없음)', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('병원취소', cancelledBy: 'hospital'))));
    expect(find.widgetWithText(OutlinedButton, '새로 예약하기'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, '예약 취소'), findsNothing);
  });
  testWidgets('[CARD-CHG-06 경계] 병원취소면 CxlBody가 전담하고 변경 배너는 얹지 않는다', (t) async {
    await t.pumpWidget(wrap(
        AppointmentCard(view: bView('병원취소', cancelledBy: 'hospital', changeKind: 'cancelled'))));
    expect(find.byType(HospitalChangeBanner), findsNothing);
    expect(find.text('병원에서 취소했습니다'), findsOneWidget);
  });

  // ── 시간 지남(CARD-LATE ⑨) ──
  testWidgets('[CARD-LATE-02][CARD-LATE-03] 시간 지남 카드는 시간 지남 배지 + QR을 살려둔다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: lateView())));
    expect(find.widgetWithText(StatusBadge, '시간 지남'), findsOneWidget);
    expect(find.textContaining('접수용 QR'), findsOneWidget); // QR 미리보기 살아 있음
  });
  testWidgets('[CARD-LATE-04] 주의 한 줄은 병원에 연락해 주세요(마침표 없음)', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: lateView())));
    expect(find.text('병원에 연락해 주세요'), findsOneWidget);
  });
  testWidgets('[CARD-LATE-05] 버튼은 상담 채팅 연결 · 병원 전화', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: lateView())));
    expect(find.widgetWithText(OutlinedButton, '상담 채팅 연결'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, '병원 전화'), findsOneWidget);
  });
  testWidgets('[CARD-LATE-06~08] 금지 문구를 쓰지 않는다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: lateView())));
    for (final banned in ['안 오셨습니다', '예약 부도', '오늘 안에 오시면', '부도']) {
      expect(find.textContaining(banned), findsNothing);
    }
  });

  // ── 오프라인(CARD-OFF) ──
  testWidgets('[CARD-OFF-02] 오프라인에서 도착 카드는 그대로 보인다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('도착'), online: false)));
    expect(find.byType(AppointmentCard), findsOneWidget);
  });
  testWidgets('[CARD-OFF-03][CARD-OFF-05] 오프라인이면 순서 대신 문장만, 기준 시각 안 붙임', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: bView('진료대기'), online: false)));
    expect(find.textContaining('내 앞에'), findsNothing);
    expect(find.textContaining('순서는 인터넷이 연결되어야 확인할 수 있습니다'), findsOneWidget);
    expect(find.textContaining('기준'), findsNothing);
  });
}
