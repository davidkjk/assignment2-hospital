import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/tokens.dart';
import 'booking_controller.dart';
import 'steps/who_step.dart';
import 'steps/dept_step.dart';
import 'steps/doctor_step.dart';
import 'steps/date_step.dart';
import 'steps/time_step.dart';
import 'steps/why_step.dart';
import 'steps/conf_step.dart';
import 'steps/done_step.dart';

const _stepNames = ['대상 선택', '진료과', '의사 선택', '날짜 선택', '시간 선택', '방문 이유', '최종 확인', '완료'];

class BookingWizard extends ConsumerWidget {
  const BookingWizard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final step = sel.step;
    void onBack() {
      if (step == 0 || step >= 7) {
        // BOOK-KEEP-05 1단계 뒤로 = 마법사 나감 / BOOK-DONE-07·NAV-BOOK-14 완료 뒤로 = 홈(예약 이미 생성).
        context.go('/home');
      } else {
        ref.read(bookingProvider.notifier).back(); // BOOK-NAV-04 — 한 단계씩
      }
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        onBack();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const BackButtonIcon(),
            onPressed: onBack, // BOOK-NAV-03 — 뒤로 버튼 하나만(단계 칩·점프 없음)
          ),
          title: Text('${step + 1}단계 / 8단계 · ${_stepNames[step]}'), // BOOK-NAV-02 — 숫자+단계 이름
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(4),
            child: LinearProgressIndicator(value: (step + 1) / 8), // 진행 막대
          ),
        ),
        body: Column(children: [
          if (step >= 1 && step < 7) _SummaryChips(sel), // BOOK-NAV-06 — 2단계부터(완료는 본문이 요약)
          Expanded(
            child: switch (step) {
              // BOOK-NAV-01 — 한 화면에 한 질문
              0 => const WhoStep(),
              1 => const DeptStep(),
              2 => const DoctorStep(),
              3 => const DateStep(),
              4 => const TimeStep(),
              5 => const WhyStep(),
              6 => const ConfStep(),
              _ => const DoneStep(), // 7단계 완료
            },
          ),
        ]),
      ),
    );
  }
}

// 읽기 전용 회색 딱지 — 버튼처럼 보이지 않게(BOOK-NAV-06). 누를 수 없다.
class _SummaryChips extends StatelessWidget {
  const _SummaryChips(this.sel);
  final BookingSelection sel;
  @override
  Widget build(BuildContext context) {
    final chips = <String>[
      if (sel.target != null) sel.target!.name,
      if (sel.department != null) sel.department!.name,
      if (sel.doctor != null) sel.doctor!.name,
    ];
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Wrap(spacing: 6, children: [
        for (final c in chips)
          Chip(
            label: Text(c),
            backgroundColor: AppTokens.muted, // 회색, onPressed 없음(누를 수 없음)
            side: BorderSide.none,
          ),
      ]),
    );
  }
}
