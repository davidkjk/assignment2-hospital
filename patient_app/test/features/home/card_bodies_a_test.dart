import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_card.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/card_bodies_a.dart';
import 'package:hospital_patient_app/widgets/action_button.dart';
import 'package:hospital_patient_app/widgets/status_label.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'card_test_helpers.dart';

void main() {
  // ── ReqBody(확인 중) — CARD-REQ ────────────────────────────────
  testWidgets('[CARD-REQ-03] 확인 중에는 QR을 그리지 않고 안내 문구를 둔다', (t) async {
    await t.pumpWidget(wrap(const ReqBody()));
    expect(find.textContaining('확정되면 여기에 접수용 QR이 나타납니다'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing); // QR 위젯 없음
  });

  testWidgets('[CARD-REQ-04] 카드 위 안내는 병원이 확인하는 중임을 알린다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: reqView())));
    expect(find.textContaining('병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.'), findsOneWidget);
  });

  testWidgets('[CARD-REQ-05] 소요 시간을 약속하지 않는다(보통 1~2시간 금지)', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: reqView())));
    expect(find.textContaining('시간'), findsNothing); // 소요 시간 추정 문구 없음
  });

  testWidgets('[CARD-REQ-06] 여러 줄 목록의 QR 자리에는 확인 중 글자가 온다', (t) async {
    await t.pumpWidget(wrap(const ReqBody(compact: true)));
    expect(find.text('확인 중'), findsOneWidget);
  });

  // ── WaitBody(진료대기) — CARD-WAIT ─────────────────────────────
  testWidgets('[CARD-WAIT-01] 대기 본문은 내 앞 인원 + 예상 대기시간을 함께 보인다', (t) async {
    await t.pumpWidget(
        wrap(const WaitBody(queue: QueueStatus(patientsAhead: 3, estimatedWaitMinutes: 25))));
    expect(find.textContaining('내 앞에 3명'), findsOneWidget);
    expect(find.textContaining('예상 대기시간 약 25분'), findsOneWidget);
  });

  testWidgets('[CARD-WAIT-02] 마지막 문장은 요구사항 4.5 문장을 글자 그대로 쓴다', (t) async {
    await t.pumpWidget(
        wrap(const WaitBody(queue: QueueStatus(patientsAhead: 3, estimatedWaitMinutes: 25))));
    expect(find.text('예상 대기시간은 변동될 수 있습니다'), findsOneWidget); // 글자 그대로
  });

  testWidgets('[CARD-WAIT-09] 내 앞 인원 문구는 「내 앞에 N명」 형식이다(「내 앞 대기 인원:」 아님)', (t) async {
    await t.pumpWidget(
        wrap(const WaitBody(queue: QueueStatus(patientsAhead: 3, estimatedWaitMinutes: null))));
    expect(find.textContaining('내 앞에 3명'), findsOneWidget);
    expect(find.textContaining('내 앞 대기 인원'), findsNothing);
  });

  // ── UnconfBody(확정되지 않음) — CARD-UNCONF ─────────────────────
  testWidgets('[CARD-UNCONF-03] 확정되지 않음 배지를 단다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: unconfView())));
    expect(find.widgetWithText(StatusLabel, '확정되지 않음'), findsOneWidget);
  });

  testWidgets('[CARD-UNCONF-03b] 시간 지남이 아니라 확정되지 않음으로 부른다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: unconfView())));
    expect(find.textContaining('시간 지남'), findsNothing);
  });

  testWidgets('[CARD-UNCONF-04][CARD-UNCONF-04b] 원인 먼저 — 확인이 끝나지 않았음을 먼저, 할 일을 나중에', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: unconfView())));
    final cause = t.getTopLeft(find.text('병원 확인이 끝나지 않았습니다')).dy;
    final todo = t.getTopLeft(find.text('병원에 연락해 주세요')).dy;
    expect(cause < todo, isTrue); // 원인이 위, 할 일이 아래
  });

  testWidgets('[CARD-UNCONF-05] 가운데는 안내 문구 + QR 없음', (t) async {
    await t.pumpWidget(wrap(const UnconfBody()));
    expect(find.textContaining('아직 확정되지 않아 접수용 QR이 없습니다'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);
  });

  testWidgets('[CARD-UNCONF-06] 버튼은 상담 채팅 연결 · 병원 전화', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: unconfView())));
    expect(find.widgetWithText(ActionButton, '상담 채팅 연결'), findsOneWidget);
    expect(find.widgetWithText(ActionButton, '병원 전화'), findsOneWidget);
  });

  testWidgets('[CARD-UNCONF-06b] 다시 예약하기 버튼을 두지 않는다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: unconfView())));
    expect(find.textContaining('다시 예약'), findsNothing); // 중복 예약 방지
  });

  testWidgets('[CARD-UNCONF-07] 문진 줄이 사라진다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: unconfView(hasQuestionnaire: true))));
    expect(find.textContaining('사전문진'), findsNothing);
  });

  testWidgets('[CARD-UNCONF-08] 번호는 신청번호로 부른다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: unconfView(code: 'A-2413'))));
    expect(find.textContaining('신청번호'), findsOneWidget);
  });

  testWidgets('[CARD-UNCONF-09] 금지 문구 — 안 오셨습니다·예약 부도·오늘 안에를 쓰지 않는다', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: unconfView())));
    for (final banned in ['안 오셨습니다', '예약 부도', '오늘 안에']) {
      expect(find.textContaining(banned), findsNothing);
    }
  });

  testWidgets('[CARD-UNCONF-09b] 사과 문장을 앱이 쓰지 않는다(사과는 병원 몫)', (t) async {
    await t.pumpWidget(wrap(AppointmentCard(view: unconfView())));
    expect(find.textContaining('죄송'), findsNothing);
  });

  testWidgets('[CARD-UNCONF-11] 확정되지 않음은 끝난 카드가 아니다(살아 있는 카드)', (t) async {
    // isFinishedCard는 진료완료·취소됨만 true(CARD-LIFE, T17 소유) — A에서 unconf가 false임을 못박는다.
    expect(isFinishedCard(AppointmentCardState.unconf), isFalse);
  });
}
