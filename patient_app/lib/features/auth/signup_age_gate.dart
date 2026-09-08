import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/button_sizes.dart';
import '../../core/tokens.dart';
import '../../widgets/patient_app_bar.dart';
import '../home/home_data.dart' show hospitalInfoProvider;
import '../settings/hospital_info_repository.dart';

/// 자기 신고 연령대(생년월일 전, AGE-GATE-01). 정확한 만 나이는 ③에서 생년월일로 서버가 다시 계산한다.
enum AgeBand { over14, under14 }

/// [AGE-GATE-01] 가입 입구의 연령 확인 — ⓪동의 앞에 둔다. 만 14세 미만이면 앱 가입을 막고
/// 병원 안내로 보낸다(개인정보보호법 22조의2: 만 14세 미만은 법정대리인 동의 필요).
/// 4단계 진행 밴드에는 세지 않는다(게이트이지 단계가 아니다 — AUTH-SIGNUP-03/04 4단계 유지).
class AgeGateScreen extends StatefulWidget {
  const AgeGateScreen({super.key});

  @override
  State<AgeGateScreen> createState() => _AgeGateScreenState();
}

class _AgeGateScreenState extends State<AgeGateScreen> {
  AgeBand? _band;

  void _next() {
    // [AGE-GATE-02] 미만이면 차단 안내로, 이상이면 ⓪동의로. 둘 다 push라 뒤로가기로 다시 고를 수 있다.
    if (_band == AgeBand.under14) {
      context.push('/signup/blocked');
    } else {
      context.push('/signup');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const PatientAppBar(title: '회원가입'),
      body: Column(children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('만 나이를 확인할게요',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('만 14세 미만은 보호자(법정대리인) 동의가 필요해 앱에서 바로 가입할 수 없어요.',
                  style: TextStyle(color: AppTokens.grayPending, fontSize: 14, height: 1.5)),
              const SizedBox(height: 20),
              _AgeOption(
                label: '만 14세 이상',
                selected: _band == AgeBand.over14,
                onTap: () => setState(() => _band = AgeBand.over14),
              ),
              const SizedBox(height: 12),
              _AgeOption(
                label: '만 14세 미만',
                selected: _band == AgeBand.under14,
                onTap: () => setState(() => _band = AgeBand.under14),
              ),
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: FilledButton(
            style: AppButtonSize.cta,
            // [AGE-GATE-03] 하나를 골라야 살아난다(BTN-STATE-01) — 조용히 기본값을 만들지 않는다.
            onPressed: _band == null ? null : _next,
            child: const Text('다음'),
          ),
        ),
      ]),
    );
  }
}

/// 연령대 한 칸 — 라디오 + 라벨. 동의 화면(_RequiredAllCard)과 같은 테두리 카드 계열.
class _AgeOption extends StatelessWidget {
  const _AgeOption({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          // 선택 시 딥틸 틴트+테두리(앱 GenderOption과 같은 단일 선택 표현).
          color: selected ? AppTokens.primary.withValues(alpha: 0.10) : AppTokens.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: selected ? AppTokens.primary : AppTokens.border,
              width: selected ? 1.5 : 1),
        ),
        child: Row(children: [
          // 선택 표시 원(라디오 대체 — deprecated Radio API 회피).
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                  color: selected ? AppTokens.primary : AppTokens.border, width: 2),
            ),
            child: selected
                ? Center(
                    child: Container(
                        width: 10,
                        height: 10,
                        decoration: const BoxDecoration(
                            shape: BoxShape.circle, color: AppTokens.primary)))
                : null,
          ),
          const SizedBox(width: 12),
          Text(label,
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: selected ? AppTokens.primary : AppTokens.onSurface)),
        ]),
      ),
    );
  }
}

/// [AGE-GATE-04] 만 14세 미만 차단 안내 — 막다른 길이 아니다. 병원 전화(해결 경로)와 「이전으로」를 함께 준다.
/// 전화번호는 하드코딩하지 않고 공개 병원정보 API에서(CONSENT-BTN-04와 같은 장치).
class BlockedMinorScreen extends ConsumerWidget {
  const BlockedMinorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final phone = ref.watch(hospitalInfoProvider).valueOrNull?.phone ?? '';
    return Scaffold(
      appBar: const PatientAppBar(title: '회원가입'),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(24, 32, 24, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('만 14세 미만은 앱에서 바로\n가입할 수 없어요',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, height: 1.4)),
            const SizedBox(height: 12),
            const Text(
              '개인정보보호법에 따라 만 14세 미만은 보호자(법정대리인) 동의가 필요합니다. '
              '보호자와 함께 병원으로 등록해 주세요.',
              style: TextStyle(color: AppTokens.grayPending, fontSize: 14, height: 1.6),
            ),
            const Spacer(),
            FilledButton.icon(
              key: const Key('blocked-call-button'),
              style: AppButtonSize.cta,
              onPressed: phone.isEmpty ? null : () => _call(ref, phone),
              icon: const Icon(Icons.phone),
              label: Text(phone.isEmpty ? '병원에 전화하기' : '병원에 전화하기   $phone',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              style: AppButtonSize.cta,
              onPressed: () => context.pop(),
              child: const Text('이전으로'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _call(WidgetRef ref, String phone) async {
    final digits = phone.replaceAll(RegExp(r'[^0-9]'), '');
    await ref.read(linkLauncherProvider).open(Uri.parse('tel:$digits'));
  }
}
