import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/action_button.dart';
import 'questionnaire_controller.dart';
import 'qnr_load_gate.dart';
import 'questionnaire_repository.dart';

/// 마지막 문항 다음의 확인 화면(NAV-QNR-03·13). 항목별 [고치기]는 그 문항으로(NAV-QNR-14,
/// ⭐ 1번부터 다시 훑지 않음), [제출하기]는 왔던 곳으로 돌아간다(NAV-QNR-15).
/// readOnly면 [고치기]·[제출하기]를 감춘다 — 읽기전용 값 렌더(미표시/미작성 구분)는 T24.
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
      body: Column(children: [
        Expanded(
          child: ListView(padding: const EdgeInsets.all(20), children: [
            Text(readOnly ? '작성한 내용' : '마지막 단계',
                style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
            const SizedBox(height: 6),
            Text(readOnly ? '작성하신 사전문진입니다' : '작성한 내용을 확인해 주세요',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            for (var i = 0; i < st.questions.length; i++)
              _row(context, cs, st.questions[i], st.answers[st.questions[i].id], i),
            // QNR-FORM-06b: 0문항이 되었어도(양식이 사라짐) 쓴 답이 있으면 읽기전용 조회는 남긴다 —
            // 지금 양식에 없는 답(고아)도 그대로 보여준다(10년 보관 진료기록).
            if (readOnly) ..._orphanRows(cs, st),
          ]),
        ),
        // QNR-REQ-02: 필수가 비어 있어도 그대로 제출한다(막지도 경고도 안 함) — 데모의 canSubmit 비활성 미채택.
        if (!readOnly)
          Padding(
            padding: const EdgeInsets.all(20),
            child: ActionButton(
                label: '제출하기',
                busyLabel: '제출 중…',
                busy: st.submitting,
                onPressed: () async {
                  await ref.read(questionnaireProvider(appointmentId).notifier).submit();
                  if (context.mounted) context.go(returnTo); // NAV-QNR-15 왔던 곳으로
                }),
          ),
      ]),
    );
  }

  // 지금 양식에 대응 문항이 없는 옛 답변들(QNR-FORM-06b). 스냅샷 질문 글자는 T24가 되살린다 —
  // 여기서는 남은 답 값을 조회할 수 있게만 그린다.
  List<Widget> _orphanRows(ColorScheme cs, QnrState st) {
    final ids = st.questions.map((q) => q.id).toSet();
    return [
      for (final e in st.answers.entries)
        if (!ids.contains(e.key))
          Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(e.value, style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
            ),
          ),
    ];
  }

  Widget _row(BuildContext context, ColorScheme cs, Question q, String? value, int index) {
    // 읽기전용의 '답 없음/미표시' 구분 렌더는 QNR-SHOW·QNR-LIVE = T24. 여기는 값·[고치기]만.
    final hasValue = value != null && value.isNotEmpty;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
                child: Text(q.text,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.4))),
            if (!readOnly)
              TextButton(
                key: Key('edit-${q.id}'),
                // NAV-QNR-14: 확인 화면은 questions 순서를 그대로 쓰므로 위치가 곧 index.
                onPressed: () =>
                    context.go('/questionnaire/$appointmentId?start=$index&from=confirm'),
                child: const Text('고치기'),
              ),
          ]),
          const SizedBox(height: 4),
          Text(hasValue ? value : '',
              style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
        ]),
      ),
    );
  }
}
