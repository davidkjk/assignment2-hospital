import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/profile_status.dart';
import 'package:hospital_patient_app/core/router.dart';
import 'package:hospital_patient_app/core/session_guard.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';
import 'package:hospital_patient_app/features/home/appointment_card.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/features/home/home_screen.dart';
import 'package:hospital_patient_app/features/home/notification_bell.dart';
import 'package:hospital_patient_app/widgets/action_button.dart';

// NAV-HOME-07(잠긴 문진 줄은 안 눌린다)은 문진 줄 렌더링(CARD-QNR)이 T17·T23 소유라 여기서 검증하지 않는다
// — 라우트 표(/questionnaire/:id)만 잇는다. 카드가 문진 줄을 그리게 되면 그 태스크가 이 테스트를 더한다.

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

AppointmentView _changedView(String id) => AppointmentView.fromJson({
      'id': id,
      'status': '예약확정',
      'for_patient_name': '본인',
      'is_self': true,
      'booking_code': 'A-$id',
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': '2030-08-18',
      'start_time': '16:00',
      'hospital_change_prev_time': DateTime(2030, 8, 18, 14, 30).toIso8601String(),
      'hospital_change_kind': 'changed',
    });

class _SpyReadMarker implements NotificationReadMarker {
  bool markedAllRead = false;
  @override
  Future<void> markAllRead() async => markedAllRead = true;
}

Widget _app({
  required String initial,
  List<AppointmentView> appts = const [],
  NotificationReadMarker? readMarker,
}) {
  return ProviderScope(
    overrides: [
      homeAppointmentsProvider.overrideWith((ref) async => appts),
      hospitalInfoProvider.overrideWith((ref) async => null),
      // 인증 통과 + 프로필 완료로 두어 /home 접근을 막지 않는다(전역 redirect).
      effectiveAuthProvider.overrideWith((ref) => AuthStatus.signedIn),
      profileMissingProvider.overrideWith((ref) => false),
      homeAcknowledgeProvider.overrideWithValue((String id) async {}),
      if (readMarker != null) notificationReadMarkerProvider.overrideWithValue(readMarker),
    ],
    child: MaterialApp.router(routerConfig: buildAppRouter(initialLocation: initial)),
  );
}

void main() {
  testWidgets('[NAV-HOME-19] 로그인 후 홈에는 하단 탭 바가 있다', (t) async {
    await t.pumpWidget(_app(initial: '/home'));
    await t.pumpAndSettle();
    expect(find.byType(BottomNavigationBar), findsOneWidget);
  });

  testWidgets('[NAV-HOME-01] 홈에서 예약 카드를 누르면 예약 상세로 간다', (t) async {
    await t.pumpWidget(_app(initial: '/home', appts: [_view('a1', '예약확정')]));
    await t.pumpAndSettle();
    await t.tap(find.byType(AppointmentCard));
    await t.pumpAndSettle();
    expect(find.textContaining('예약 상세'), findsOneWidget); // /appointments/a1
    expect(find.byType(HomeScreen), findsNothing);
  });

  testWidgets('[NAV-HOME-14] 0건 빈 상태의 [진료 예약하기]는 예약으로 간다', (t) async {
    await t.pumpWidget(_app(initial: '/home', appts: []));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(ActionButton, '진료 예약하기'));
    await t.pumpAndSettle();
    expect(find.byType(HomeScreen), findsNothing); // /booking으로 이동
  });

  testWidgets('[NAV-HOME-12] 종을 누르면 알림함으로 가고, 들어온 순간 전부 읽음이다', (t) async {
    final marker = _SpyReadMarker();
    await t.pumpWidget(_app(initial: '/home', readMarker: marker));
    await t.pumpAndSettle();
    await t.tap(find.byType(NotificationBell));
    await t.pumpAndSettle();
    expect(marker.markedAllRead, isTrue); // NOTI-READ(T18 창구를 홈이 호출)
    expect(find.byType(HomeScreen), findsNothing); // /notifications로 이동
  });

  testWidgets('[NAV-HOME-15] 병원발 변경 [확인]은 화면을 옮기지 않고 홈에 머문다', (t) async {
    await t.pumpWidget(_app(initial: '/home', appts: [_changedView('a1')]));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(ActionButton, '확인'));
    await t.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget); // 여전히 홈(이동 없음)
  });
}
