import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/tokens.dart';
import '../../core/button_sizes.dart';
import '../../widgets/action_button.dart';
import 'questionnaire_controller.dart';
import 'qnr_load_gate.dart';
import 'questionnaire_repository.dart';

/// 마지막 문항 다음의 확인 화면(NAV-QNR-03·13). 항목별 [고치기]는 그 문항으로(NAV-QNR-14,
/// ⭐ 1번부터 다시 훑지 않음), [제출하기]는 왔던 곳으로 돌아간다(NAV-QNR-15).
/// readOnly면 [고치기]·[제출하기]를 감춘다 — 읽기전용 값 렌더(미표시/미작성 구분)는 T24.
///
/// 시각 이식: 데모 QuestionnaireReview(Questionnaire.tsx L320~401)를 그대로 옮긴다 —
/// 카드 헤더 border-b + 상태 배지(bg-primary/10 pill) + 본문 pt-3 muted + 오른쪽 [고치기] ghost sm,
/// 제출은 카드 리스트 뒤 in-flow(mt-6 w-full). 배지 문구/미표시 판정은 규칙이 이긴다(아래 주석).
class ConfirmScreen extends ConsumerWidget {
  const ConfirmScreen(
      {super.key, required this.appointmentId, this.readOnly = false, required this.returnTo});
  final String appointmentId;
  final bool readOnly;
  final String returnTo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(questionnaireProvider(appointmentId));
    final gate = qnrLoadGate(ref, st, appointmentId); // 로드 실패=[다시 시도], 로딩=스피너
    if (gate != null) return gate;
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(readOnly ? '사전문진' : '사전문진 확인')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        // 상단 안내(데모 mb-6): 라벨 muted → 제목 → 설명 muted.
        Text(readOnly ? '작성한 내용' : '마지막 단계',
            style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
        const SizedBox(height: 8), // mb-2
        Text(readOnly ? '작성하신 사전문진입니다' : '작성한 내용을 확인해 주세요',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        if (!readOnly) ...[
          const SizedBox(height: 8), // mt-2
          Text('제출하기 전 답변을 확인할 수 있어요. 진료 시작 전까지 수정할 수 있습니다.',
              style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
        ],
        const SizedBox(height: 24), // mb-6

        // 문항 카드들(데모 flex flex-col gap-3 = 카드 사이 12).
        for (var i = 0; i < st.questions.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          _card(context, cs, st.questions[i], st.answers[st.questions[i].id], i),
        ],
        // QNR-FORM-06b: 0문항이 되었어도(양식이 사라짐) 쓴 답이 있으면 읽기전용 조회는 남긴다 —
        // 지금 양식에 없는 답(고아)도 그대로 보여준다(10년 보관 진료기록).
        if (readOnly) ..._orphanRows(cs, st),

        // QNR-REQ-02: 필수가 비어 있어도 그대로 제출한다(막지도 경고도 안 함) — 데모의 canSubmit 비활성 미채택.
        if (!readOnly) ...[
          const SizedBox(height: 24), // mt-6
          ActionButton(
              label: '제출하기',
              busyLabel: '제출 중…',
              busy: st.submitting,
              onPressed: () async {
                await ref.read(questionnaireProvider(appointmentId).notifier).submit();
                if (context.mounted) context.go(returnTo); // NAV-QNR-15 왔던 곳으로
              }),
        ],
      ]),
    );
  }

  // 지금 양식에 대응 문항이 없는 옛 답변들(QNR-FORM-06b). 스냅샷 질문 글자는 T24가 되살린다 —
  // 여기서는 남은 답 값을 조회할 수 있게만 그린다.
  List<Widget> _orphanRows(ColorScheme cs, QnrState st) {
    final ids = st.questions.map((q) => q.id).toSet();
    return [
      for (final e in st.answers.entries)
        if (!ids.contains(e.key)) ...[
          const SizedBox(height: 12),
          _shell(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(e.value, style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
            ),
          ),
        ],
    ];
  }

  // 데모 카드 껍데기: 테두리 대신 그림자로 띄운다(그림자는 바깥 Container에 그려 잘리지 않음 —
  // booking_widgets.dart 구조 참고). 라운드 14 = rounded-xl.
  Widget _shell({required Widget child}) => Container(
        decoration: BoxDecoration(
          color: AppTokens.surface,
          borderRadius: BorderRadius.circular(AppTokens.densityCardRadius),
          boxShadow: AppTokens.cardElevation,
        ),
        clipBehavior: Clip.antiAlias,
        child: child,
      );

  Widget _card(BuildContext context, ColorScheme cs, Question q, String? value, int index) {
    final hasValue = value != null && value.isNotEmpty;
    // 상태 배지(데모 답/미작성/미표시). '미표시'는 성별 표시대상 판정이 필요해 T24 몫(QNR-SHOW) —
    // 이 화면(마법사 확인)의 문항은 이미 이 환자에게 보이는 것들이라 답/미작성 둘로 갈린다.
    final status = hasValue ? '답' : '미작성';
    // 답 본문: 값이 있으면 값, 없으면 안내(데모 '아직 작성하지 않았어요.'). readOnly의 답없음/미표시
    // 구분 렌더는 QNR-SHOW·QNR-LIVE = T24 — 그때까지 읽기전용은 값만 그린다.
    final answerText = hasValue ? value : (readOnly ? '' : '아직 작성하지 않았어요.');

    return _shell(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // 헤더(px-16, 위아래 16) + border-b: 제목 + 오른쪽 상태 배지(shrink-0 pill).
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
                child: Text(q.text,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500, height: 1.6))),
            if (!readOnly) ...[
              const SizedBox(width: 12),
              _statusBadge(status),
            ],
          ]),
        ),
        const Divider(height: 1, thickness: 1, color: AppTokens.border), // border-b
        // 본문(px-16, 위 gap-16 + pt-3=12 = 28, 아래 16): 답 텍스트 muted + 오른쪽 [고치기] ghost sm.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 28, 16, 16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            Expanded(
                child: Text(answerText,
                    style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant))),
            if (!readOnly) ...[
              const SizedBox(width: 12),
              TextButton.icon(
                key: Key('edit-${q.id}'),
                // NAV-QNR-14: 확인 화면은 questions 순서를 그대로 쓰므로 위치가 곧 index. 라벨은 규칙 문구 '고치기'.
                onPressed: () =>
                    context.go('/questionnaire/$appointmentId?start=$index&from=confirm'),
                icon: const Icon(Icons.edit, size: 14), // 데모 Pencil size-3.5
                label: const Text('고치기'),
                style: AppButtonSize.shrink(AppButtonSize.sm).copyWith(
                  foregroundColor: const WidgetStatePropertyAll(AppTokens.primary),
                  padding: const WidgetStatePropertyAll(
                      EdgeInsets.symmetric(horizontal: 10, vertical: 0)),
                ),
              ),
            ],
          ]),
        ),
      ]),
    );
  }

  Widget _statusBadge(String status) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), // px-2 py-1
        decoration: BoxDecoration(
          color: const Color(0x1A0B6E70), // bg-primary/10 (primary @ 10%)
          borderRadius: BorderRadius.circular(999), // rounded-full
        ),
        child: Text(status,
            style: const TextStyle(fontSize: 12, color: AppTokens.primary)), // text-xs text-primary
      );
}
