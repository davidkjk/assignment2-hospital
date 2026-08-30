import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/tokens.dart';

/// 로그인 전 첫 화면. 큰 버튼 2개만 두고 입력칸을 두지 않는다(AUTH-LAND-01) — 화면당 핵심 행동 1개.
class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  static const String hospitalName = '○○의원'; // 배포 시 병원 정보로 치환(get_public_hospital_info)

  @override
  Widget build(BuildContext context) {
    // AUTH-LAND-04: bottomNavigationBar를 두지 않는다(로그인 전에는 탭 5개를 그리지 않는다).
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // AUTH-LAND-02: 병원 이름 + 한 줄 소개(탭 전환형·가입 우선형 아님).
              const Text(hospitalName,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('진료 예약과 방문 이력을 한 곳에서',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTokens.grayPending)),
              const SizedBox(height: 48),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
                onPressed: () => context.go('/login'), // 주 버튼
                child: const Text('로그인'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => context.go('/signup'), // 보조 버튼
                child: const Text('회원가입'),
              ),
              const SizedBox(height: 16),
              // AUTH-LAND-03: 비밀번호를 모르는 사람이 로그인 화면까지 들어가야 보이면 한 번 더 막힌다.
              TextButton(
                onPressed: () => context.go('/password-find'),
                child: const Text('비밀번호를 잊으셨나요?'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
