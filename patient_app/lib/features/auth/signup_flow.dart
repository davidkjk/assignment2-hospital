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

class SignupProgress extends StatelessWidget {
  final int step; // 1~4
  const SignupProgress({super.key, required this.step});

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(
            4,
            (i) => Container(
                  // 형제 간 키는 고유해야 한다(중복 키 금지). 그룹은 'signup-dot-' 접두어로 센다.
                  key: ValueKey('signup-dot-$i'),
                  width: 8,
                  height: 8,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i < step ? AppTokens.primary : AppTokens.grayDone,
                  ),
                )),
      ),
      const SizedBox(height: 4),
      Text('$step단계 / 4단계',
          style: const TextStyle(fontSize: 12, color: AppTokens.grayPending)),
    ]);
  }
}
