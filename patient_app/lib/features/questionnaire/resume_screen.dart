import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'questionnaire_controller.dart';
import 'questionnaire_repository.dart';

/// 작성 중인 문진에 들어오면 마법사 1번이 아니라 이어쓰기 화면이 먼저 뜬다(NAV-QNR-02).
/// [처음부터 보기]는 1번으로(NAV-QNR-11), [N번부터 이어서]는 안 쓴 첫 문항으로(NAV-QNR-12).
class ResumeScreen extends ConsumerWidget {
  const ResumeScreen({super.key, required this.appointmentId});
  final String appointmentId;

  int _firstUnanswered(List<Question> questions, Map<String, String> answers) {
    for (var i = 0; i < questions.length; i++) {
      if (!answers.containsKey(questions[i].id)) return i;
    }
    return questions.length - 1; // 다 썼으면 마지막
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(questionnaireProvider(appointmentId));
    if (st.loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final resumeAt = _firstUnanswered(st.questions, st.answers);
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('사전문진')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('작성하던 문진이 있어요',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: cs.primary)),
          const SizedBox(height: 8),
          // 안내 문구(N문항 중 X개…)는 QNR-PROG-08 = T24가 채운다.
          const ResumeSummary(),
          const Spacer(),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: () => context.go('/questionnaire/$appointmentId?start=$resumeAt'), // NAV-QNR-12
            child: Text('${resumeAt + 1}번부터 이어서'),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: () => context.go('/questionnaire/$appointmentId?start=0'), // NAV-QNR-11
            child: const Text('처음부터 보기'),
          ),
        ]),
      ),
    );
  }
}

/// 진행률 요약 문구 자리 — QNR-PROG-08(T24)이 채운다.
class ResumeSummary extends StatelessWidget {
  const ResumeSummary({super.key});
  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
