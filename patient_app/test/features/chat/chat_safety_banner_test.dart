import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_safety_banner.dart';

void main() {
  testWidgets('[CHAT-ROOM-SAFE-01] 진단이 아닌 진료과·병원 이용 안내임을 대화 중 계속 표시', (t) async {
    await t.pumpWidget(
        const MaterialApp(home: Scaffold(body: ChatSafetyBanner())));
    expect(find.textContaining('진단'), findsOneWidget); // 진단이 아님을 명시
    expect(find.textContaining('진료과'), findsOneWidget);
  });
}
