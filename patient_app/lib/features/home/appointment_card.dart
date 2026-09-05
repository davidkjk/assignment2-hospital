import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
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
          // 데모 <Card>: 테두리 없이 rounded-xl + --elevation-card 그림자만(흰 배경 위에 떠 보이게).
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14), // 데모 rounded-xl = --radius(10) * 1.4
            boxShadow: AppTokens.cardElevation, // 데모 --elevation-card
          ),
          // 데모 Card py-4(상하 16) + 헤더·콘텐츠 px-4(좌우 16) = 사방 16.
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── CardHeader(px-4, gap-2) ──
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
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
                              Text('${view.forPatientName} · ${view.relation}', // CARD-COMMON-01: 관계 문자열
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis, // 데모 truncate — 긴 이름은 한 줄로 자른다
                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                              if (view.slotStart != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4), // 데모 mt-1
                                  child: Text.rich(TextSpan(children: [
                                    TextSpan(
                                        text: formatSlotTime24(view.slotStart!), // 데모 홈=24h('14:00'). 상세만 12h
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
                    const SizedBox(height: 8), // 데모 CardHeader gap-2
                    // 번호 줄 + 아래 구분선(COMMON-02/03) — 데모 border-b pb-3.
                    Container(
                      decoration: const BoxDecoration(
                        border: Border(bottom: BorderSide(color: AppTokens.border)),
                      ),
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text('$numberLabel ${view.bookingCode ?? ''}',
                          style: const TextStyle(color: AppTokens.grayPending, fontSize: 14)), // 데모 text-sm
                    ),
                  ],
                ),
              ),
              // 데모: Card gap-4(16) + CardContent pt-4(16) = 헤더 구분선과 본문 박스 사이 넉넉한 32.
              const SizedBox(height: 32),
              // ── CardContent(px-4, space-y-3) ──
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
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
    // 진료 진입 전(confirmed·arrived·wait)만 미작성/작성 중/작성완료로 갈리고, 그 외는 자물쇠·눈·없음.
    final bool showsQnr = s == AppointmentCardState.confirmed ||
        s == AppointmentCardState.arrived ||
        s == AppointmentCardState.wait ||
        s == AppointmentCardState.inTreatment ||
        s == AppointmentCardState.done;
    if (!showsQnr) return const []; // req·unconf·late·cancelled → 문진 줄 없음(CARD-CXL-07 등)
    // 갭 #50: 서버 questionnaire_state로 갈린다(has_questionnaire 아님) — 1문항만 써도 작성완료로 안 보인다.
    final row = resolveQnrRow(view.questionnaireState,
        inTreatment: s == AppointmentCardState.inTreatment, finished: s == AppointmentCardState.done);
    return [
      const SizedBox(height: 12),
      QuestionnaireRow(
        state: row,
        answered: view.questionnaireAnswered, // 작성 중일 때만 (a/t)로 쓰인다(QNR-PROG-09)
        total: view.questionnaireTotal,
        onTap: () => context.go('/questionnaire/${view.id}'), // NAV-HOME-05
      ),
    ];
  }

  List<Widget> _topNotices(AppointmentCardState s) => switch (s) {
        AppointmentCardState.req => const [
            // 결정 317: 주의색 + 좌측 4px 바 + 시계(상세 배너와 통일). 데모 AttentionNotice=바+Clock3.
            WarnText('병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.',
                icon: AppIcons.access_time_filled),
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
              icon: AppIcons.chat_bubble), // UNCONF-06 · CARD-LATE-05
          _outline(context, '병원 전화', _callHospital, icon: AppIcons.phone),
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
