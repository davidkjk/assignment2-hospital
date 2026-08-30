import 'package:flutter/material.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import 'auth_repo.dart';

/// AUTH-DUP-02 — 인증 후에만 뜨는 갈림길. 문자 인증만으로 홈에 들여보내지 않는다(AUTH-DUP-05).
class DuplicateAccountScreen extends StatelessWidget {
  const DuplicateAccountScreen({
    super.key,
    required this.phone,
    required this.repo,
    required this.onLogin, // 세션 폐기 후 로그인(번호 채워진 채)
    required this.onChangePassword, // 새 비밀번호 화면(세션 유지)
    required this.onRecentlyReceived, // 번호 변경 안내
  });
  final String phone;
  final AuthRepo repo;
  final VoidCallback onLogin;
  final VoidCallback onChangePassword;
  final VoidCallback onRecentlyReceived;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('회원가입')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('이미 가입하신 번호입니다',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 24),
        // AUTH-DUP-03·04: 주 버튼. 문자 인증으로 생긴 세션을 버리고(signOut) 로그인으로 — 비밀번호를 치게 한다.
        ActionButton(
            label: '로그인하러 가기',
            busyLabel: '로그인 화면으로 이동 중…',
            onPressed: () async {
              await repo.signOut();
              onLogin();
            }),
        const SizedBox(height: 24),
        const Text('비밀번호를 잊으셨나요?'),
        const SizedBox(height: 8),
        // AUTH-DUP-09·16: 없애지 않는다 — 비밀번호를 잊은 진짜 환자가 훨씬 많다. 세션은 유지(서버 재설정에 필요).
        OutlinedButton(onPressed: onChangePassword, child: const Text('비밀번호 바꾸기')),
        const SizedBox(height: 24),
        // AUTH-DUP-14: 셋째 줄 — 앱은 아무것도 판정하지 않고 병원 안내로 보낸다.
        TextButton(
          onPressed: onRecentlyReceived,
          child: const Text('이 번호를 최근에 새로 받으셨나요? ›',
              style: TextStyle(color: AppTokens.grayPending)),
        ),
      ]),
    );
  }
}
