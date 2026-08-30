import 'package:flutter/material.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/status_label.dart';
import '../../widgets/warn_text.dart';
import 'appointment_view.dart';
import 'card_bodies_a.dart';
import 'hospital_change_banner.dart';

/// 예약 카드 공통 프레임(CARD-COMMON). 세 층: 머리(이름·배지) / 가운데(AppCard 132px 고정) / 아래(버튼).
/// 상태가 바뀌면 가운데 본문만 갈아 끼운다. 병원발 변경 안내문은 상태와 직교하게 얹는다(CARD-CHG-01·05).
/// 상태 B(확정·도착·진료중·완료·취소·지연·오프라인) 본문·QR·문진 줄은 T17이 이 위젯에 케이스를 더한다.
class AppointmentCard extends StatelessWidget {
  final AppointmentView view;
  final QueueStatus? queue;
  final VoidCallback? onAcknowledge;
  const AppointmentCard({super.key, required this.view, this.queue, this.onAcknowledge});

  @override
  Widget build(BuildContext context) {
    final state = resolveCardState(view, DateTime.now());
    final numberLabel = view.isConfirmedBefore ? '예약번호' : '신청번호'; // COMMON-02/03
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        // 머리: 누구의 예약인지 먼저(COMMON-01) + 글자 배지(COMMON-04·05).
        Row(children: [
          Expanded(child: Text('${view.forPatientName} · $numberLabel ${view.bookingCode ?? ''}')),
          StatusLabel(text: patientStatusLabel(state), color: _railColor(state)),
        ]),
        // 상태별 상단 안내(REQ-04 · UNCONF-04·04b) — 원인을 먼저, 할 일을 나중에.
        ..._topNotices(state),
        // 가운데: 132px 고정 본문 + 병원발 변경 안내문(간격 0, CARD-CHG-01·05).
        AppCard(
          announcement: view.hospitalChangePrevTime == null
              ? null
              : HospitalChangeBanner(view: view, onConfirm: onAcknowledge),
          body: _cardBody(state),
        ),
        // 아래: 상태별 버튼.
        ..._actions(context, state),
      ],
    );
  }

  Color _railColor(AppointmentCardState s) => switch (s) {
        AppointmentCardState.req => AppTokens.grayPending, // CARD-REQ-02
        AppointmentCardState.unconf => AppTokens.grayPending, // CARD-UNCONF-03
        _ => AppTokens.grayDone,
      };

  Widget _cardBody(AppointmentCardState s) => switch (s) {
        AppointmentCardState.req => const ReqBody(),
        AppointmentCardState.wait => WaitBody(queue: queue),
        AppointmentCardState.unconf => const UnconfBody(),
        _ => const SizedBox.shrink(), // 상태 B — T17이 채운다
      };

  List<Widget> _topNotices(AppointmentCardState s) => switch (s) {
        // REQ-04: 병원이 확인하는 중임을 알린다(소요 시간을 약속하지 않는다 — REQ-05).
        AppointmentCardState.req => const [
            SizedBox(height: 8),
            WarnText('병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.'),
          ],
        // UNCONF-04·04b: 원인(위) → 할 일(아래).
        AppointmentCardState.unconf => const [
            SizedBox(height: 8),
            WarnText('병원 확인이 끝나지 않았습니다'),
            SizedBox(height: 4),
            WarnText('병원에 연락해 주세요'),
          ],
        _ => const [],
      };

  List<Widget> _actions(BuildContext context, AppointmentCardState s) => switch (s) {
        // UNCONF-06: 상담 채팅 연결 · 병원 전화. [다시 예약하기] 없음(UNCONF-06b, 중복 예약 방지).
        AppointmentCardState.unconf => [
            const SizedBox(height: 8),
            ActionButton(label: '상담 채팅 연결', busyLabel: '연결 중…', onPressed: () {}),
            const SizedBox(height: 8),
            ActionButton(label: '병원 전화', busyLabel: '연결 중…', onPressed: () {}),
          ],
        _ => const [],
      };
}
