import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/action_button.dart';
import '../appointment/appointment_detail.dart'; // appointmentDetailProvider — 작성 중 라이브 취소 감지(QNR-LIVE-01)
import '../home/home_data.dart'; // homeAcknowledgeProvider — 병원발 [확인] 창구 재사용(새 API 안 만듦)
import 'questionnaire_controller.dart';
import 'qnr_load_gate.dart';
import 'question_field.dart';
import 'qnr_live_banner.dart';
import 'qnr_progress_text.dart';

// #21: 진료 시작 전까지만 수정 가능. 이 밖(취소·진료중 이후)은 읽기 전용(QNR-LIVE-01·NAV-QNR-18).
// entry의 editableStatuses와 같은 값 — import 순환(entry→wizard)을 피하려 파일 지역 상수로 둔다.
const _editableStatuses = {'예약신청', '예약확정', '도착', '진료대기'};

class QuestionnaireWizard extends ConsumerStatefulWidget {
  const QuestionnaireWizard({super.key, required this.appointmentId, this.startIndex = 0});
  final String appointmentId;
  final int startIndex;
  @override
  ConsumerState<QuestionnaireWizard> createState() => _WizardState();
}

class _WizardState extends ConsumerState<QuestionnaireWizard> {
  bool _saving = false;
  bool _cxlAcked = false; // 병원발 취소 안내에서 [확인]을 눌렀는지(QNR-LIVE-04) — 눌러도 화면은 그대로.
  // 실행 보정: startIndex를 initState postFrame에서 goTo하면 async load가 뒤에 완료되며 index를
  // 0으로 되돌려(경합) 이어쓰기/고치기 진입 문항이 유실된다. load가 끝난 뒤(build) 한 번만 적용한다.
  bool _appliedStart = false;

  Future<void> _next() async {
    final ctl = ref.read(questionnaireProvider(widget.appointmentId).notifier);
    final before = ref.read(questionnaireProvider(widget.appointmentId));
    final wasLast = before.index >= before.questions.length - 1;
    setState(() => _saving = true);
    await ctl.next(); // 자동 저장(complete=false) — 필수 비어도 그대로 진행(QNR-REQ-01·10)
    if (!mounted) return;
    setState(() => _saving = false);
    if (wasLast) {
      context.go('/questionnaire/${widget.appointmentId}/confirm'); // 마지막 → 확인(NAV-QNR-13)
    }
  }

  /// 처리 중 이탈 확인(BTN-EXIT-01 패턴). 실행 보정: 공용 showExitConfirm은 예약 신청 전용 문구라
  /// 문진엔 거짓말이 된다 — 같은 패턴에 문진용 문구를 쓴다(규칙은 패턴이지 예약 문구가 아님).
  Future<bool> _confirmLeaveWhileSaving() async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('저장 중이에요'),
        content: const Text('지금까지 쓰신 내용을 저장하고 있어요. 잠시만 기다려 주세요.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('기다리기')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('나가기')),
        ],
      ),
    );
    return r ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final st = ref.watch(questionnaireProvider(widget.appointmentId));
    final gate = qnrLoadGate(ref, st, widget.appointmentId); // 로드 실패=[다시 시도], 로딩=스피너
    if (gate != null) return gate;

    // 이어쓰기/특정 문항 진입(NAV-QNR-11·12·14)의 startIndex를 load 완료 후 한 번만 적용.
    if (!_appliedStart) {
      _appliedStart = true;
      if (widget.startIndex != st.index && widget.startIndex < st.questions.length) {
        WidgetsBinding.instance.addPostFrameCallback(
            (_) => ref.read(questionnaireProvider(widget.appointmentId).notifier).goTo(widget.startIndex));
        return const Scaffold(body: Center(child: CircularProgressIndicator())); // 점프 전 문항1 반짝임 방지
      }
    }

    final q = st.current;
    if (q == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final cs = Theme.of(context).colorScheme;

    // QNR-LIVE-01: 작성 중 예약이 취소되면(서버 상태가 편집 구간을 벗어나면) 화면을 옮기지 않고
    // 그 자리에서 읽기 전용으로 바꾼다(NAV-GLOBAL-07). 쓴 답은 그대로 두고 입력칸만 잠근다(QNR-LIVE-05).
    final view = ref.watch(appointmentDetailProvider(widget.appointmentId)).valueOrNull?.view;
    final status = view?.status;
    final locked = status != null && !_editableStatuses.contains(status);
    final cancelled = status == '환자취소' || status == '병원취소';
    return PopScope(
      canPop: !_saving, // 저장 중이면 시스템 pop을 막고 확인 팝업(NAV-QNR-17)
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return; // NAV-QNR-16: 저장 중 아니면 그냥 나감(팝업 없음)
        final leave = await _confirmLeaveWhileSaving(); // BTN-EXIT-01(저장 진행 중일 때만 온다)
        if (leave && context.mounted) Navigator.of(context).pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('사전문진'),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(40),
            // 진행률 위치 표시 — 문구(N번/M문항)는 QNR-PROG 계열=T24가 채운다. 여기는 자리만.
            child: QnrProgressHeader(index: st.index, total: st.questions.length),
          ),
        ),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // QNR-LIVE-02·03·04: 취소되면 그 자리에 안내를 얹는다(병원발만 [확인]). 화면은 그대로 남는다.
            if (cancelled && view != null && !_cxlAcked) ...[
              QnrCancelledBanner(
                cancelledBy: view.cancelledBy ?? 'hospital',
                isSelf: view.isSelf,
                relation: view.cancelledByRelation,
                name: view.cancelledByName,
                onAcknowledge: () {
                  ref.read(homeAcknowledgeProvider)(widget.appointmentId); // 병원발 「봤다」 창구 재사용
                  setState(() => _cxlAcked = true);
                },
              ),
              const SizedBox(height: 20),
            ],
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('진료 전 확인',
                      style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                  const SizedBox(height: 8),
                  Text(q.text,
                      style: TextStyle(
                          fontSize: 20, height: 1.4, fontWeight: FontWeight.w700, color: cs.primary)),
                ]),
              ),
              if (q.required)
                Container(
                  margin: const EdgeInsets.only(left: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                      color: cs.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(999)),
                  child: Text('필수', style: TextStyle(fontSize: 12, color: cs.primary)),
                ),
            ]),
            const SizedBox(height: 24),
            QuestionField(
                question: q,
                value: st.answers[q.id],
                // QNR-LIVE-05: 잠기면 onChanged=null → 값은 보이고 입력만 막힌다.
                onChanged: locked
                    ? null
                    : (v) =>
                        ref.read(questionnaireProvider(widget.appointmentId).notifier).answer(q.id, v)),
            const SizedBox(height: 20),
            // 잠기면 자동 저장 안내는 거짓말이 되므로 감춘다.
            if (!locked)
              Text('입력하신 답변은 자동으로 저장됩니다.',
                  style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
            const Spacer(),
            // QNR-LIVE-05: 잠기면 [이전]·[다음]·[최종 확인]이 사라진다(진행할 것이 없다).
            if (!locked)
              // 데모: 버튼 줄 위에 얇은 구분선(border-t) + 여백(pt-4). [이전]은 첫 문항에서 숨기지
              // 않고 비활성(레이아웃 안정 — 데모와 동일).
              Container(
                decoration: BoxDecoration(
                    border: Border(top: BorderSide(color: cs.outlineVariant))),
                padding: const EdgeInsets.only(top: 16),
                child: Row(children: [
                  Expanded(
                    child: OutlinedButton(
                        onPressed: st.index > 0
                            ? () => ref
                                .read(questionnaireProvider(widget.appointmentId).notifier)
                                .prev()
                            : null, // 첫 문항이면 비활성
                        child: const Text('이전')),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ActionButton(
                        label: st.index >= st.questions.length - 1 ? '최종 확인' : '다음',
                        busyLabel: '저장 중…',
                        busy: _saving,
                        onPressed: _next),
                  ),
                ]),
              ),
          ]),
        ),
      ),
    );
  }
}

/// 진행률 위치 표시 자리 — 실제 문구·규칙은 QNR-PROG(T24). 여기서는 T24가 교체할 수 있게 최소 표시만.
class QnrProgressHeader extends StatelessWidget {
  const QnrProgressHeader({super.key, required this.index, required this.total});
  final int index, total;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    // 데모 회색 띠: 진행 막대(둥근 끝) + 오른쪽 문구. 예약 마법사와 같은 패턴.
    return Container(
      width: double.infinity,
      color: cs.surfaceContainerHighest,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Row(children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: total == 0 ? 0 : (index + 1) / total,
              minHeight: 8,
              backgroundColor: cs.primary.withValues(alpha: 0.2),
              valueColor: AlwaysStoppedAnimation(cs.primary),
            ),
          ),
        ),
        const SizedBox(width: 12),
        // QNR-PROG-06: 문구는 qnr_progress_text 한 곳에서 만든다(QNR-PROG-09) — 「3번 / 8문항」.
        Text(qnrHeaderText(index: index, total: total),
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: cs.onSurfaceVariant)),
      ]),
    );
  }
}
