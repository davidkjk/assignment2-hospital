import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/offline_cache.dart'; // upcomingCacheProvider(isStale)
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart'; // homeAppointmentsProvider(재조회 대상)
import 'package:hospital_patient_app/features/appointments/my_appointments_data.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_row.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_cta.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_qnr_line.dart';
import 'package:hospital_patient_app/widgets/empty_state.dart';
import 'package:hospital_patient_app/widgets/patient_app_bar.dart';

/// 나의 예약 목록(하단 '예약' 탭, 경로 `/my`). LIST-ROLE-01: 목록이다 — 예약을 '시작'하는 곳이 아니다.
/// T30이 셸·줄·상태 글자를 세웠고, T31이 빈/오프라인/실패·갱신·문진 줄·하단 버튼을 채운다.
class MyAppointmentsScreen extends ConsumerStatefulWidget {
  final Widget? bottomSlot; // 주어지면 이것, 없으면 기본 AppointmentListCta(T31 LIST-CTA)
  final Widget Function(AppointmentView)?
      questionnaireBuilder; // 주어지면 이것, 없으면 기본 LIST-QNR 줄
  const MyAppointmentsScreen(
      {super.key, this.bottomSlot, this.questionnaireBuilder});

  // NAV-LIST-02: 줄 본문 → 상세 / NAV-LIST-04: 문진 줄 → 문진 / NAV-LIST-05·06: CTA → 예약 1단계.
  // push로 연다 — 뒤로 오면 들어온 자리(목록)로 돌아온다(NAV-LIST-08·09).
  static void openDetail(BuildContext c, String id) =>
      c.push('/appointments/$id');
  static void openQuestionnaire(AppointmentView v) =>
      _rootCtx!.push('/questionnaire/${v.id}'); // 상세를 거치지 않는다(NAV-LIST-04)
  static void startBooking(BuildContext c) =>
      c.go('/booking'); // NAV-BOOK-01: 언제나 처음부터
  // NAV-LIST-07: [다시 시도]는 화면을 옮기지 않고 그 자리에서 다시 조회한다(재조회=조회 원본 무효화).
  static void retry(WidgetRef ref) => ref.invalidate(homeAppointmentsProvider);
  static BuildContext? _rootCtx;

  @override
  ConsumerState<MyAppointmentsScreen> createState() =>
      _MyAppointmentsScreenState();
}

class _MyAppointmentsScreenState extends ConsumerState<MyAppointmentsScreen> {
  StreamSubscription<void>? _rtSub;
  UpcomingRealtime? _rt;

  @override
  void dispose() {
    _rtSub?.cancel();
    _rt?.setActive(false); // 화면을 떠나면 구독을 붙잡지 않는다
    super.dispose();
  }

  // LIST-REFRESH-02·03: 활성 예약이 있으면 실시간 갱신 구독, 이벤트가 오면 재조회(→ A등급 자동 반영).
  void _wireRealtime(bool hasActive) {
    final rt = ref.read(upcomingRealtimeProvider);
    if (!identical(_rt, rt)) {
      _rtSub?.cancel();
      _rt = rt;
      _rtSub =
          rt.events.listen((_) => ref.invalidate(homeAppointmentsProvider));
    }
    rt.setActive(hasActive);
  }

  void _invalidate() => ref.invalidate(homeAppointmentsProvider);

  @override
  Widget build(BuildContext context) {
    MyAppointmentsScreen._rootCtx = context;
    final raw = ref.watch(homeAppointmentsProvider);
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    final stale =
        ref.watch(upcomingCacheProvider).valueOrNull?.isStale ?? false;

    final content = raw.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      // ⛔ 분기 순서 error → offline → (online: empty | list): 오프라인·실패가 0건 화면으로 새지 않게(LIST-EMPTY-09).
      error: (e, _) {
        _wireRealtime(false);
        // LIST-EMPTY-08·10: 실패는 오프라인과 같은 모양. 예외 원문(Text('$e'))을 찍지 않는다.
        return Center(child: EmptyState.error(onRetry: _invalidate));
      },
      data: (nullable) {
        if (nullable == null) {
          // 오프라인 + 보관본 없음 → 「모르는 것」(0건이 아니다, LIST-EMPTY-07·09).
          _wireRealtime(false);
          return Center(
              child:
                  EmptyState.offline(screenName: '예약', onRetry: _invalidate));
        }
        final list = filterUpcoming(nullable);
        _wireRealtime(
            list.isNotEmpty); // 활성(앞으로 갈 예약)이 있을 때만 구독(LIST-REFRESH-02)
        if (list.isEmpty) {
          if (!online) {
            // 오프라인인데 보관본에 살아 있는 예약이 없음 → offline 화면(0건 아님, LIST-EMPTY-09).
            return Center(
                child:
                    EmptyState.offline(screenName: '예약', onRetry: _invalidate));
          }
          // 온라인 0건 → 사실 안내(실패 아님) + [다시 시도] 없음 + 최근 방문 없음(LIST-EMPTY-01·02·03).
          return EmptyState.zero(
            message: '예약된 진료가 없습니다',
            hint: '가까운 날짜로 예약하실 수 있습니다',
          );
        }
        final sections = groupByDate(list);
        final now = DateTime.now();
        return RefreshIndicator(
          onRefresh: () async => _invalidate(), // LIST-REFRESH-01: 당겨서 새로고침
          child: ListView(
            key: const PageStorageKey(
                'my-appointments'), // LIST-REFRESH-05: 상세에서 돌아오면 같은 스크롤 위치
            children: [
              // LIST-EMPTY-04·05 오프라인 띠는 전역 셸(AppShell)이 맨 위에 얹는다(NAV-GLOBAL-01) — 여기선 중복 금지.
              if (!online && stale)
                const _StaleWarning(), // LIST-EMPTY-06: 24시간 초과 경고 한 번(줄마다 아님)
              for (final sec in sections) ...[
                _DateHeader(
                    date: sec.date, count: sec.items.length), // LIST-LIST-04·05
                for (final v in sec.items)
                  AppointmentBox(
                    view: v,
                    now: now,
                    onTap: () => MyAppointmentsScreen.openDetail(
                        context, v.id), // NAV-LIST-02
                    questionnaireSlot: widget.questionnaireBuilder != null
                        ? widget.questionnaireBuilder!(v)
                        : appointmentListQnrLine(v,
                            onOpen: () =>
                                MyAppointmentsScreen.openQuestionnaire(
                                    v)), // 기본 LIST-QNR 줄
                  ),
              ],
            ],
          ),
        );
      },
    );

    return Scaffold(
      // LIST-ROLE: 탭 화면 타이틀은 「나의 예약」(데모 정본) + 📅 아이콘(하단 탭 '예약'과 짝).
      appBar: PatientAppBar(title: '나의 예약', icon: Icons.event_available),
      body: content,
      // LIST-CTA-01·02·03: 어느 분기든 하단에 「+ 새 예약하기」 하나(0건에도 있어야 막다른 길이 아니다).
      bottomNavigationBar: widget.bottomSlot ??
          AppointmentListCta(
              offline: !online, onNewBooking: () => context.go('/booking')),
    );
  }
}

/// LIST-EMPTY-06(=OFF-STALE-01): 보관본이 24시간을 넘겼을 때 화면 위쪽에 한 번 뜨는 경고.
class _StaleWarning extends StatelessWidget {
  const _StaleWarning();
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        color: const Color(0xFFFFF4E5),
        child: const Text('시간이 지난 정보일 수 있어요. 연결되면 새로 확인해 주세요.',
            style: TextStyle(color: Color(0xFFB44E00), fontSize: 13)),
      );
}

/// LIST-LIST-04·05: '8월 3일 (월)' + 그날 건수 + 가로줄. 오늘도 예외 없이 날짜로 쓴다('오늘'로 바꾸지 않는다).
/// NAV-LIST-03: 헤더는 탭 대상이 아니다(InkWell로 감싸지 않는다).
class _DateHeader extends StatelessWidget {
  final DateTime date;
  final int count;
  const _DateHeader({required this.date, required this.count});
  static const _dow = ['월', '화', '수', '목', '금', '토', '일'];
  @override
  // 데모 MyAppointments: 헤더 아래 밑줄(`border-b pb-2 mb-2`) — 텍스트 옆 가로줄이 아니라 헤더 전체를 밑줄로 구분.
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8), // mb-2
        child: Container(
          padding: const EdgeInsets.only(bottom: 8), // pb-2
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Color(0xFFD5DBDF))), // AppTokens.border
          ),
          child: Row(children: [
            Text('${date.month}월 ${date.day}일 (${_dow[date.weekday - 1]})',
                style:
                    const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(width: 8),
            Text('$count건',
                style: const TextStyle(color: Color(0xFF7E8E99), fontSize: 13)),
          ]),
        ),
      );
}
