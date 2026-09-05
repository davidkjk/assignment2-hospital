import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart'; // AppTheme.brandFontFamily(워드마크 서체)
import '../../core/button_sizes.dart';
import '../../core/tokens.dart';
import '../../widgets/hospital_logo.dart';

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
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(flex: 3),
              // 로고 = 직원웹 사이드바·앱 홈과 같은 병원 심볼(딥틸 타일 위 흰 아이콘, 데모 정본).
              Center(
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppTokens.primary,
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: const [
                      BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 3)),
                    ],
                  ),
                  child: const HospitalLogo(size: 36, color: Colors.white), // 데모 h-9
                ),
              ),
              const SizedBox(height: 12), // 데모 gap-3(균일 12)
              // AUTH-LAND-02: 병원 이름 + 한 줄 소개(탭 전환형·가입 우선형 아님).
              const Text(hospitalName,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 28,
                      fontFamily: AppTheme.brandFontFamily, // 데모 .brand-wordmark(Do Hyeon)
                      fontWeight: FontWeight.w400, // 단일 가중치 디스플레이 서체
                      letterSpacing: 0.3,
                      color: AppTokens.primary)),
              const SizedBox(height: 12), // 데모 gap-3(균일 12)
              const Text('진료 예약과 방문 이력을 한 곳에서',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTokens.grayPending, fontSize: 14)),
              const Spacer(flex: 4),
              FilledButton(
                style: AppButtonSize.cta, // 데모 Login.tsx: size=lg h-12 text-base
                onPressed: () => context.go('/login'), // 주 버튼
                child: const Text('로그인'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                style: AppButtonSize.cta,
                onPressed: () => context.go('/signup'), // 보조 버튼
                child: const Text('회원가입'),
              ),
              const SizedBox(height: 8),
              // AUTH-LAND-03: 비밀번호를 모르는 사람이 로그인 화면까지 들어가야 보이면 한 번 더 막힌다.
              TextButton(
                onPressed: () => context.go('/password-find'),
                child: const Text('비밀번호를 잊으셨나요?'),
              ),
              const Spacer(flex: 1),
            ],
          ),
        ),
      ),
    );
  }
}
