import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/phone_cooldown.dart';
import '../auth/otp_screen.dart';
import 'family_add_repository.dart';
import 'family_repository.dart';

/// FAM-LINK(인증) — ㉯ 인증번호 화면. ⭐ 화면을 새로 만들지 않는다 — T13 [OtpScreen]이 6칸·5분
/// 카운트·30초 재발송·마스킹(AUTH-OTP-06)·막다른 길 링크(AUTH-OTP-11)를 이미 담고 있다. 여기서는
/// 콜백 3개를 꽂는 얇은 페이지만 만든다(재소유 금지). 「대상이 있나」는 앱이 판정하지 않는다 — 화면이
/// 가진 것은 request_id뿐이고, 그것이 열거 방지의 실체다(FAM-LINK-11·12·18·19·20).
///
/// ⚠️ draft는 `ref.watch`가 아니라 `ref.read`로 본다 — onSuccess가 draft를 비울 때 이 화면이
/// 재빌드되어 「진행 정보 없음」 대체 화면으로 튕기는 것을 막는다. 재발송으로 갱신된 request_id는
/// onVerify가 호출 시점에 다시 read해 최신값을 쓴다.
class FamilyLinkOtpPage extends ConsumerWidget {
  const FamilyLinkOtpPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.read(linkDraftProvider);
    if (draft == null) return const _NoDraftFallback(); // 딥링크로 바로 들어온 경우 입력 화면으로

    final repo = ref.read(familyAddRepoProvider);
    return OtpScreen(
      phone: draft.phone,
      purpose: OtpPurpose.familyLink, // AUTH-OTP-06 마스킹 · AUTH-OTP-11 링크
      cooldown: ref.read(phoneCooldownStoreProvider),
      onResend: () async {
        final cur = ref.read(linkDraftProvider);
        if (cur == null) return;
        try {
          final rid = await repo.requestLink(
            name: cur.name,
            birthDate: cur.birthDate,
            phone: cur.phone,
            relation: cur.relation,
          );
          ref.read(linkDraftProvider.notifier).state = cur.copyWith(requestId: rid);
        } on ApiException catch (e) {
          // 서버가 아직 30초 안이라 429를 주면 그 남은 초로 쿨다운을 맞춘다(CooldownButton이 그린다).
          if (e.statusCode == 429 && e.retryAfterSeconds != null) {
            await ref
                .read(phoneCooldownStoreProvider)
                .syncFromServer(cur.phone, e.retryAfterSeconds!, DateTime.now());
          }
          // 재발송 실패는 버튼을 막다른 길로 만들지 않는다 — 쿨다운이 열리면 다시 누를 수 있다.
        }
      },
      onVerify: (code) async {
        final cur = ref.read(linkDraftProvider);
        if (cur == null) return '연결 정보가 없습니다. 처음부터 다시 시도해 주세요.';
        try {
          await repo.confirmLink(requestId: cur.requestId, code: code);
          return null; // 성공
        } on ApiException catch (e) {
          return e.message; // AUTH-OTP-09 — 서버 문장 그대로
        }
      },
      onSuccess: () {
        ref.invalidate(familyListProvider); // FAM-LINK-21 — 새 카드가 목록에 있다
        context.go('/family'); // NAV-FAM-11 — 먼저 이 화면을 떠난 뒤(아래에서 draft를 비운다)
        // draft를 비워 다음 추가가 옛 값을 물려받지 않게 한다. read로 봤으므로 이 변경은 이 화면을
        // 재빌드하지 않는다(이미 /family로 떠났다).
        ref.read(linkDraftProvider.notifier).state = null;
      },
    );
  }
}

/// 진행 중이던 연결 정보 없이 인증 화면에 바로 들어온 경우(딥링크·앱 재시작). 입력 화면으로 돌려보낸다.
class _NoDraftFallback extends StatefulWidget {
  const _NoDraftFallback();
  @override
  State<_NoDraftFallback> createState() => _NoDraftFallbackState();
}

class _NoDraftFallbackState extends State<_NoDraftFallback> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.go('/family/add/link');
    });
  }

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
