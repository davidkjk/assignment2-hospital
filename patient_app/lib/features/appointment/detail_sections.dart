import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/button_sizes.dart';
import '../../core/pending_request.dart' show koreanTime;
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import '../../widgets/dashed_border.dart';
import '../../widgets/doctor_avatar.dart';
import '../../widgets/inline_error.dart';
import '../home/appointment_view.dart';
import '../home/status_badge.dart';
import 'appointment_detail.dart';
import 'cancelled_view.dart';

// ── 지도·전화 seam ───────────────────────────────────────────────────────────
// 테스트가 실제 앱을 띄우지 않고 「무엇을 열려 했는지」만 관찰할 수 있게 갈아끼울 수 있는 함수로 둔다.
void Function(String query) openMapQuery = (q) => launchUrl(
      Uri.parse('https://maps.google.com/?q=${Uri.encodeComponent(q)}'),
      mode: LaunchMode.externalApplication,
    );
void Function(String phone) openTel = (p) => launchUrl(Uri.parse('tel:$p'));

/// 예약 일시를 어르신도 읽기 쉬운 한국어로. (예: 8월 5일 오후 2:30)
String formatKoreanDateTime(DateTime? t) =>
    t == null ? '' : '${t.month}월 ${t.day}일 ${koreanTime(t)}';

/// 머리 색 — 카드(T15/17) 색 규칙을 물려받는다. 끝난 예약(완료·취소)은 옅은 회색, 그 밖엔 딥틸 옅은 배경.
Color _headerColor(AppointmentCardState state) =>
    isFinishedCard(state) ? AppTokens.grayDone : AppTokens.primary.withValues(alpha: 0.05);

// ── 머리(APPT-HEAD) ──────────────────────────────────────────────────────────
class DetailHeader extends StatelessWidget {
  const DetailHeader(this.d, this.state, {super.key});
  final AppointmentDetail d;
  final AppointmentCardState state;

  @override
  Widget build(BuildContext context) {
    final v = d.view;
    final cancelled = state == AppointmentCardState.cancelled;
    final isSelf = v.relation == '본인' || v.isSelf;
    final who = isSelf ? '${v.forPatientName} · 본인' : '${v.relation} ${v.forPatientName} 님';
    return Container(
      key: const Key('detail_header'),
      color: _headerColor(state),
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // APPT-HEAD-01 — 일시를 크게. 취소된 예약은 취소선 + 옅은 글자.
              Text(
                formatKoreanDateTime(v.slotStart),
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: cancelled ? AppTokens.grayPending : null,
                  decoration: cancelled ? TextDecoration.lineThrough : null,
                ),
              ),
              const SizedBox(height: 8),
              // APPT-HEAD-03 — 누구의 예약인지(가족이면 관계·이름을 맨 위에).
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.person, size: 16, color: AppTokens.primary),
                const SizedBox(width: 4),
                Text(who,
                    style: const TextStyle(fontSize: 14, color: AppTokens.grayPending)),
              ]),
            ]),
          ),
          const SizedBox(width: 12),
          StatusBadge(
            label: patientStatusLabel(state),
            color: patientBadgeColor(state),
            textColor: patientBadgeTextColor(state),
          ),
        ]),
        // CANCEL-DONE-02 / APPT-RACE-04 — 취소된 예약은 누가·언제 취소했는지 머리에 밝힌다.
        if (cancelled) ...[
          const SizedBox(height: 12),
          CancelledNotice(v),
        ],
        // APPT-HEAD-05 — 확정 전이면 '확인 중' 안내 한 줄(APPT-HEAD-04 용어는 아래 표·버튼이 상태로 분기).
        if (v.status == '예약신청') ...[
          const SizedBox(height: 12),
          const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.schedule, size: 16, color: AppTokens.warn),
            SizedBox(width: 6),
            Expanded(
              child: Text('병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.',
                  style: TextStyle(fontSize: 13, color: AppTokens.warn)),
            ),
          ]),
        ],
      ]),
    );
  }
}

// ── 정보 표(APPT-INFO) ───────────────────────────────────────────────────────
class InfoTable extends StatelessWidget {
  const InfoTable(this.d, {super.key});
  final AppointmentDetail d;

  @override
  Widget build(BuildContext context) {
    final v = d.view;
    final rows = <Widget>[
      _infoRow('진료과', Text(v.departmentName)),
      _infoRow(
        '담당의사',
        Row(children: [
          DoctorAvatar(name: v.doctorName, radius: 16), // BOOK-DOC-05 회색 원+첫 글자
          const SizedBox(width: 8),
          Expanded(child: Text('${v.doctorName} 선생님')),
        ]),
      ),
    ];
    // APPT-INFO-04 · NAV-APPT-19 — 장소는 병원 주소(진료실 칸은 DB에 없어 조건부). 누르면 지도 앱.
    if (d.hospitalAddress != null && d.hospitalAddress!.isNotEmpty) {
      rows.add(_infoRow(
        '장소',
        InkWell(
          onTap: () => openMapQuery(d.hospitalAddress!),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.place, size: 16, color: AppTokens.primary),
            const SizedBox(width: 4),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(d.hospitalAddress!),
                const SizedBox(height: 2),
                const Text('지도 앱으로 길 찾기',
                    style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
              ]),
            ),
            const Icon(Icons.open_in_new, size: 14, color: AppTokens.primary),
          ]),
        ),
      ));
    }
    // APPT-INFO-02 — 방문이유가 비면 그 줄을 감춘다(빈 줄·안내문 안 남김) / APPT-INFO-03 — 쓴 문장 그대로.
    if (d.reason != null && d.reason!.isNotEmpty) {
      rows.add(_infoRow('방문이유', Text(d.reason!)));
    }

    return Column(children: [
      Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE3E8EB)),
          borderRadius: BorderRadius.circular(14),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(children: rows),
      ),
      // APPT-INFO-05 · NAV-APPT-18 — 전화번호는 테두리 상자, 누르면 전화 앱.
      if (d.hospitalPhone != null && d.hospitalPhone!.isNotEmpty) ...[
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: () => openTel(d.hospitalPhone!),
            style: OutlinedButton.styleFrom(
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.all(12),
              side: const BorderSide(color: Color(0xFFE3E8EB)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: Row(children: [
              const Icon(Icons.phone, size: 20, color: AppTokens.primary),
              const SizedBox(width: 12),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('병원 전화',
                    style: TextStyle(fontWeight: FontWeight.w600, color: Colors.black)),
                Text(d.hospitalPhone!,
                    style: const TextStyle(color: AppTokens.grayPending)),
              ]),
            ]),
          ),
        ),
      ],
    ]);
  }

  Widget _infoRow(String label, Widget value) => Container(
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0xFFEFF2F4))),
        ),
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
            width: 72,
            child: Text(label,
                style: const TextStyle(fontSize: 14, color: AppTokens.grayPending)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: DefaultTextStyle.merge(
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w500, color: Colors.black),
              child: value,
            ),
          ),
        ]),
      );
}

// ── QR(APPT-QR) ──────────────────────────────────────────────────────────────
class DetailQr extends StatelessWidget {
  const DetailQr(this.d, this.state, {super.key});
  final AppointmentDetail d;
  final AppointmentCardState state;

  @override
  Widget build(BuildContext context) {
    // APPT-QR-02 — 확정 전에는 점선 빈칸 + 안내(QR은 아직 없다).
    if (d.view.status == '예약신청') {
      return const _DottedPlaceholder(text: '확정되면 여기에 접수용 QR이 나타납니다');
    }
    // APPT-QR-03·04 — 도착 이후(도착·진료대기·진료중)·완료·취소는 QR을 감춘다.
    //    (APPT-QR-05: 시간 지남(late)은 유지 — 늦게라도 접수)
    if (state == AppointmentCardState.arrived ||
        state == AppointmentCardState.wait ||
        state == AppointmentCardState.inTreatment ||
        isFinishedCard(state)) {
      return const SizedBox.shrink();
    }
    // APPT-QR-01 · NAV-APPT-05 — 확정 예약은 접수 QR 카드, [QR 보기] → 전체화면 QR(T17). (오프라인이면 보관본 — APPT-QR-06)
    return Container(
      key: const Key('detail_qr'),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE3E8EB)),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.all(16),
      child: Row(children: [
        const Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('접수 QR', style: TextStyle(fontWeight: FontWeight.w700)),
            SizedBox(height: 4),
            Text('병원 도착 후 접수할 때 사용하세요',
                style: TextStyle(fontSize: 13, color: AppTokens.grayPending)),
          ]),
        ),
        const SizedBox(width: 12),
        // ⚠️ Row에 Expanded 형제가 있으면 비-flex 버튼이 무한 폭으로 측정돼 터진다(RenderPhysicalShape).
        //    IntrinsicWidth로 「내용에 딱 맞는 폭」을 주면 안정적이면서 "QR 보기"가 줄바꿈되지 않는다
        //    (고정 116px은 좁아 "QR 보/기"로 쪼개졌다 — Task10 데모 대조).
        IntrinsicWidth(
          child: OutlinedButton.icon(
            onPressed: () => context.push('/qr/${d.view.id}'),
            icon: const Icon(Icons.qr_code, size: 18, color: AppTokens.primary),
            label: const Text('QR 보기', maxLines: 1, softWrap: false),
          ),
        ),
      ]),
    );
  }
}

class _DottedPlaceholder extends StatelessWidget {
  const _DottedPlaceholder({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    return DottedBorder(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(text,
            style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
      ),
    );
  }
}

// 점선 테두리 상자(`DottedBorder`)는 widgets/dashed_border.dart로 이전 — 여러 화면 공용.

// ── 사전문진 접기(APPT-QNR) ──────────────────────────────────────────────────
class QnrAccordion extends StatefulWidget {
  const QnrAccordion(this.d, this.state, {super.key});
  final AppointmentDetail d;
  final AppointmentCardState state;
  @override
  State<QnrAccordion> createState() => _QnrAccordionState();
}

class _QnrAccordionState extends State<QnrAccordion> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final id = widget.d.view.id;
    final st = widget.d.questionnaireStatus; // 'none'|'writable'|'readonly'

    // APPT-QNR-02 · NAV-APPT-06 — 미작성이면 주의색 줄, 누르면 문진 화면(T23).
    if (st == 'none') {
      return InkWell(
        onTap: () => context.push('/questionnaire/$id'),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
          child: const Row(children: [
            Icon(Icons.warning_amber, size: 18, color: AppTokens.warn),
            SizedBox(width: 8),
            Expanded(
              child: Text('사전문진 미작성 · 작성하기 ›',
                  style: TextStyle(color: AppTokens.warn, fontWeight: FontWeight.w600)),
            ),
          ]),
        ),
      );
    }

    // APPT-QNR-05·06·07 — 진료중 이후·취소된 예약은 읽기전용(자물쇠). 그 밖엔 수정 가능(눈).
    final readonly = st == 'readonly';
    // ⚠️ ListTile은 색 있는 Container로 감싸면 ink가 가려진다며 assert가 난다 → 흰 배경은 Material이 갖게 한다.
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFE3E8EB)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: Column(children: [
          ListTile(
          leading: Icon(readonly ? Icons.lock : Icons.visibility, // APPT-QNR-07
              color: AppTokens.grayPending),
          title: Text(readonly ? '사전문진  작성완료 · 조회만' : '사전문진  작성완료 · 수정 가능', // APPT-QNR-03
              style: const TextStyle(fontWeight: FontWeight.w600)),
          trailing: Icon(_open ? Icons.expand_less : Icons.expand_more),
          onTap: () => setState(() => _open = !_open),
        ),
        if (_open) ...[
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              QnrTable(id), // APPT-QNR-04 문항-답변 표(내용·수정 화면은 T23·24 소유)
              const SizedBox(height: 12),
              if (readonly)
                const Text('진료가 시작되어 수정할 수 없습니다', // APPT-QNR-05
                    style: TextStyle(fontSize: 13, color: AppTokens.grayPending))
              else
                ActionButton(
                  label: '수정하기',
                  busyLabel: '수정하기',
                  onPressed: () => context.push('/questionnaire/$id'),
                ),
            ]),
          ),
        ],
        ]),
      ),
    );
  }
}

/// 문항-답변 표. 내용 데이터·수정 화면은 T23·24(QNR-*)가 채운다. 여기선 펼침 자리만.
/// 문항–답변 표(읽기 전용). 예약 상세(APPT-QNR-04)와 방문 이력 펼침(HIST-QNR, T27b)이 공유한다.
/// 내용·수정 화면은 T23·24 소유(지금은 자리표시자).
class QnrTable extends StatelessWidget {
  const QnrTable(this.appointmentId, {super.key});
  // ignore: unused_field
  final String appointmentId;
  @override
  Widget build(BuildContext context) {
    return const Align(
      alignment: Alignment.centerLeft,
      child: Text('문진 답변을 불러오는 중입니다',
          style: TextStyle(fontSize: 13, color: AppTokens.grayPending)),
    );
  }
}

// ── 하단 버튼 바(APPT-BTN) — 상태가 버튼을 정한다 ─────────────────────────────
class DetailButtonBar extends ConsumerWidget {
  const DetailButtonBar(this.d, this.state, {super.key, required this.online});
  final AppointmentDetail d;
  final AppointmentCardState state;
  final bool online;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = d.view.id;
    final bar = _buildInner(context, ref, id);
    // 데모 footer는 p-4(상하 16) + base(h-8) 버튼. Flutter는 base 버튼 레이아웃이 탭영역(48)만큼
    // 부풀어 상하 각 7px 초과 → 데모와 어긋난다. base 변형에선 여백에서 tapPad만큼 뺀다
    // (cta[새로 예약하기]·텍스트 안내 변형은 tapPad 0이라 그대로 16).
    final v = 16 - _barTapPad();
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Color(0xFFE3E8EB))),
      ),
      padding: EdgeInsets.fromLTRB(16, v, 16, v),
      child: SafeArea(top: false, child: bar),
    );
  }

  // _buildInner이 그리는 변형의 버튼 높이에 맞춘 탭영역 보정량. 상태 분류는 _buildInner과 같은 순서.
  double _barTapPad() {
    // 접수 이후(도착·진료대기·진료중)는 텍스트 안내뿐 — 버튼이 없어 보정하지 않는다.
    if (state == AppointmentCardState.arrived ||
        state == AppointmentCardState.wait ||
        state == AppointmentCardState.inTreatment) {
      return 0;
    }
    // 완료·취소 = [새로 예약하기] cta(h-12) → tapPad 0. 그 밖(변경/취소·시간지남·상담연결됨·오프라인)은 base.
    if (isFinishedCard(state)) return AppButtonSize.tapPad(AppTokens.buttonCtaHeight);
    return AppButtonSize.tapPad(AppTokens.buttonBaseHeight);
  }

  Widget _buildInner(BuildContext context, WidgetRef ref, String id) {
    // APPT-BTN-04·05·06 — 도착 이후(도착·진료대기·진료중)는 버튼 없이 안내 한 줄(회색 비활성 버튼도 두지
    //    않는다 — 「기다리면 풀리나」 오해 방지). 접수가 끝나면 앱에서 못 바꾸고 접수처로 보낸다.
    if (state == AppointmentCardState.arrived ||
        state == AppointmentCardState.wait ||
        state == AppointmentCardState.inTreatment) {
      return const _Notice('접수가 끝난 예약입니다. 변경·취소는 접수처에 말씀해 주세요'); // NAV-APPT-20
    }
    // APPT-BTN-07 · NAV-APPT-17 — 완료·취소는 막다른 길을 만들지 않는다: [새로 예약하기] → 1단계.
    if (isFinishedCard(state)) {
      return ActionButton(
        label: '새로 예약하기',
        busyLabel: '새로 예약하기',
        style: AppButtonSize.cta, // 데모 ApptDetail footer: size=lg h-12 text-base
        onPressed: () => context.go('/booking'),
      );
    }
    // APPT-BTN-08 — 시간 지남(당일)은 접수 못 했으니 상담·전화로 연결.
    if (state == AppointmentCardState.late) {
      return Row(children: [
        Expanded(
          child: ActionButton(
            label: '상담 채팅 연결',
            busyLabel: '상담 채팅 연결',
            onPressed: () => context.push('/chat?appointment=$id'),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton(
            onPressed: () => d.hospitalPhone == null ? null : openTel(d.hospitalPhone!),
            child: const Text('병원 전화'),
          ),
        ),
      ]);
    }
    // APPT-BTN-09 — 마감 후 취소를 이미 상담으로 넘겼으면 다시 못 누르고 '상담 연결됨'만.
    if (d.supportRequestedAt != null) {
      return _SupportPending(onContinue: () => context.push('/chat?appointment=$id'));
    }
    // APPT-BTN-10 — 오프라인이면 두 버튼 회색 + 이유.
    if (!online) {
      return const _DisabledPair('인터넷이 연결되면 변경·취소하실 수 있습니다');
    }
    // 예약신청·예약확정(온라인) — 변경/취소 두 버튼. 취소는 회색 테두리(APPT-BTN-02, 빨간 버튼은 확인창 안에서만).
    final isPending = d.view.status == '예약신청';
    final cancelLabel = isPending ? '신청 취소' : '예약 취소'; // 용어가 상태를 따라간다(APPT-HEAD-04)
    final submitting = ref.watch(detailActionProvider(id));
    return Column(mainAxisSize: MainAxisSize.min, children: [
      if (submitting.hasError) ...[
        InlineError((submitting.error as ApiException).message), // APPT-BTN-12
        const SizedBox(height: 8),
      ],
      Row(children: [
        Expanded(
          child: ActionButton(
            label: '예약 변경',
            busyLabel: '변경하는 중…',
            busy: submitting.isLoading,
            onPressed: () => context.push('/appointments/$id/change'), // NAV-APPT-07 → T22 변경 마법사
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedActionButton(
            label: cancelLabel,
            busyLabel: '취소하는 중…', // APPT-BTN-11
            busy: submitting.isLoading,
            onPressed: () => _openCancelFlow(context, id), // NAV-APPT-12 → T22 취소 확인창/마감후 안내
          ),
        ),
      ]),
    ]);
  }

  // 마감 전이면 취소 확인창, 마감 후면 안내 팝업 — 판정·화면은 Task 22. T21은 취소 흐름으로 보내기만 한다.
  void _openCancelFlow(BuildContext context, String id) =>
      context.push('/appointments/$id/cancel');
}

/// 회색 테두리 버튼(취소처럼 시각 우선순위를 낮춘 동작). busy면 진행형 라벨을 유지한다(BTN-BUSY).
class OutlinedActionButton extends StatelessWidget {
  const OutlinedActionButton({
    super.key,
    required this.label,
    required this.busyLabel,
    required this.onPressed,
    this.busy = false,
  });
  final String label, busyLabel;
  final bool busy;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: () {
        if (busy) return;
        onPressed();
      },
      child: Text(busy ? busyLabel : label),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTokens.primary.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(text,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
    );
  }
}

/// APPT-BTN-09 — 마감 후 취소를 이미 상담으로 넘긴 상태: '상담 연결됨(직원 확인 중)' + 이어보기.
class _SupportPending extends StatelessWidget {
  const _SupportPending({required this.onContinue});
  final VoidCallback onContinue;
  @override
  Widget build(BuildContext context) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      const Text('상담 연결됨 · 직원이 확인하고 있습니다',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: AppTokens.grayPending)),
      const SizedBox(height: 8),
      SizedBox(
        width: double.infinity,
        child: OutlinedButton(onPressed: onContinue, child: const Text('상담 채팅 이어보기')),
      ),
    ]);
  }
}

/// APPT-BTN-10 — 오프라인이면 변경·취소 두 버튼을 회색으로 두고 왜 안 되는지 알린다.
class _DisabledPair extends StatelessWidget {
  const _DisabledPair(this.reason);
  final String reason;
  @override
  Widget build(BuildContext context) {
    Widget dead(String label) => Expanded(
          child: OutlinedButton(
            onPressed: null,
            child: Text(label),
          ),
        );
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Row(children: [dead('예약 변경'), const SizedBox(width: 8), dead('예약 취소')]),
      const SizedBox(height: 6),
      Text(reason,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
    ]);
  }
}
