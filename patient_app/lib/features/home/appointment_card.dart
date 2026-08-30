import 'package:flutter/material.dart';
import '../../core/tokens.dart';
import '../../core/wait_format.dart';
import '../../widgets/action_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/warn_text.dart';
import 'appointment_view.dart';
import 'card_bodies_a.dart';
import 'hospital_change_banner.dart';
import 'status_badge.dart';

/// 예약 카드(데모 StatusCard 정본). 위에서부터: 병원발 안내문 → 흰 카드[머리(이름·관계 / 시각·과·의사) +
/// 번호 줄 + 가운데 132 tint 박스 + 버튼]. 상태가 바뀌면 가운데 박스만 갈아 끼운다(CARD-COMMON-06).
/// 상태 B(도착·진료중·완료·취소·지연) 본문은 T17이 같은 위젯에 케이스를 더한다.
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
        // 병원발 변경/취소 안내문 — 카드 위에 얹는다(상태와 직교, CARD-CHG-01·05).
        if (view.hospitalChangePrevTime != null) ...[
          HospitalChangeBanner(view: view, onConfirm: onAcknowledge),
          const SizedBox(height: 8),
        ],
        // 상태별 상단 안내(REQ-04 · UNCONF-04·04b) — 원인을 먼저, 할 일을 나중에.
        ..._topNotices(state),
        // 흰 카드 프레임(데모 Card).
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
                        Text('${view.forPatientName} · ${view.isSelf ? '본인' : '가족'}',
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
                  StatusBadge(label: patientStatusLabel(state), color: patientBadgeColor(state)),
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
              AppCard(body: _cardBody(state)),
              // 아래: 상태별 버튼.
              ..._actions(context, state),
            ],
          ),
        ),
      ],
    );
  }

  Widget _cardBody(AppointmentCardState s) => switch (s) {
        AppointmentCardState.req => const ReqBody(),
        AppointmentCardState.wait => WaitBody(queue: queue),
        AppointmentCardState.unconf => const UnconfBody(),
        _ => const SizedBox.shrink(), // 상태 B — T17이 채운다
      };

  List<Widget> _topNotices(AppointmentCardState s) => switch (s) {
        // REQ-04: 병원이 확인하는 중임을 알린다(소요 시간을 약속하지 않는다 — REQ-05).
        AppointmentCardState.req => const [
            WarnText('병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.'),
            SizedBox(height: 8),
          ],
        // UNCONF-04·04b: 원인(위) → 할 일(아래).
        AppointmentCardState.unconf => const [
            WarnText('병원 확인이 끝나지 않았습니다'),
            SizedBox(height: 4),
            WarnText('병원에 연락해 주세요'),
            SizedBox(height: 8),
          ],
        _ => const [],
      };

  List<Widget> _actions(BuildContext context, AppointmentCardState s) => switch (s) {
        // UNCONF-06: 상담 채팅 연결 · 병원 전화. [다시 예약하기] 없음(UNCONF-06b, 중복 예약 방지).
        AppointmentCardState.unconf => [
            const SizedBox(height: 12),
            ActionButton(label: '상담 채팅 연결', busyLabel: '연결 중…', onPressed: () {}),
            const SizedBox(height: 8),
            ActionButton(label: '병원 전화', busyLabel: '연결 중…', onPressed: () {}),
          ],
        _ => const [],
      };
}
