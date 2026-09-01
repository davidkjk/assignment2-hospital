import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/tokens.dart';

const _hospitalTel = '02-000-0000'; // 배포 시 병원 정보로 치환

const _checkSteps = ['이름·생년월일', '최근 방문일·진료받은 과', '새 번호로 인증번호 발송'];

/// 전화번호가 바뀐 사람에게 경로만 안내한다(AUTH-TEL-01) — 앱에서 번호를 바꾸지 않는다.
class PhoneChangeScreen extends StatelessWidget {
  const PhoneChangeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('전화번호 변경 안내')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 20, 20, 16), children: [
        const Row(children: [
          Icon(Icons.verified_user_outlined, size: 20, color: AppTokens.primary),
          SizedBox(width: 8),
          Expanded(
            child: Text('안전한 계정 보호를 위해 병원에서 확인합니다',
                style: TextStyle(
                    color: AppTokens.primary, fontSize: 14, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: 20),
        // AUTH-TEL-02·05: 방문·전화 둘 다 + 이력 유지.
        const Text('병원에 방문하시거나 전화해 주세요',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        const Text(
            '본인 확인 후 직원이 등록된 전화번호를 바꿔드립니다. 그동안의 예약과 방문 이력은 그대로 유지됩니다.',
            style: TextStyle(color: AppTokens.grayPending, fontSize: 14, height: 1.6)),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTokens.muted,
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Text(
              '앱에서는 전화번호를 직접 바꾸지 않고, 병원에서 본인 확인을 거친 뒤 변경합니다.',
              style: TextStyle(fontSize: 14, height: 1.6)),
        ),
        const SizedBox(height: 28),
        // AUTH-TEL-03: 확인 절차 세 줄을 미리 안내한다.
        const Text('확인 절차', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        for (var i = 0; i < _checkSteps.length; i++) ...[
          _StepRow(number: i + 1, text: _checkSteps[i]),
          if (i < _checkSteps.length - 1) const SizedBox(height: 10),
        ],
        const SizedBox(height: 28),
        FilledButton.icon(
          icon: const Icon(Icons.call, size: 18),
          // AUTH-TEL-04: 전화 앱으로 연결.
          onPressed: () => launchUrl(Uri.parse('tel:$_hospitalTel')),
          label: const Text('병원 전화번호로 문의'),
        ),
        const SizedBox(height: 12),
        const Text('방문이 어려우시면 전화로 문의하셔도 됩니다.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppTokens.grayPending, fontSize: 12)),
      ]),
    );
  }
}

/// 확인 절차 한 줄 — 딥틸 번호 원 + 설명(테두리 카드).
class _StepRow extends StatelessWidget {
  const _StepRow({required this.number, required this.text});
  final int number;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: AppTokens.surface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTokens.cardElevation,
      ),
      child: Row(children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: AppTokens.primary, shape: BoxShape.circle),
          child: Text('$number',
              style: const TextStyle(
                  color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
        ),
        const SizedBox(width: 12),
        Expanded(
            child: Text(text,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}
