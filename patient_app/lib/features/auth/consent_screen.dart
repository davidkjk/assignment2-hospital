import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/tokens.dart';

/// 4줄 동의의 로컬 상태(CONSENT-STEP-03: 세션 없이 화면이 들고 있다). 화면 밖 provider라
/// 뒤로 갔다 와도 남는다(CONSENT-STEP-08). 프로필 생성 때 서버로 함께 보낸다(consent_service).
class ConsentState {
  final bool terms, privacy, sensitive, ads;
  const ConsentState(
      {this.terms = false, this.privacy = false, this.sensitive = false, this.ads = false});

  ConsentState copyWith({bool? terms, bool? privacy, bool? sensitive, bool? ads}) => ConsentState(
        terms: terms ?? this.terms,
        privacy: privacy ?? this.privacy,
        sensitive: sensitive ?? this.sensitive,
        ads: ads ?? this.ads,
      );

  bool get requiredAllOn => terms && privacy && sensitive; // CONSENT-ALL-04: 파생값이라 어긋나지 않는다
  int get requiredRemaining => (terms ? 0 : 1) + (privacy ? 0 : 1) + (sensitive ? 0 : 1);
}

class ConsentNotifier extends StateNotifier<ConsentState> {
  ConsentNotifier() : super(const ConsentState());

  void toggle(String item) {
    switch (item) {
      case 'terms':
        state = state.copyWith(terms: !state.terms);
      case 'privacy':
        state = state.copyWith(privacy: !state.privacy);
      case 'sensitive':
        state = state.copyWith(sensitive: !state.sensitive);
      case 'ads':
        state = state.copyWith(ads: !state.ads);
    }
  }

  /// CONSENT-ALL-01 — 맨 위 줄은 필수 3개만 켜고 끈다. [선택] 광고는 건드리지 않는다.
  void toggleRequiredAll() {
    final on = !state.requiredAllOn;
    state = state.copyWith(terms: on, privacy: on, sensitive: on);
  }
}

final consentProvider =
    StateNotifierProvider<ConsentNotifier, ConsentState>((_) => ConsentNotifier());

class ConsentScreen extends ConsumerWidget {
  const ConsentScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(consentProvider);
    final n = ref.read(consentProvider.notifier);
    return Scaffold(
      appBar: AppBar(title: const Text('약관 동의')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // CONSENT-ALL-03: 이름에 무엇이 켜지는지 적는다(전체 동의 아님).
          CheckboxListTile(
            title: const Text('필수 항목에 모두 동의', style: TextStyle(fontWeight: FontWeight.bold)),
            value: s.requiredAllOn,
            onChanged: (_) => n.toggleRequiredAll(),
          ),
          const Divider(),
          _row(context, '[필수]', '서비스 이용약관', null, s.terms, () => n.toggle('terms')),
          _row(context, '[필수]', '개인정보 수집·이용', '이름 · 생년월일 · 성별 · 전화번호', s.privacy,
              () => n.toggle('privacy')),
          _row(context, '[필수]', '민감정보(건강정보) 처리', '문진 답변 · 진료기록 · 처방', s.sensitive,
              () => n.toggle('sensitive')),
          // CONSENT-ITEM-04: 정보성과 광고성이 다르다는 것을 밝히는 유일한 자리.
          _row(context, '[선택]', '광고성 정보 수신', '검진·행사 안내 · 안 받아도 예약 알림은 그대로 옵니다',
              s.ads, () => n.toggle('ads')),
          const SizedBox(height: 24),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
            // CONSENT-BTN-01: 필수 셋이 켜져야 살아난다 → ① 전화번호로.
            onPressed: s.requiredAllOn ? () => context.go('/signup/phone') : null,
            child: const Text('다음'),
          ),
          // CONSENT-BTN-02·03: 왜 안 눌리는지 모르는 버튼을 만들지 않는다 — 남은 개수를 센다.
          if (!s.requiredAllOn)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('필수 항목 ${s.requiredRemaining}개가 남았습니다',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTokens.grayPending)),
            ),
          const SizedBox(height: 24),
          // CONSENT-BTN-04: 막다른 길 금지 — 동의를 안 하는 사람에게도 길을 준다.
          const Text('동의 없이 이용하려면 병원으로 전화 주세요 · 02-000-0000',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppTokens.grayPending, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String badge, String title, String? sub, bool value,
      VoidCallback onToggle) {
    return CheckboxListTile(
      value: value,
      onChanged: (_) => onToggle(),
      title: Text('$badge $title'),
      subtitle: sub == null ? null : Text(sub, style: const TextStyle(fontSize: 12)),
      secondary: IconButton(
        icon: const Icon(Icons.chevron_right), // CONSENT-ITEM-05: › → 본문(병원이 채운다)
        onPressed: () => showDialog(
          context: context,
          builder: (_) => const Dialog(
              child: Padding(padding: EdgeInsets.all(24), child: Text('약관 본문(준비 중)'))),
        ),
      ),
      controlAffinity: ListTileControlAffinity.leading,
    );
  }
}
