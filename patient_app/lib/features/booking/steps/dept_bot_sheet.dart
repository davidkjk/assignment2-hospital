import 'package:flutter/material.dart';

// BOOK-DEPT-02 / NAV-BOOK-06 — "어느 과인지 모르겠어요" 상담봇 시트.
// ⚠️ Task 19은 진입/닫힘 라우팅만 검증하는 자리표시. 시트 본문(BOOK-BOT-*)은 Task 20이 실체화한다.
class DeptBotSheet extends StatelessWidget {
  const DeptBotSheet({super.key});
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('증상을 말씀하시면 맞는 진료과를 안내해드립니다',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          // Task 20이 대화 UI + "○○과로 계속하기"(NAV-BOOK-07)를 채운다.
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('닫기'),
          ),
        ]),
      ),
    );
  }
}
