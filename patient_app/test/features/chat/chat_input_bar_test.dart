import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_input_bar.dart';

void _noop(String _) {}

void main() {
  testWidgets('[CHAT-ROOM-INPUT-01] 자유 입력창은 빠른답변이 있어도 항상 열려 있다', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ChatInputBar(
      onSend: (_) {},
      quickRepliesSlot: const Text('빠른답변1'), // 빠른답변이 있어도
    ))));
    expect(find.byType(TextField), findsOneWidget); // 입력창 존재
    final field = t.widget<TextField>(find.byType(TextField));
    expect(field.enabled, isNot(false)); // 비활성이 아니다
    expect(find.text('빠른답변1'), findsOneWidget); // 슬롯도 함께
  });

  testWidgets('[CHAT-ROOM-INPUT-01] 빠른답변 슬롯이 없어도 입력창은 열려 있다', (t) async {
    await t.pumpWidget(
        const MaterialApp(home: Scaffold(body: ChatInputBar(onSend: _noop))));
    expect(find.byType(TextField), findsOneWidget);
  });
}
