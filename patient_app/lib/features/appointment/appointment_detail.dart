import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/connectivity.dart';
import '../../core/providers.dart';
import '../../widgets/action_button.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/offline_banner.dart';
import '../../core/tokens.dart';
import '../home/appointment_view.dart';
import '../home/home_data.dart' show hospitalInfoProvider, HospitalInfo;
import 'detail_sections.dart';
import 'reject_banner.dart';

/// 예약 상세의 한 화면 분량. 카드(T15/17)가 못 담는 것(정보 표·문진 내용·변경/취소 버튼)을 더한다.
/// - [view]: 상태·일시·대상·의사·과 등(T15/17 AppointmentView 재사용)
/// - [reason]: 방문이유(갭 #49 — 예약할 때 쓴 문장 그대로)
/// - [hospitalAddress]/[hospitalPhone]: 장소·전화(T4 get_hospital_info)
/// - [questionnaireStatus]: 'none'|'writable'|'readonly'(서버가 완료 문진 유무+진료 진입으로 정함)
/// - [supportRequestedAt]: 마감 후 취소를 이미 상담으로 넘긴 시각(있으면 다시 못 누름 — APPT-BTN-09)
/// - [updatedAt]: 낙관적 잠금(APPT-RACE-01) — 변경/취소가 이 값을 함께 보내 그 사이 병원·가족이 먼저 바꿨는지 판정
/// - [cancelRejectedAt]/[cancelRejectedReason]: 취소 반려 배너(CANCEL-REJ, 00027) — 직원웹 반려가 채우고 [확인]이 비운다
/// - [doctorId]/[departmentId]: 변경 마법사(T22)가 같은 의사/과의 빈 날짜·시간을 조회할 때 쓰는 UUID
/// - [cancellationDeadlineHours]: 마감 후 안내 팝업(CANCEL-LATE-02)의 「진료 시작 N시간 전까지만」 N
class AppointmentDetail {
  const AppointmentDetail({
    required this.view,
    this.reason,
    this.hospitalAddress,
    this.hospitalPhone,
    this.questionnaireStatus = 'none',
    this.supportRequestedAt,
    this.updatedAt,
    this.createdAt,
    this.cancelRejectedAt,
    this.cancelRejectedReason,
    this.doctorId,
    this.departmentId,
    this.cancellationDeadlineHours = 24,
  });

  final AppointmentView view;
  final String? reason;
  final String? hospitalAddress;
  final String? hospitalPhone;
  final String questionnaireStatus;
  final DateTime? supportRequestedAt;
  final DateTime? updatedAt;
  final DateTime? createdAt;
  final DateTime? cancelRejectedAt;
  final String? cancelRejectedReason;
  final String? doctorId;
  final String? departmentId;
  final int cancellationDeadlineHours;

  factory AppointmentDetail.fromJson(Map<String, dynamic> j, HospitalInfo? hospital) =>
      AppointmentDetail(
        view: AppointmentView.fromJson(j),
        reason: j['reason'] as String?,
        hospitalAddress: hospital?.address,
        hospitalPhone: hospital?.phone,
        questionnaireStatus: (j['questionnaire_status'] as String?) ?? 'none',
        supportRequestedAt: j['support_requested_at'] == null
            ? null
            : DateTime.parse(j['support_requested_at'] as String),
        updatedAt: j['updated_at'] == null ? null : DateTime.parse(j['updated_at'] as String),
        createdAt: j['created_at'] == null ? null : DateTime.parse(j['created_at'] as String),
        cancelRejectedAt: j['cancel_rejected_at'] == null
            ? null
            : DateTime.parse(j['cancel_rejected_at'] as String),
        cancelRejectedReason: j['cancel_rejected_reason'] as String?,
        doctorId: j['doctor_id'] as String?,
        departmentId: j['department_id'] as String?,
        cancellationDeadlineHours: (j['cancellation_deadline_hours'] as int?) ?? 24,
      );
}

/// GET /my/appointments/{id} + 병원 정보를 엮어 상세 한 화면을 만든다.
/// 없는 예약(다른 사람 것·지워짐)은 404 또는 빈 응답 → null(NAV-APPT-23).
/// **Task 20 완료 화면이 아니라 Task 22 변경/취소가 성공 후 이 provider를 invalidate해 다시 그린다.**
final appointmentDetailProvider =
    FutureProvider.autoDispose.family<AppointmentDetail?, String>((ref, id) async {
  final api = ref.read(apiClientProvider);
  Map<String, dynamic> j;
  try {
    j = await api.get('/my/appointments/$id', (x) => x as Map<String, dynamic>);
  } on ApiException catch (e) {
    if (e.statusCode == 404) return null; // 없는 예약 — 왜인지 캐묻지 않는다(개인정보 열거 방지)
    rethrow;
  }
  if (j.isEmpty) return null; // 서버가 {} 반환(내 것이 아님) → 없는 예약과 같게 처리
  final hospital = await ref.watch(hospitalInfoProvider.future);
  return AppointmentDetail.fromJson(j, hospital);
});

/// 변경/취소 버튼의 처리 중·실패 상태(APPT-BTN-11·12). 평소엔 AsyncData(null).
/// **Task 22가 변경/취소를 실행할 때 여기 상태를 밀어 넣는다**(AsyncLoading → AsyncData/AsyncError).
/// T21은 정의·소비만; 실제 실행은 T22.
final detailActionProvider =
    StateProvider.autoDispose.family<AsyncValue<void>, String>((ref, id) => const AsyncData(null));

/// 예약 상세 종점 화면. 홈 카드·나의 예약 줄·알림함이 전부 `/appointments/:id`로 여기로 온다.
/// [changed]가 true면 방금 변경을 마친 것 — 예약번호 새 발급 안내를 한 줄 얹는다(APPT-CHG-12·13).
class AppointmentDetailScreen extends ConsumerWidget {
  const AppointmentDetailScreen(this.id, {super.key, this.changed = false});
  final String id;
  final bool changed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    final detail = ref.watch(appointmentDetailProvider(id));
    return Scaffold(
      appBar: AppBar(title: const Text('예약 상세')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => EmptyState.error(
          onRetry: () => ref.invalidate(appointmentDetailProvider(id)),
        ),
        data: (d) {
          if (d == null) return const _NotFound(); // NAV-APPT-23
          final state = resolveCardState(d.view, DateTime.now());
          final cancelled = state == AppointmentCardState.cancelled;
          return Column(children: [
            if (!online) const OfflineBanner(), // NAV-APPT-22 — 화면 안 옮기고 보관본 유지
            Expanded(
              child: ListView(padding: EdgeInsets.zero, children: [
                DetailHeader(d, state),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                  child: Column(children: [
                    // 「놓치면 손해」 배너 — 병원발 변경(APPT-RACE-03)·취소 반려(CANCEL-REJ). 취소된 예약엔 얹지 않는다.
                    if (!cancelled) ...[
                      ChangeNoticeBanner(d),
                      CancelRejectBanner(d),
                    ],
                    // APPT-CHG-12·13 — 변경 완료 후 상세에 예약번호 새 발급 안내(팝업 아님).
                    if (changed && !cancelled) ...[
                      _ChangedNotice(),
                      const SizedBox(height: 16),
                    ],
                    InfoTable(d),
                    const SizedBox(height: 16),
                    DetailQr(d, state),
                    const SizedBox(height: 16),
                    QnrAccordion(d, state),
                  ]),
                ),
              ]),
            ),
            DetailButtonBar(d, state, online: online), // APPT-BTN-01 — 맨 아래 고정
          ]);
        },
      ),
    );
  }
}

/// APPT-CHG-12 — 변경 성공 뒤 상세 위 한 줄(결정 뒤에 말하면 걱정이 아니라 안내가 된다, APPT-CHG-13).
class _ChangedNotice extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTokens.primary.withValues(alpha: 0.10),
        border: Border.all(color: AppTokens.primary),
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Text('예약번호가 새로 발급되었습니다',
          style: TextStyle(fontWeight: FontWeight.w600, color: AppTokens.primary)),
    );
  }
}

/// NAV-APPT-23 — 찾을 수 없는 예약. 왜 없는지 설명하지 않고 목록으로 돌아갈 길만 준다.
class _NotFound extends StatelessWidget {
  const _NotFound();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        const Text('찾을 수 없는 예약입니다',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        ActionButton(
          label: '예약 목록 보기',
          busyLabel: '예약 목록 보기',
          onPressed: () => context.go('/my'), // 나의 예약 목록(T30) — 라우터의 실제 경로는 /my
        ),
      ]),
    );
  }
}
