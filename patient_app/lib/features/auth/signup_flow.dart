import 'package:flutter/material.dart';
import '../../core/tokens.dart';

/// 가입 4단계(AUTH-SIGNUP-01). ⓪동의=1 ①전화=2 ②인증=3 ③기본정보=4(AUTH-SIGNUP-03·04).
enum SignupStep {
  consent(1),
  phone(2),
  otp(3),
  profile(4);

  const SignupStep(this.number);
  final int number;
  String get display => '$number단계 / 4단계';
}

/// 데모 정본 진행 밴드(회원가입 헤더 아래 회색 띠): 굵은 알약 4개(채움=딥틸)+「N단계 / 4단계」.
/// 옛 작은 원형 점을 데모의 flex 막대로 바꿨다. 키('signup-dot-N')와 라벨 텍스트는 그대로 둔다.
class SignupProgress extends StatelessWidget {
  final int step; // 1~4
  const SignupProgress({super.key, required this.step});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTokens.muted,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: List.generate(
                4,
                (i) => Expanded(
                  child: Container(
                    // 형제 간 키는 고유해야 한다(중복 키 금지). 그룹은 'signup-dot-' 접두어로 센다.
                    key: ValueKey('signup-dot-$i'),
                    height: 8,
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      color: i < step ? AppTokens.primary : AppTokens.border,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text('$step단계 / 4단계',
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTokens.grayPending)),
        ],
      ),
    );
  }
}
