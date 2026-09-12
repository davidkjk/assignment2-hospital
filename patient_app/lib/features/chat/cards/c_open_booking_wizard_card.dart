import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/tokens.dart';
import '../../booking/catalog_repository.dart';
import 'chat_card_frame.dart';

/// open_booking_wizard — 앱 AI 상담에서 예약 의도가 나오면 대화 안에서 예약하지 않고 앱의
/// 예약 마법사로 인계한다(결정 B, 2026-09-07). 봇이 "예약하러 가시겠어요?"를 묻고, 이 카드의
/// [예약하러 가기]가 마법사(/booking)를 연다. 추천 진료과가 있으면 GoRouter extra로 넘겨
/// 대상 선택 뒤 그 과가 자동 적용된다(who_step). 웹(anonymous_web)은 대화 내 예약을 유지하므로
/// 이 카드는 앱(owner_type=patient) 전용 — 백엔드가 채널을 보고 이 카드만 앱에 보낸다.
class COpenBookingWizardCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  const COpenBookingWizardCard({super.key, required this.payload});

  @override
  Widget build(BuildContext context) {
    final id = payload['department_id'] as String?;
    final name = payload['department_name'] as String?;
    final dept = (id != null && name != null) ? Department(id, name) : null;
    return ChatCardFrame(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (dept != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text('추천 진료과 · ${dept.name}',
                style: const TextStyle(
                    color: AppTokens.primary, fontWeight: FontWeight.w700, fontSize: 14)),
          ),
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            dept != null
                ? '예약하기 화면에서 이어서 도와드릴게요. 진료과는 미리 골라 둘게요.'
                : '예약하기 화면에서 도와드릴게요.',
            style: const TextStyle(fontSize: 13, color: AppTokens.onSurface, height: 1.4),
          ),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
              backgroundColor: AppTokens.primary, foregroundColor: Colors.white),
          // 마법사로 인계(과가 있으면 extra로 프리필). push라 마법사 위에 얹혀 채팅이 뒤에 남는다.
          onPressed: () => context.push('/booking', extra: dept),
          child: const Text('예약하러 가기'),
        ),
      ]),
    );
  }
}
