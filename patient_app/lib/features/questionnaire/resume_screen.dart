import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'questionnaire_controller.dart';
import 'qnr_load_gate.dart';
import 'questionnaire_repository.dart';
import 'qnr_progress_text.dart';

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
    final gate = qnrLoadGate(ref, st, appointmentId); // 로드 실패=[다시 시도], 로딩=스피너
    if (gate != null) return gate;
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
          // QNR-PROG-08: 「M문항 중 N개…」 — 숫자는 서버 값(st.answered/st.total), 화면이 세지 않는다(QNR-PROG-09).
          ResumeSummary(answered: st.answered, total: st.total),
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

/// QNR-PROG-08: 이어쓰기 진행률 요약 「8문항 중 3개를 작성하셨습니다.」.
/// 숫자는 서버 compute_progress 값을 받아 그대로 쓴다(QNR-PROG-09) — answers.length로 세지 않는다.
class ResumeSummary extends StatelessWidget {
  const ResumeSummary({super.key, required this.answered, required this.total});
  final int answered, total;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Text(qnrResumeText(answered: answered, total: total),
        style: TextStyle(fontSize: 15, color: cs.onSurfaceVariant));
  }
}
