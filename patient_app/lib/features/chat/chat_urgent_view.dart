import 'package:flutter/material.dart';
import '../../core/tokens.dart';

/// 긴급 안내 상태(CHAT-URGENT-*). 일반 추천/예약 중단(STOP)·119/응급실 우선(GUIDE)·
/// 예약 CTA 없음(NOCTA)·보장/진단 표현 금지(NOGUAR). 분류 실패(unknown)는 제목을 `안내`로만
/// 두고(환자를 긴급으로 단정하지 않음) 확정 문구로 119·응급실 경로를 준다(EXC, 역대조 결정 1 B안).
class ChatUrgentView extends StatelessWidget {
  final bool unknown;
  const ChatUrgentView({super.key, this.unknown = false});

  @override
  Widget build(BuildContext context) {
    final body = unknown
        ? '상담봇이 긴급 여부를 확인하지 못했습니다. 온라인 상담이나 예약을 계속하지 말고, '
            '119에 연락하거나 가까운 응급실을 이용하세요.'
        : '증상이 위급할 수 있습니다. 먼저 119에 연락하거나 가까운 응급실을 이용하세요.';
    return Scaffold(
      backgroundColor: AppTokens.background,
      appBar: AppBar(title: const Text('안내')), // 긴급 단정 아님 — 제목은 '안내'
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTokens.offlineBannerBg, // 전면 상태 배너 한정 옅은 주황(OFF-BAN-02 톤)
              borderRadius: BorderRadius.circular(10),
              border: const Border(
                  left: BorderSide(color: AppTokens.warn, width: AppTokens.warnBarWidth)),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.emergency_outlined, color: AppTokens.warn, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text(body,
                    style: const TextStyle(
                        fontSize: AppTokens.bodyFontSize,
                        height: 1.5,
                        color: AppTokens.onSurface)),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
