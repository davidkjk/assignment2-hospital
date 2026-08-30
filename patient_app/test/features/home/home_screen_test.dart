import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/pending_request.dart';
import 'package:hospital_patient_app/features/home/appointment_card.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/features/home/home_realtime.dart';
import 'package:hospital_patient_app/features/home/home_screen.dart';
import 'package:hospital_patient_app/features/home/hospital_info_row.dart';
import 'package:hospital_patient_app/features/home/notification_bell.dart';
import 'package:hospital_patient_app/widgets/action_button.dart';
import 'package:hospital_patient_app/widgets/pending_request_card.dart';

AppointmentView _view(String id, String status, {String name = '본인'}) =>
    AppointmentView.fromJson({
      'id': id,
      'status': status,
      'for_patient_name': name,
      'is_self': name == '본인',
      'booking_code': 'A-$id',
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': '2030-08-18',
      'start_time': '14:00',
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

class _SpyRealtime implements HomeRealtime {
  bool subscribed = false;
  @override
  void subscribe(List<String> appointmentIds) {
    if (appointmentIds.isNotEmpty) subscribed = true;
  }

  @override
  void unsubscribe() {}
}

Widget _home(
  List<AppointmentView> appts, {
  Map<String, dynamic>? hospital,
  bool pending = false,
  HomeRealtime? realtime,
}) {
  return ProviderScope(
    overrides: [
      homeAppointmentsProvider.overrideWith((ref) async => appts),
      hospitalInfoProvider.overrideWith((ref) async => hospital == null
          ? null
          : HospitalInfo(
              address: hospital['hospital_address'] as String?,
              phone: hospital['hospital_phone'] as String?)),
      pendingRequestProvider.overrideWith(
          (ref) async => pending ? PendingRequest(PendingKind.book, DateTime(2026, 8, 18, 9)) : null),
      if (realtime != null) homeRealtimeProvider.overrideWithValue(realtime),
    ],
    child: const MaterialApp(home: HomeScreen()),
  );
}

void main() {
  testWidgets('[HOME-CARD-01] 그날 예약이 1건이면 큰 히어로 카드 하나', (t) async {
    await t.pumpWidget(_home([_view('1', '예약확정', name: '본인')]));
    await t.pumpAndSettle();
    expect(find.byType(AppointmentCard), findsOneWidget);
  });

  testWidgets('[HOME-CARD-02] 그날 예약이 2건 이상이면 풀 카드를 세로로 쌓는다(데모 정본)', (t) async {
    await t.pumpWidget(_home([_view('1', '예약확정', name: '본인'), _view('2', '예약확정', name: '김순자')]));
    await t.pumpAndSettle();
    expect(find.byType(AppointmentCard), findsNWidgets(2)); // 압축 줄이 아니라 풀 카드 2장
    expect(find.textContaining('김순자'), findsOneWidget); // 각 카드에 이름
  });

  testWidgets('[HOME-EMPTY-01] 0건이면 안내 + [진료 예약하기] + 지난 방문 이력 보기', (t) async {
    await t.pumpWidget(_home([]));
    await t.pumpAndSettle();
    expect(find.textContaining('예정된 예약이 없습니다'), findsOneWidget);
    expect(find.widgetWithText(ActionButton, '진료 예약하기'), findsOneWidget);
    expect(find.textContaining('지난 방문 이력 보기'), findsOneWidget);
  });

  testWidgets('[HOME-EMPTY-02] 빈 상태에 "최근 방문" 줄을 넣지 않는다', (t) async {
    await t.pumpWidget(_home([]));
    await t.pumpAndSettle();
    expect(find.textContaining('최근 방문'), findsNothing);
  });

  testWidgets('[HOME-INFO-01] 카드 아래 병원 주소·전화 두 줄', (t) async {
    await t.pumpWidget(
        _home([_view('1', '예약확정')], hospital: {'hospital_address': '서울 A', 'hospital_phone': '02-1'}));
    await t.pumpAndSettle();
    expect(find.textContaining('서울 A'), findsOneWidget);
    expect(find.textContaining('02-1'), findsOneWidget);
  });

  testWidgets('[HOME-INFO-02] 병원 정보 조회 실패면 조용히 숨기고 카드는 그대로', (t) async {
    await t.pumpWidget(_home([_view('1', '예약확정')], hospital: null)); // 조회 실패
    await t.pumpAndSettle();
    expect(find.byType(AppointmentCard), findsOneWidget); // 카드는 보인다
    expect(find.byType(HospitalInfoRow), findsNothing); // 정보 줄만 사라진다
  });

  testWidgets('[HOME-BAR-01] 앱바에 종 + 톱니 두 개, 햄버거 없음', (t) async {
    await t.pumpWidget(_home([_view('1', '예약확정')]));
    await t.pumpAndSettle();
    expect(find.byType(NotificationBell), findsOneWidget);
    expect(find.byIcon(Icons.settings), findsOneWidget);
    expect(find.byIcon(Icons.menu), findsNothing); // 햄버거 없음
  });

  testWidgets('[HOME-KILL-01] 결과 못 받은 신청이 있으면 카드 위에 안내 줄', (t) async {
    await t.pumpWidget(_home([_view('1', '예약확정')], pending: true));
    await t.pumpAndSettle();
    expect(find.byType(PendingRequestCard), findsOneWidget);
    expect(
        t.getTopLeft(find.byType(PendingRequestCard)).dy <
            t.getTopLeft(find.byType(AppointmentCard)).dy,
        isTrue); // 카드 위
  });

  testWidgets('[HOME-KILL-02] 0건 빈 상태에서도 미완료 신청 줄은 뜬다', (t) async {
    await t.pumpWidget(_home([], pending: true));
    await t.pumpAndSettle();
    expect(find.byType(PendingRequestCard), findsOneWidget); // "신청이 날아갔다"로 읽히지 않게
  });

  testWidgets('[HOME-REFRESH-02] 진료대기 카드가 있으면 실시간 구독을 연다', (t) async {
    final sub = _SpyRealtime();
    await t.pumpWidget(_home([_view('1', '진료대기')], realtime: sub));
    await t.pumpAndSettle();
    expect(sub.subscribed, isTrue);
  });

  testWidgets('[HOME-REFRESH-02] 끝난 카드만 있으면 실시간 구독을 열지 않는다', (t) async {
    final sub = _SpyRealtime();
    await t.pumpWidget(_home([_view('1', '진료완료')], realtime: sub));
    await t.pumpAndSettle();
    expect(sub.subscribed, isFalse);
  });
}
