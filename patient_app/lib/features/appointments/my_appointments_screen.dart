import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart'; // homeAppointmentsProvider(재조회 대상)
import 'package:hospital_patient_app/features/appointments/my_appointments_data.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_row.dart';

/// 나의 예약 목록(하단 '예약' 탭). LIST-ROLE-01: 목록이다 — 예약을 '시작'하는 곳이 아니다.
/// 라우터 경로는 `/my`(기존 관례 — 홈 HOME-KILL·상세·탈퇴가 이미 여기로 온다).
class MyAppointmentsScreen extends ConsumerWidget {
  final Widget? bottomSlot; // T31: LIST-CTA 하단 버튼
  final Widget Function(AppointmentView)? questionnaireBuilder; // T31: LIST-QNR 문진 경고 줄
  const MyAppointmentsScreen({super.key, this.bottomSlot, this.questionnaireBuilder});

  // NAV-LIST-02: 줄 본문 → 상세 / NAV-LIST-04: 문진 줄 → 문진 / NAV-LIST-05·06: CTA → 예약 1단계.
  // push로 연다 — 뒤로 오면 들어온 자리(목록)로 돌아온다(NAV-LIST-08·09).
  static void openDetail(BuildContext c, String id) => c.push('/appointments/$id');
  static void openQuestionnaire(AppointmentView v) =>
      _rootCtx!.push('/questionnaire/${v.id}'); // 상세를 거치지 않는다(NAV-LIST-04)
  static void startBooking(BuildContext c) => c.go('/booking'); // NAV-BOOK-01: 언제나 처음부터
  // NAV-LIST-07: [다시 시도]는 화면을 옮기지 않고 그 자리에서 다시 조회한다(재조회=조회 원본 무효화).
  static void retry(WidgetRef ref) => ref.invalidate(homeAppointmentsProvider);
  static BuildContext? _rootCtx;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    _rootCtx = context;
    final async = ref.watch(upcomingListProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('예약')),
      body: async.when(
        // 빈 상태·오프라인·실패(LIST-EMPTY)와 당겨서 새로고침(LIST-REFRESH)은 T31이 이 세 분기를 채운다.
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => const SizedBox.shrink(), // T31: EmptyState.error/offline
        data: (list) {
          if (list.isEmpty) return const SizedBox.shrink(); // T31: EmptyState.zero + CTA
          final sections = groupByDate(list);
          return ListView(children: [
            for (final sec in sections) ...[
              _DateHeader(date: sec.date, count: sec.items.length), // LIST-LIST-04·05
              for (final v in sec.items)
                AppointmentBox(
                  view: v,
                  now: DateTime.now(),
                  onTap: () => openDetail(context, v.id), // LIST-LIST-14·NAV-LIST-02
                  questionnaireSlot: questionnaireBuilder?.call(v), // T31 슬롯(NAV-LIST-04 배선은 slot이 openQuestionnaire 호출)
                ),
            ],
          ]);
        },
      ),
      bottomNavigationBar: bottomSlot, // T31: LIST-CTA(하단 큰 버튼 하나)
    );
  }
}

/// LIST-LIST-04·05: '8월 3일 (월)' + 그날 건수 + 가로줄. 오늘도 예외 없이 날짜로 쓴다('오늘'로 바꾸지 않는다).
/// NAV-LIST-03: 헤더는 탭 대상이 아니다(InkWell로 감싸지 않는다).
class _DateHeader extends StatelessWidget {
  final DateTime date;
  final int count;
  const _DateHeader({required this.date, required this.count});
  static const _dow = ['월', '화', '수', '목', '금', '토', '일'];
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Row(children: [
          Text('${date.month}월 ${date.day}일 (${_dow[date.weekday - 1]})',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          const SizedBox(width: 8),
          Text('$count건', style: const TextStyle(color: Color(0xFF7E8E99), fontSize: 13)),
          const SizedBox(width: 12),
          const Expanded(child: Divider()),
        ]),
      );
}
