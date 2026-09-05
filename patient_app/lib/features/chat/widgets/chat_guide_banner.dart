import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import '../../../core/tokens.dart';

/// 진료과 추천(문진 체인) 진행 배너(CHAT-GUIDE-*). 추천 중임을 고정 표시하고(SHOW),
/// 진단이 아니라 가능한 진료과 안내이며 최종 선택은 환자임을 함께 붙인다(SAFE).
/// 추천 갈래가 아니면 숨기고(HIDE), 긴급이 감지되면 흐름을 중단하고 onUrgent로 넘긴다(URGENT).
/// 실제 CHAT-URGENT 화면 전환은 T11이 onUrgent에 주입한다.
class ChatGuideBanner extends StatelessWidget {
  final bool active;
  final bool urgentDetected;
  final VoidCallback? onUrgent;
  const ChatGuideBanner(
      {super.key, required this.active, this.urgentDetected = false, this.onUrgent});

  @override
  Widget build(BuildContext context) {
    if (urgentDetected) {
      WidgetsBinding.instance.addPostFrameCallback((_) => onUrgent?.call());
      return const SizedBox.shrink(); // 추천·예약 흐름 중단
    }
    if (!active) return const SizedBox.shrink(); // CHAT-GUIDE-HIDE-01
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTokens.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTokens.primary.withValues(alpha: 0.4)),
      ),
      child: const Row(children: [
        Icon(AppIcons.explore_outlined, size: 18, color: AppTokens.primary),
        SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('진료과 선택 도움 진행 중',
                  style: TextStyle(fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
              SizedBox(height: 2),
              Text('진단이 아니라 가능한 진료과를 안내하며 최종 선택은 환자가 확인합니다',
                  style: TextStyle(fontSize: 11, color: AppTokens.grayPending)),
            ],
          ),
        ),
      ]),
    );
  }
}
