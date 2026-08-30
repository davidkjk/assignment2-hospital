import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/tokens.dart';
import '../../core/wait_format.dart';
import '../../widgets/app_card.dart';
import '../../widgets/warn_text.dart';
import 'appointment_view.dart';
import 'card_bodies_a.dart';
import 'card_bodies_b.dart';
import 'hospital_change_banner.dart';
import 'questionnaire_row.dart';
import 'status_badge.dart';

/// 예약 카드(데모 StatusCard 정본). 위에서부터: 병원발 안내문 → 흰 카드[머리(이름·관계 / 시각·과·의사) +
/// 번호 줄 + 가운데 132 tint 박스 + 문진 줄 + 버튼]. 상태가 바뀌면 가운데 박스만 갈아 끼운다(CARD-COMMON-06).
class AppointmentCard extends StatelessWidget {
  final AppointmentView view;
  final QueueStatus? queue;
  final VoidCallback? onAcknowledge;
  final bool online; // CARD-OFF: 오프라인이면 순서·대기 숫자 대신 문장(카드 자체는 그대로)
  final DateTime? now; // 테스트 seam(골든 결정론) — null이면 실시간
  const AppointmentCard(
      {super.key,
      required this.view,
      this.queue,
      this.onAcknowledge,
      this.online = true,
      this.now});

  @override
  Widget build(BuildContext context) {
    final state = resolveCardState(view, now ?? DateTime.now());
    final numberLabel = view.isConfirmedBefore ? '예약번호' : '신청번호'; // COMMON-02/03
    // CARD-CHG-06 경계: 병원취소면 CxlBody가 전담하고 변경 배너는 얹지 않는다(취소 문구 중복 방지).
    final showAnnouncement = view.hospitalChangePrevTime != null && view.status != '병원취소';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showAnnouncement) ...[
          HospitalChangeBanner(view: view, onConfirm: onAcknowledge),
          const SizedBox(height: 8),
        ],
        ..._topNotices(state),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE5EAED)),
            boxShadow: const [
              BoxShadow(color: Color(0x14102D3A), blurRadius: 8, offset: Offset(0, 1)),
            ],
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              // 머리: 이름·관계 + 시각·과·의사 / 색 배지(COMMON-01·04·05).
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${view.forPatientName} · ${view.relation}', // CARD-COMMON-01: 관계 문자열(예: '어머니')
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        if (view.slotStart != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text.rich(TextSpan(children: [
                              TextSpan(
                                  text: formatKoreanTime(view.slotStart!),
                                  style: const TextStyle(fontWeight: FontWeight.w600)),
                              TextSpan(
                                  text: ' · ${view.departmentName} · ${view.doctorName} 선생님',
                                  style: const TextStyle(color: AppTokens.grayPending)),
                            ])),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  StatusBadge(
                      label: patientStatusLabel(state),
                      color: patientBadgeColor(state),
                      textColor: patientBadgeTextColor(state)),
                ],
              ),
              // 번호 줄 + 아래 구분선(COMMON-02/03).
              Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 12),
                child: Container(
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Color(0xFFE5EAED))),
                  ),
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text('$numberLabel ${view.bookingCode ?? ''}',
                      style: const TextStyle(color: AppTokens.grayPending, fontSize: 13)),
                ),
              ),
              // 가운데 132 tint 박스(COMMON-06).
              AppCard(body: _cardBody(context, state)),
              // 문진 줄(취소·요청·미확정엔 없음).
              ..._questionnaire(context, state),
              // 아래: 상태별 버튼(데모: 아웃라인·오른쪽 정렬).
              ..._actions(context, state),
            ],
          ),
        ),
      ],
    );
  }

  Widget _cardBody(BuildContext context, AppointmentCardState s) {
    // CARD-OFF-03: 오프라인 + 대기/도착/진료중이면 순서·대기 대신 문장(높이 유지).
    if (!online &&
        (s == AppointmentCardState.wait ||
            s == AppointmentCardState.arrived ||
            s == AppointmentCardState.inTreatment)) {
      return const OfflineBody();
    }
    return switch (s) {
      AppointmentCardState.req => const ReqBody(),
      AppointmentCardState.wait => WaitBody(queue: queue),
      AppointmentCardState.unconf => const UnconfBody(),
      AppointmentCardState.confirmed ||
      AppointmentCardState.late =>
        QrPreviewBody(view: view, onTap: () => context.go('/qr/${view.id}')), // NAV-HOME-02
      AppointmentCardState.arrived => const InBody(),
      AppointmentCardState.inTreatment => const DocBody(),
      AppointmentCardState.done => const DoneBody(),
      AppointmentCardState.cancelled => CxlBody(view: view),
      _ => const SizedBox.shrink(),
    };
  }

  List<Widget> _questionnaire(BuildContext context, AppointmentCardState s) {
    final QnrRowState? row = switch (s) {
      AppointmentCardState.inTreatment => QnrRowState.locked, // CARD-QNR-03
      AppointmentCardState.done => QnrRowState.readonly, // CARD-QNR-04
      // 진료 시작 전: 작성 여부로 갈린다(작성 중 (a/t)는 T24 소급 필드가 오면 채운다).
      AppointmentCardState.confirmed ||
      AppointmentCardState.arrived ||
      AppointmentCardState.wait =>
        view.hasQuestionnaire ? QnrRowState.done : QnrRowState.todo, // CARD-QNR-01·02
      _ => null, // req·unconf·late·cancelled → 문진 줄 없음(CARD-CXL-07 등)
    };
    if (row == null) return const [];
    return [
      const SizedBox(height: 12),
      QuestionnaireRow(
        state: row,
        onTap: () => context.go('/questionnaire/${view.id}'), // NAV-HOME-05
      ),
    ];
  }

  List<Widget> _topNotices(AppointmentCardState s) => switch (s) {
        AppointmentCardState.req => const [
            WarnText('병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.'),
            SizedBox(height: 8),
          ],
        AppointmentCardState.unconf => const [
            WarnText('병원 확인이 끝나지 않았습니다'),
            SizedBox(height: 4),
            WarnText('병원에 연락해 주세요'),
            SizedBox(height: 8),
          ],
        AppointmentCardState.late => const [
            WarnText('병원에 연락해 주세요'), // CARD-LATE-04(마침표 없음)
            SizedBox(height: 8),
          ],
        _ => const [],
      };

  List<Widget> _actions(BuildContext context, AppointmentCardState s) {
    final buttons = switch (s) {
      AppointmentCardState.req => [
          _outline(context, '신청 취소', () => context.go('/appointments/${view.id}')),
        ],
      AppointmentCardState.confirmed => [
          _outline(context, '시간 변경', () => context.go('/appointments/${view.id}')), // CARD-OK-04
          _outline(context, '예약 취소', () => context.go('/appointments/${view.id}')),
        ],
      AppointmentCardState.done => [
          _outline(context, '방문 이력 보기', () => context.go('/history')), // CARD-DONE-04
        ],
      AppointmentCardState.cancelled => [
          _outline(context, '새로 예약하기', () => context.go('/booking')), // CARD-CXL-08
        ],
      AppointmentCardState.unconf || AppointmentCardState.late => [
          _outline(context, '상담 채팅 연결', () => context.go('/chat'),
              icon: Icons.chat_bubble_outline), // UNCONF-06 · CARD-LATE-05
          _outline(context, '병원 전화', _callHospital, icon: Icons.phone),
        ],
      _ => const <Widget>[],
    };
    if (buttons.isEmpty) return const [];
    return [
      const SizedBox(height: 12),
      Row(
        mainAxisAlignment: MainAxisAlignment.end, // 데모: 오른쪽 정렬
        children: [
          for (var i = 0; i < buttons.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            buttons[i],
          ],
        ],
      ),
    ];
  }

  Widget _outline(BuildContext context, String label, VoidCallback onTap, {IconData? icon}) {
    final style = OutlinedButton.styleFrom(
      foregroundColor: AppTokens.onSurface,
      side: const BorderSide(color: AppTokens.border),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
    );
    if (icon == null) {
      return OutlinedButton(style: style, onPressed: onTap, child: Text(label));
    }
    return OutlinedButton.icon(
      style: style,
      onPressed: onTap,
      icon: Icon(icon, size: 16, color: AppTokens.primary),
      label: Text(label),
    );
  }

  Future<void> _callHospital() async {
    final uri = Uri.parse('tel:02-1234-5678');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }
}
