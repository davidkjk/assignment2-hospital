import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/tokens.dart';
import '../home/home_data.dart' show homeAppointmentsProvider;
import 'appointment_actions.dart';
import 'appointment_detail.dart';
import 'detail_sections.dart' show formatKoreanDateTime, openTel;

/// 확인창 안에서만 쓰는 빨강(CANCEL-PRE-04). 되돌릴 수 없는 동작의 색은 확인창 밖으로 새지 않는다.
const Color kDestructiveRed = Color(0xFFA3231C);

/// 마감 여부를 화면이 판정한다(변경 진입 게이트 APPT-CHG-19용). 취소는 서버(cancel_appointment)가
/// after_deadline으로 알려주므로 이 판정을 쓰지 않는다 — 변경은 서버 왕복 전에 갈래를 정해야 해서 필요하다.
/// 서버와 같은 규칙: 만든 지 30분 이내면 마감 무관 허용(CANCEL-NEW-04·07), 아니면 진료 시작 N시간 전까지만.
bool isAfterCancellationDeadline(AppointmentDetail d, DateTime now) {
  final created = d.createdAt;
  if (created != null && now.isBefore(created.add(const Duration(minutes: 30)))) {
    return false; // CANCEL-NEW: 갓 만든 예약은 마감과 무관하게 풀 수 있다
  }
  final slot = d.view.slotStart;
  if (slot == null) return false; // 시간 미정이면 막지 않는다
  final deadline = slot.subtract(Duration(hours: d.cancellationDeadlineHours));
  return now.isAfter(deadline);
}

/// APPT-RACE-08 — 상세만이 아니라 목록·홈까지 한 벌로 고친다(오프라인에서 취소된 예약이 되살아나지 않게).
void invalidateAppointment(WidgetRef ref, String id) {
  ref.invalidate(appointmentDetailProvider(id));
  ref.invalidate(homeAppointmentsProvider);
}

/// 취소 흐름 시작(CANCEL-PRE-01). 확인창 → cancel API → 마감 전이면 재그림, 마감 후면 안내 팝업.
/// 판정은 서버 응답(after_deadline)이 한다 — 화면은 결과만 소비(CANCEL-NEW도 서버가 즉시 취소로 처리).
Future<void> openCancelFlow(BuildContext context, WidgetRef ref, AppointmentDetail d) async {
  final id = d.view.id;
  final confirmed =
      await showDialog<bool>(context: context, builder: (_) => CancelConfirmDialog(d)); // CANCEL-PRE-01
  if (confirmed != true) return; // [아니요] — 아무 일도 없었던 것처럼(CANCEL-PRE-03)

  final action = ref.read(detailActionProvider(id).notifier);
  action.state = const AsyncLoading(); // APPT-BTN-11 처리 중 잠금
  try {
    final res = await ref.read(appointmentActionsProvider).cancel(id, d.updatedAt ?? DateTime.now());
    action.state = const AsyncData(null);
    if (res.afterDeadline) {
      // 마감 후(또는 30분 유예 밖) — 취소하지 않고 상담·전화로 연결(CANCEL-LATE / CANCEL-NEW-08).
      if (context.mounted) {
        await showDialog(context: context, builder: (_) => LateSupportDialog(d));
      }
    } else if (res.cancelled) {
      invalidateAppointment(ref, id); // CANCEL-PRE-07 — 화면 안 옮기고 취소된 상세로 재그림
    }
  } on ApiException catch (e) {
    if (e.statusCode == 409) {
      // APPT-RACE-02 — 그 사이 병원·가족이 먼저 바꿈. 화면 안 옮기고 재조회(배너는 최신 상세가 그림).
      invalidateAppointment(ref, id);
      action.state = const AsyncData(null); // APPT-RACE-07 — 다시 누를 수 있게
    } else {
      action.state = AsyncError(e, StackTrace.current); // APPT-BTN-12 인라인 오류
    }
  }
}

/// /appointments/:id/cancel 라우트 — 상세 [예약 취소]가 push하는 곳(NAV-APPT-12·T21 계약).
/// 화면을 얇게 두고 첫 프레임에 취소 흐름(확인창 → 서버 → 마감 전/후 분기)을 연 뒤, 끝나면 상세로 돌아간다.
class CancelLauncherScreen extends ConsumerStatefulWidget {
  const CancelLauncherScreen(this.id, {super.key});
  final String id;
  @override
  ConsumerState<CancelLauncherScreen> createState() => _CancelLauncherState();
}

class _CancelLauncherState extends ConsumerState<CancelLauncherScreen> {
  bool _started = false;
  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(appointmentDetailProvider(widget.id));
    return detail.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, __) => Scaffold(
          body: Center(child: TextButton(onPressed: () => context.pop(), child: const Text('돌아가기')))),
      data: (d) {
        if (d == null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) context.pop();
          });
          return const Scaffold(body: SizedBox.expand());
        }
        if (!_started) {
          _started = true;
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            await openCancelFlow(context, ref, d);
            if (!context.mounted) return;
            context.pop(); // 확인창/안내 팝업이 닫히면 상세로(CANCEL-PRE-07 재그림은 invalidate가 함)
          });
        }
        return const Scaffold(body: SizedBox.expand()); // 다이얼로그 barrier가 덮는 얇은 배경
      },
    );
  }
}

/// CANCEL-PRE — 마감 전 취소 확인창. 대상·일시를 다시 적고 [아니요]/[취소합니다]만(사유 입력·타이핑 없음).
class CancelConfirmDialog extends StatelessWidget {
  const CancelConfirmDialog(this.d, {super.key});
  final AppointmentDetail d;

  @override
  Widget build(BuildContext context) {
    final v = d.view;
    final label = v.status == '예약신청' ? '신청을 취소할까요?' : '예약을 취소할까요?';
    return AlertDialog(
      title: Text(label),
      // CANCEL-PRE-02 — 취소 대상 예약을 다시 적는다(다른 예약을 잘못 취소하는 사고 방지). 데모: 옅은 박스.
      content: Container(
        decoration: BoxDecoration(
          color: AppTokens.muted.withValues(alpha: 0.5),
          border: Border.all(color: const Color(0xFFE3E8EB)),
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${v.forPatientName} · ${v.relation}',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(formatKoreanDateTime(v.slotStart),
              style: const TextStyle(color: AppTokens.grayPending)),
          Text('${v.departmentName} · ${v.doctorName} 선생님',
              style: const TextStyle(color: AppTokens.grayPending)),
        ]),
      ),
      actions: [
        // CANCEL-PRE-03 — 왼쪽 [아니요](테두리) / 오른쪽 [취소합니다](빨강, 확인창 안에서만 CANCEL-PRE-04).
        OutlinedButton(
            onPressed: () => Navigator.pop(context, false), child: const Text('아니요')),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          style: TextButton.styleFrom(foregroundColor: kDestructiveRed),
          child: const Text('취소합니다'),
        ),
      ],
      // ⛔ CANCEL-PRE-05·06 — 취소 사유 입력칸·'취소' 타이핑 확인 없음.
    );
  }
}

/// CANCEL-LATE(취소) / APPT-CHG-19(변경) — 마감 후 안내 팝업. 상담 채팅 먼저·전화 나중 두 경로.
/// requestType으로 취소/변경을 갈라 문구와 support 저장 종류를 정한다(APPT-CHG-21 공통 창구).
class LateSupportDialog extends ConsumerWidget {
  const LateSupportDialog(this.d, {super.key, this.requestType = '취소'});
  final AppointmentDetail d;
  final String requestType; // '취소' | '변경'

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = d.view.id;
    final phone = d.hospitalPhone;
    return AlertDialog(
      title: Row(children: [
        const Icon(Icons.access_time_filled, color: AppTokens.warn),
        const SizedBox(width: 8),
        Expanded(child: Text('$requestType 마감 시간이 지났습니다')), // CANCEL-LATE-01 / APPT-CHG-19
      ]),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        // CANCEL-LATE-02·03 — 설정값 N시간(의사 이름은 안 붙인다).
        Text('진료 시작 ${d.cancellationDeadlineHours}시간 전까지만 앱에서 $requestType할 수 있습니다.',
            style: const TextStyle(color: AppTokens.grayPending)),
        const SizedBox(height: 12),
        const Text('상담 채팅으로 문의하시거나 병원으로 전화해 주세요.', // CANCEL-LATE-04 두 경로(채팅 먼저)
            style: TextStyle(color: AppTokens.grayPending)),
        if (phone != null && phone.isNotEmpty) ...[
          const SizedBox(height: 12),
          // CANCEL-LATE-06 — 전화번호는 테두리 상자(주 경로로 올리지 않고 누를 수 있게만).
          OutlinedButton(
            onPressed: () => openTel(phone),
            style: OutlinedButton.styleFrom(
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.all(12),
              side: const BorderSide(color: Color(0xFFE3E8EB)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: Row(children: [
              const Icon(Icons.phone, size: 20, color: AppTokens.primary),
              const SizedBox(width: 12),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('병원 전화',
                    style: TextStyle(fontWeight: FontWeight.w600, color: Colors.black)),
                Text(phone, style: const TextStyle(color: AppTokens.grayPending)),
              ]),
            ]),
          ),
        ],
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('닫기')), // CANCEL-LATE-07 빠져나갈 문
        FilledButton(
          // CANCEL-LATE-05 — 오른쪽 진한 딥틸 버튼(dialog actions라 ActionButton 전폭 대신 FilledButton).
          style: FilledButton.styleFrom(
              backgroundColor: AppTokens.primary, foregroundColor: Colors.white),
          onPressed: () async {
            final navigator = Navigator.of(context);
            final router = GoRouter.of(context);
            await ref.read(appointmentActionsProvider).requestSupport(id, requestType); // CANCEL-LATE-11
            navigator.pop();
            router.push('/chat?appointment=$id'); // CANCEL-LATE-08·10 — 바로 상담, 재확인 카드 없음
          },
          child: const Text('상담 채팅 연결'),
        ),
      ],
      // ⛔ CANCEL-LATE-13 — '취소 요청이 접수되었습니다' 류 금지(환자 노출 문구는 "상담(직원 확인)으로 연결"만).
    );
  }
}
