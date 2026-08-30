import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/tokens.dart';

const _hospitalTel = '02-000-0000'; // 배포 시 병원 정보로 치환

/// 전화번호가 바뀐 사람에게 경로만 안내한다(AUTH-TEL-01) — 앱에서 번호를 바꾸지 않는다.
class PhoneChangeScreen extends StatelessWidget {
  const PhoneChangeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('전화번호 변경')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // AUTH-TEL-02·05: 방문·전화 둘 다 + 이력 유지.
        const Text('병원에 방문하시거나 전화해 주세요'),
        const SizedBox(height: 8),
        const Text('본인 확인 후 직원이 등록된 전화번호를 바꿔드립니다. '
            '그동안의 예약과 방문 이력은 그대로 유지됩니다.'),
        const SizedBox(height: 24),
        // AUTH-TEL-03: 확인 절차 세 줄을 미리 안내한다.
        const Text('확인 절차', style: TextStyle(fontWeight: FontWeight.bold)),
        const Text('· 이름 · 생년월일'),
        const Text('· 최근 방문일 · 진료받은 과'),
        const Text('· 새 번호로 인증번호 발송'),
        const SizedBox(height: 24),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
          icon: const Icon(Icons.call),
          // AUTH-TEL-04: 전화 앱으로 연결.
          onPressed: () => launchUrl(Uri.parse('tel:$_hospitalTel')),
          label: const Text('병원 전화번호로 문의'),
        ),
      ]),
    );
  }
}
