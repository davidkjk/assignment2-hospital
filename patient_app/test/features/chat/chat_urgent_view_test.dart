import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_urgent_view.dart';

void main() {
  testWidgets('[CHAT-URGENT-STOP-01] 긴급 감지 시 일반 진료과 추천/예약 대화를 중단', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView()));
    expect(find.textContaining('진료과 선택 도움'), findsNothing); // 추천 흐름 중단
  });

  testWidgets('[CHAT-URGENT-GUIDE-01] 119 또는 응급실 이용을 우선 안내', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView()));
    expect(find.textContaining('119'), findsOneWidget);
    expect(find.textContaining('응급실'), findsOneWidget);
  });

  testWidgets('[CHAT-URGENT-NOCTA-01] 시간선택·예약확인·일반 [예약하기] CTA를 노출하지 않는다', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView()));
    expect(find.text('예약하기'), findsNothing);
    expect(find.text('시간 선택'), findsNothing);
  });

  testWidgets('[CHAT-URGENT-NOGUAR-01] 긴급 여부 완벽 판단·보장/진단·치료 추천 표현 금지', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView()));
    expect(find.textContaining('보장'), findsNothing);
    expect(find.textContaining('진단'), findsNothing);
  });

  testWidgets('[CHAT-URGENT-EXC-01] 분류 실패면 제목은 `안내`(긴급 안내 아님) + 확정 안전 문구', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView(unknown: true)));
    expect(find.text('안내'), findsOneWidget);              // 제목 '긴급 안내' 아님
    expect(find.textContaining('긴급 여부를 확인하지 못했습니다'), findsOneWidget);
    expect(find.textContaining('119'), findsOneWidget);    // 해결 경로 함께
  });
}
