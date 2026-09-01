import 'package:flutter/material.dart';
import '../../../core/tokens.dart';

/// 대화 내내 고정되는 안전 표시(CHAT-ROOM-SAFE-01). 진단·처방·확정 표현을 쓰지 않는
/// 도우미임을 계속 식별 가능하게 한다.
class ChatSafetyBanner extends StatelessWidget {
  const ChatSafetyBanner({super.key});
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        color: AppTokens.muted,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        child: const Row(children: [
          Icon(Icons.info_outline, size: 15, color: AppTokens.grayPending),
          SizedBox(width: 6),
          Expanded(
            child: Text('진단이 아니라 알맞은 진료과와 병원 이용을 안내합니다',
                style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
          ),
        ]),
      );
}
