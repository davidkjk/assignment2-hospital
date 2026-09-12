import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/features/home/appointment_card.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/qr/brightness.dart';
import 'package:hospital_patient_app/features/qr/qr_fullscreen.dart';

/// QR 확대화면 진입(홈 작은 QR 탭)·이탈(X 닫기) 회귀. 실기기에서 "X가 안 닫힌다"·
/// "작은 QR을 눌러도 확대화면으로 안 간다"는 보고를 재현하려 만든 테스트.
/// - 홈 카드는 전체가 바깥 InkWell(→예약 상세)로 감싸여 있고 그 안에 작은 QR InkWell(→확대화면)이
///   중첩돼 있다. 중첩 탭에서 안쪽이 이겨야 한다(상세로 새지 않아야 한다).
/// - X(닫기) 버튼은 본문 스크롤/스와이프 레이어 위에 있어야 좁은 폰에서도 탭이 도달한다.

class _SpyBrightness implements BrightnessController {
  @override
  Future<void> max() async {}
  @override
  Future<void> restore() async {}
}

AppointmentView _confirmed({String id = 'a1', String code = '241401'}) {
  final slot = DateTime.now().add(const Duration(days: 1));
  return AppointmentView.fromJson({
    'id': id,
    'status': '예약확정',
    'for_patient_name': '김바이',
    'relation': '본인',
    'is_self': true,
    'booking_code': code,
    'department_name': '내과',
    'doctor_name': '이의사',
    'has_questionnaire': false,
    'slot_date': slot.toIso8601String().substring(0, 10),
    'start_time': '${slot.hour.toString().padLeft(2, '0')}:00',
    'hospital_change_prev_time': null,
    'hospital_change_kind': null,
  });
}

GoRouter _closeRouter(AppointmentView v, {bool online = true}) => GoRouter(
      initialLocation: '/home',
      routes: [
        GoRoute(
          path: '/home',
          builder: (c, s) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => c.push('/qr/${v.id}'),
                child: const Text('HOME_MARKER'),
              ),
            ),
          ),
        ),
        GoRoute(
          path: '/qr/:id',
          builder: (c, s) => QrFullscreenView(
            views: [v],
            initialIndex: 0,
            brightness: _SpyBrightness(),
            online: online,
          ),
        ),
      ],
    );

void main() {
  testWidgets('홈 작은 QR을 누르면 예약 상세가 아니라 확대화면(/qr)로 간다', (t) async {
    final v = _confirmed();
    final router = GoRouter(
      initialLocation: '/home',
      routes: [
        GoRoute(
          path: '/home',
          builder: (c, s) => Scaffold(
            body: SingleChildScrollView(
              // home_screen.dart:151 을 그대로 재현 — 카드 전체를 바깥 InkWell(→상세)로 감쌈
              child: InkWell(
                onTap: () => c.go('/appointments/${v.id}'),
                child: AppointmentCard(view: v),
              ),
            ),
          ),
        ),
        GoRoute(path: '/qr/:id', builder: (c, s) => const Text('QR_FULLSCREEN_MARKER')),
        GoRoute(path: '/appointments/:id', builder: (c, s) => const Text('DETAIL_MARKER')),
      ],
    );
    await t.pumpWidget(MaterialApp.router(routerConfig: router));
    await t.pumpAndSettle();

    final miniQr = find.byKey(ValueKey('qr-mini-${v.bookingCode}'));
    expect(miniQr, findsOneWidget, reason: '홈 카드에 작은 QR이 그려져야 한다');
    await t.tap(miniQr);
    await t.pumpAndSettle();

    expect(find.text('QR_FULLSCREEN_MARKER'), findsOneWidget, reason: '작은 QR 탭 → 확대화면');
    expect(find.text('DETAIL_MARKER'), findsNothing, reason: '바깥 InkWell이 탭을 먹으면 안 된다');
  });

  testWidgets('확대화면 X를 누르면 화면이 닫혀 홈으로 돌아온다 (iPhone 13 폭 390)', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(MaterialApp.router(routerConfig: _closeRouter(_confirmed())));
    await t.pumpAndSettle();
    await t.tap(find.text('HOME_MARKER'));
    await t.pumpAndSettle();
    expect(find.byType(QrFullscreenView), findsOneWidget);

    await t.tap(find.byTooltip('닫기'));
    await t.pumpAndSettle();
    expect(find.byType(QrFullscreenView), findsNothing, reason: 'X를 누르면 확대화면이 닫혀야 한다');
    expect(find.text('HOME_MARKER'), findsOneWidget);
  });

  testWidgets('오프라인 안내 띠가 있어도 X 닫기가 동작한다', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(MaterialApp.router(routerConfig: _closeRouter(_confirmed(), online: false)));
    await t.pumpAndSettle();
    await t.tap(find.text('HOME_MARKER'));
    await t.pumpAndSettle();
    expect(find.textContaining('인터넷 연결 없음'), findsOneWidget);

    await t.tap(find.byTooltip('닫기'));
    await t.pumpAndSettle();
    expect(find.byType(QrFullscreenView), findsNothing);
  });
}
