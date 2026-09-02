import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/button_sizes.dart';
import '../../core/tokens.dart';
import '../../widgets/empty_state.dart';
import '../booking/catalog_repository.dart'
    show Slot, Doctor, availableDatesProvider, doctorsProvider;
import '../booking/steps/date_step.dart' show MonthCalendar;
import '../booking/steps/time_step.dart' show availableSlotsProvider, slotLabel;
import 'appointment_actions.dart';
import 'appointment_detail.dart';
import 'cancel_flow.dart' show LateSupportDialog, invalidateAppointment, isAfterCancellationDeadline;
import 'detail_sections.dart' show formatKoreanDateTime;

// ── 변경 마법사 상태 ─────────────────────────────────────────────────────────
// 예약 변경은 「취소 + 새 예약」이지만 대상·진료과는 고정이라, 예약 8단계가 아니라 날짜→시간 2단계만이다.
class ChangeState {
  final int step; // 0=날짜 1=시간
  final String doctorId; // 처음엔 원 예약 의사, '다른 의사도 보기'로 같은 과 안에서 바뀔 수 있다(APPT-CHG-04)
  final String doctorName;
  final DateTime? date;
  final String? raceMessage; // APPT-CHG-18 — 시간 격자 위 「그 시간 방금 참」 안내
  final bool submitting; // APPT-CHG-17 — [변경합니다] 처리 중 잠금
  const ChangeState({
    required this.step,
    required this.doctorId,
    required this.doctorName,
    this.date,
    this.raceMessage,
    this.submitting = false,
  });

  ChangeState copyWith({
    int? step,
    String? doctorId,
    String? doctorName,
    DateTime? date,
    String? raceMessage,
    bool? submitting,
  }) =>
      ChangeState(
        step: step ?? this.step,
        doctorId: doctorId ?? this.doctorId,
        doctorName: doctorName ?? this.doctorName,
        date: date ?? this.date,
        raceMessage: raceMessage, // 보호 안 함 — 단계 이동 때마다 비운다
        submitting: submitting ?? this.submitting,
      );
}

class ChangeController extends StateNotifier<ChangeState> {
  ChangeController(String doctorId, String doctorName)
      : super(ChangeState(step: 0, doctorId: doctorId, doctorName: doctorName));

  void selectDate(DateTime d) => state = state.copyWith(step: 1, date: d); // 날짜 → 시간
  void backToDate() => state = state.copyWith(step: 0); // '날짜 다시 고르기'
  // APPT-CHG-04 — 같은 과 안에서 다른 의사로. 날짜 화면으로 돌아가고 그 의사의 빈 날짜를 새로 본다.
  void pickDoctor(String id, String name) =>
      state = ChangeState(step: 0, doctorId: id, doctorName: name);
  // APPT-CHG-18 — 그 시간이 이미 참(409). 시간 화면으로 되돌리고 격자 위 안내.
  void raceBackToTime(String message) => state = state.copyWith(step: 1, raceMessage: message);
  void setSubmitting(bool v) => state = state.copyWith(submitting: v, raceMessage: state.raceMessage);
}

typedef ChangeArgs = ({String appointmentId, String doctorId, String doctorName});

// 레코드 키(값 동등)로 family를 만들면 화면·테스트가 같은 컨트롤러를 집을 수 있다.
final changeControllerProvider =
    StateNotifierProvider.autoDispose.family<ChangeController, ChangeState, ChangeArgs>(
        (ref, a) => ChangeController(a.doctorId, a.doctorName));

ChangeArgs _argsOf(AppointmentDetail d) => (
      appointmentId: d.view.id,
      doctorId: d.doctorId ?? '',
      doctorName: d.view.doctorName,
    );

// ── 변경 마법사 진입(마감 게이트) ────────────────────────────────────────────
/// 상세 [예약 변경] → 이 화면. 마감 후면 마법사 대신 안내 팝업(APPT-CHG-19) — 서버 왕복 전에 화면이 판정한다.
class ChangeScreen extends ConsumerWidget {
  const ChangeScreen(this.id, {super.key});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(appointmentDetailProvider(id));
    return Scaffold(
      appBar: AppBar(title: const Text('예약 변경')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => EmptyState.error(onRetry: () => ref.invalidate(appointmentDetailProvider(id))),
        data: (d) {
          if (d == null) return const Center(child: Text('찾을 수 없는 예약입니다'));
          if (isAfterCancellationDeadline(d, DateTime.now())) {
            // APPT-CHG-19·20 — 마감 후: 새 시간을 미리 고르는 폼을 열지 않고 안내 팝업만.
            return _ChangeLateGate(d);
          }
          return ChangeWizard(d);
        },
      ),
    );
  }
}

/// 마감 후 변경: 마법사 대신 안내 팝업(취소와 같은 팝업, request_type='변경')을 띄우고 빠져나갈 문을 준다.
class _ChangeLateGate extends StatefulWidget {
  const _ChangeLateGate(this.d);
  final AppointmentDetail d;
  @override
  State<_ChangeLateGate> createState() => _ChangeLateGateState();
}

class _ChangeLateGateState extends State<_ChangeLateGate> {
  bool _opened = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (_opened) return;
      _opened = true;
      await showDialog(
          context: context,
          builder: (_) => LateSupportDialog(widget.d, requestType: '변경')); // APPT-CHG-19
      if (mounted) context.pop(); // 팝업 닫으면 상세로 돌아간다(막다른 길 금지)
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.expand();
}

// ── 변경 마법사 본체(날짜 → 시간) ───────────────────────────────────────────
class ChangeWizard extends ConsumerWidget {
  const ChangeWizard(this.d, {super.key});
  final AppointmentDetail d;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final args = _argsOf(d);
    final st = ref.watch(changeControllerProvider(args));
    // 트리 구조를 고정한다 — body는 항상 Stack의 첫 자식(단계 화면이 dispose되지 않게).
    return Stack(children: [
      Column(children: [
        _ProgressBar(step: st.step),
        _FixedHeader(
            deptName: d.view.departmentName,
            doctorName: st.doctorName,
            currentWhen: formatKoreanDateTime(d.view.slotStart)),
        Expanded(child: st.step == 0 ? _DateStep(d, args) : _TimeStep(d, args)),
      ]),
      // APPT-CHG-17 — [변경합니다] 처리 중: 격자를 덮어 중복 클릭을 막고 진행형 라벨을 보인다.
      if (st.submitting) ...[
        const ModalBarrier(color: Colors.black26, dismissible: false),
        const Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            CircularProgressIndicator(),
            SizedBox(height: 12),
            Text('변경하는 중…', style: TextStyle(fontWeight: FontWeight.w600)),
          ]),
        ),
      ],
    ]);
  }
}

/// APPT-CHG-07 — 진행 표시는 1단계/2단계(예약 8단계 막대를 쓰지 않는다).
class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.step});
  final int step;
  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTokens.muted,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Row(children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: step == 0 ? 0.5 : 1.0,
              minHeight: 6,
              backgroundColor: AppTokens.primary.withValues(alpha: 0.15),
              valueColor: const AlwaysStoppedAnimation(AppTokens.primary),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Text(step == 0 ? '1단계 / 2단계 · 날짜' : '2단계 / 2단계 · 시간',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTokens.grayPending)),
      ]),
    );
  }
}

/// APPT-CHG-02·03 — 같은 진료과·의사를 읽기 전용으로 고정 표시(진료과는 고르게 하지 않는다).
class _FixedHeader extends StatelessWidget {
  const _FixedHeader({required this.deptName, required this.doctorName, required this.currentWhen});
  final String deptName, doctorName, currentWhen;
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE3E8EB)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('같은 진료과·의사로 변경합니다',
            style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
        const SizedBox(height: 4),
        Text('$deptName · $doctorName 선생님', style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text('현재 $currentWhen', style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
      ]),
    );
  }
}

class _DateStep extends ConsumerWidget {
  const _DateStep(this.d, this.args);
  final AppointmentDetail d;
  final ChangeArgs args;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(changeControllerProvider(args));
    final dates = ref.watch(availableDatesProvider(st.doctorId));
    return dates.when(
      error: (_, __) => EmptyState.error(onRetry: () => ref.invalidate(availableDatesProvider(st.doctorId))),
      loading: () => const Center(child: CircularProgressIndicator()),
      data: (available) => SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.calendar_month, size: 20, color: AppTokens.primary),
            SizedBox(width: 8),
            Text('변경할 날짜를 골라주세요', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ]),
          const SizedBox(height: 16),
          MonthCalendar(
            available: available.map((x) => DateTime(x.year, x.month, x.day)).toSet(),
            now: DateTime.now(),
            onPick: (x) => ref.read(changeControllerProvider(args).notifier).selectDate(x),
          ),
          if (d.departmentId != null && d.departmentId!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: () => _openDoctorPicker(context, ref, d, args), // APPT-CHG-04 · 막다른 길 금지
                child: const Text('다른 의사도 보기'),
              ),
            ),
          ],
        ]),
      ),
    );
  }
}

// APPT-CHG-04 — 같은 과 안의 다른 의사를 아래에서 골라, 그 의사의 빈 날짜로 넘어간다.
void _openDoctorPicker(BuildContext context, WidgetRef ref, AppointmentDetail d, ChangeArgs args) {
  showModalBottomSheet<void>(
    context: context,
    builder: (sheetContext) => Consumer(builder: (context, r, _) {
      final docs = r.watch(doctorsProvider(d.departmentId!));
      return SafeArea(
        child: docs.when(
          error: (_, __) => const Padding(padding: EdgeInsets.all(24), child: Text('의사 목록을 불러오지 못했습니다')),
          loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
          data: (list) => Column(mainAxisSize: MainAxisSize.min, children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('${''}같은 진료과의 다른 의사', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
            for (final Doctor doc in list)
              ListTile(
                leading: const Icon(Icons.person, color: AppTokens.primary),
                title: Text('${doc.name} 선생님'),
                subtitle: Text(doc.scheduleSummary),
                onTap: () {
                  Navigator.pop(sheetContext);
                  ref.read(changeControllerProvider(args).notifier).pickDoctor(doc.id, doc.name);
                },
              ),
          ]),
        ),
      );
    }),
  );
}

class _TimeStep extends ConsumerWidget {
  const _TimeStep(this.d, this.args);
  final AppointmentDetail d;
  final ChangeArgs args;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(changeControllerProvider(args));
    final date = st.date!;
    final slots = ref.watch(availableSlotsProvider((doctorId: st.doctorId, date: date)));
    return slots.when(
      error: (_, __) => EmptyState.error(
          onRetry: () => ref.invalidate(availableSlotsProvider((doctorId: st.doctorId, date: date)))),
      loading: () => const Center(child: CircularProgressIndicator()),
      data: (list) {
        final am = list.where((s) => s.startTime.hour < 12).toList();
        final pm = list.where((s) => s.startTime.hour >= 12).toList();
        return ListView(padding: const EdgeInsets.all(20), children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Expanded(
              child: Row(children: [
                Icon(Icons.schedule, size: 20, color: AppTokens.primary),
                SizedBox(width: 8),
                Flexible(
                  child: Text('변경할 시간을 골라주세요',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
              ]),
            ),
            TextButton(
              style: AppButtonSize.shrink(AppButtonSize.sm), // 데모 ApptChange: variant=ghost size=sm
              onPressed: () => ref.read(changeControllerProvider(args).notifier).backToDate(),
              child: const Text('날짜 다시 고르기'),
            ),
          ]),
          const SizedBox(height: 4),
          Text('${date.month}월 ${date.day}일', // 날짜만(시각은 아래 격자에서 고른다)
              style: const TextStyle(fontSize: 14, color: AppTokens.grayPending)),
          const SizedBox(height: 16),
          if (st.raceMessage != null) _RaceNotice(st.raceMessage!), // APPT-CHG-18
          if (am.isEmpty && pm.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(children: [
                const Text('예약 가능한 시간이 없습니다'),
                TextButton(
                    onPressed: () => ref.read(changeControllerProvider(args).notifier).backToDate(),
                    child: const Text('다른 날짜 고르기')),
              ]),
            ),
          if (am.isNotEmpty) _SlotBlock('오전', am, (s) => _confirmAndSubmit(context, ref, d, args, date, s)),
          if (pm.isNotEmpty) _SlotBlock('오후', pm, (s) => _confirmAndSubmit(context, ref, d, args, date, s)),
        ]);
      },
    );
  }
}

class _SlotBlock extends StatelessWidget {
  const _SlotBlock(this.label, this.slots, this.onPick);
  final String label;
  final List<Slot> slots;
  final void Function(Slot) onPick;
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8),
        child: Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
      ),
      GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        childAspectRatio: 2.4,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
        children: [
          for (final s in slots)
            OutlinedButton(onPressed: () => onPick(s), child: Text(slotLabel(s.startTime))),
        ],
      ),
    ]);
  }
}

class _RaceNotice extends StatelessWidget {
  const _RaceNotice(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTokens.warn.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(8),
          border: const Border(left: BorderSide(color: AppTokens.warn, width: AppTokens.warnBarWidth)),
        ),
        child: Text(message, style: const TextStyle(color: AppTokens.warn)),
      );
}

// 시간을 고르면 전→후 확인 팝업(APPT-CHG-08·09) → [변경합니다]면 change_booking 제출.
Future<void> _confirmAndSubmit(
    BuildContext context, WidgetRef ref, AppointmentDetail d, ChangeArgs args, DateTime date, Slot slot) async {
  final newWhen = DateTime(date.year, date.month, date.day, slot.startTime.hour, slot.startTime.minute);
  final ok = await showChangeConfirm(context,
      before: formatKoreanDateTime(d.view.slotStart), after: formatKoreanDateTime(newWhen));
  if (ok != true) return; // APPT-CHG-11 — [아니요]면 시간 선택 그대로

  final ctl = ref.read(changeControllerProvider(args).notifier);
  ctl.setSubmitting(true); // APPT-CHG-17 처리 중 잠금
  try {
    final newId = await ref
        .read(appointmentActionsProvider)
        .change(d.view.id, slot.id, d.reason ?? '', d.updatedAt ?? DateTime.now());
    invalidateAppointment(ref, d.view.id); // 옛 예약 취소 반영
    if (context.mounted) context.go('/appointments/$newId'); // APPT-CHG-15 새 상세(뒤로=목록)
  } on ApiException catch (e) {
    ctl.setSubmitting(false);
    // APPT-CHG-18(그 시간 방금 참) · APPT-RACE(그 사이 바뀜) 둘 다 409 → 시간 화면 격자 위 안내 + 다시 시도(APPT-RACE-07).
    ctl.raceBackToTime(e.message);
  }
}

/// APPT-CHG-08·09 — 시간을 고르면 전→후를 함께 보여주는 확인 팝업(생략하지 않는다). [변경합니다]면 true.
Future<bool?> showChangeConfirm(BuildContext context, {required String before, required String after}) {
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Row(children: [
        Icon(Icons.check_circle, color: AppTokens.primary),
        SizedBox(width: 8),
        Expanded(child: Text('이 시간으로 예약을 변경할까요?')),
      ]),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('변경 전 · $before', style: const TextStyle(color: AppTokens.grayPending)),
        const SizedBox(height: 4),
        Text('변경 후 · $after', style: const TextStyle(fontWeight: FontWeight.w700)),
      ]),
      actions: [
        OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('아니요')), // APPT-CHG-11
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppTokens.primary, foregroundColor: Colors.white),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('변경합니다'),
        ),
      ],
    ),
  );
}
