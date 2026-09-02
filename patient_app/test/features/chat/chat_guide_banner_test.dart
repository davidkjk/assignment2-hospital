import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_guide_banner.dart';

void main() {
  testWidgets('[CHAT-GUIDE-SHOW-01] 진료과 선택 도움 중이면 진행 배너를 고정 표시', (t) async {
    await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: ChatGuideBanner(active: true))));
    expect(find.textContaining('진료과 선택 도움'), findsOneWidget);
  });

  testWidgets('[CHAT-GUIDE-SAFE-01] 배너 표시 중엔 진단이 아니라 진료과 안내·최종선택 환자 문구', (t) async {
    await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: ChatGuideBanner(active: true))));
    expect(find.textContaining('진단'), findsWidgets); // 진단이 아님
    expect(find.textContaining('최종'), findsOneWidget); // 최종 선택은 환자
  });

  testWidgets('[CHAT-GUIDE-HIDE-01] 진료과 추천 갈래가 아니면 배너를 표시하지 않는다', (t) async {
    await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: ChatGuideBanner(active: false))));
    expect(find.textContaining('진료과 선택 도움'), findsNothing);
  });

  testWidgets('[CHAT-GUIDE-URGENT-01] 긴급 감지 시 추천을 중단하고 onUrgent를 부른다(전환 본체=T11)',
      (t) async {
    var urgent = false;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ChatGuideBanner(
                active: true,
                urgentDetected: true,
                onUrgent: () => urgent = true))));
    await t.pump();
    expect(urgent, isTrue); // CHAT-URGENT로 넘기는 훅
    expect(find.textContaining('진료과 선택 도움'), findsNothing); // 추천 흐름 중단
  });
}
