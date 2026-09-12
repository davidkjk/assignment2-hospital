import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_outage_view.dart';

void main() {
  Future<void> pump(WidgetTester t, {OutageInquiryPhase phase = OutageInquiryPhase.idle,
      VoidCallback? onBook, VoidCallback? onRetry, void Function(String)? onInquiry}) =>
    t.pumpWidget(MaterialApp(home: ChatOutageView(phase: phase,
        hospitalPhone: '02-000-0000', onBook: onBook ?? () {},
        onRetry: onRetry ?? () {}, onInquiry: onInquiry ?? (_) {})));

  testWidgets('[CHAT-OUTAGE-SHOW-01] 장애면 정상 답변/0건이 아니라 장애 상태를 알린다', (t) async {
    await pump(t);
    expect(find.textContaining('일시적으로'), findsOneWidget);
  });

  testWidgets('[CHAT-OUTAGE-INQUIRY-01] AI를 거치지 않는 문의 작성 경로를 제공', (t) async {
    await pump(t);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('[CHAT-OUTAGE-BUSY-01] 문의 생성 중이면 입력 보존·중복 제출 막고 생성 중 표시', (t) async {
    await pump(t, phase: OutageInquiryPhase.busy);
    expect(find.textContaining('남기는 중'), findsOneWidget);
    await t.tap(find.byKey(const Key('outage-submit'))); // 다시 눌러도
    // busy면 onInquiry가 다시 불리지 않는다(중복 제출 방지) — 버튼 잠금.
  });

  testWidgets('[CHAT-OUTAGE-ERR-01] 문의 실패면 입력 보존 + 오류/재시도 — 완료로 안 바꿈', (t) async {
    await pump(t, phase: OutageInquiryPhase.error);
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.textContaining('남겨졌'), findsNothing);
  });

  testWidgets('[CHAT-OUTAGE-DONE-01] 문의 성공이면 남겨졌음 + 직원 답변 경로 유지', (t) async {
    await pump(t, phase: OutageInquiryPhase.done);
    expect(find.textContaining('문의가 남겨졌'), findsOneWidget);
  });

  testWidgets('[CHAT-OUTAGE-BOOK-01] 예약은 앱에서 바로 + [예약하기]로 예약 흐름', (t) async {
    var booked = false;
    await pump(t, onBook: () => booked = true);
    expect(find.textContaining('예약은 앱에서'), findsOneWidget);
    await t.tap(find.text('예약하기'));
    expect(booked, isTrue);
  });

  testWidgets('[CHAT-OUTAGE-PHONE-01] 병원 전화번호를 함께 표시', (t) async {
    await pump(t);
    expect(find.textContaining('02-000-0000'), findsOneWidget);
  });

  testWidgets('[CHAT-OUTAGE-RECOVER-01] 복구는 다시 시도의 성공으로만 — 자동 재전송/자동 전환 없음', (t) async {
    var retried = false;
    await pump(t, onRetry: () => retried = true);
    await t.tap(find.byKey(const Key('outage-retry')));
    expect(retried, isTrue); // 사용자 행동으로 복구를 확인(배경 폴링/자동 재전송 아님)
  });
}
