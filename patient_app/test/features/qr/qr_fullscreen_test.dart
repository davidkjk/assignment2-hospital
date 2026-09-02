import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/qr/brightness.dart';
import 'package:hospital_patient_app/features/qr/qr_fullscreen.dart';

class _SpyBrightness implements BrightnessController {
  bool maxed = false, restored = false;
  @override
  Future<void> max() async => maxed = true;
  @override
  Future<void> restore() async => restored = true;
}

AppointmentView _qv(String name, {String status = '예약확정', String? code = '241401', String id = 'a'}) {
  final slot = DateTime.now().add(const Duration(minutes: 10));
  return AppointmentView.fromJson({
    'id': id,
    'status': status,
    'for_patient_name': name,
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

Widget _wrap(Widget c) => MaterialApp(home: c);

void main() {
  testWidgets('[QR-TITLE-01] 제목은 대상자 이름 + 몇 번째인지', (t) async {
    await t.pumpWidget(_wrap(QrFullscreenView(
      views: [_qv('김도윤', id: 'a'), _qv('김순자', id: 'b')],
      initialIndex: 1,
      brightness: _SpyBrightness(),
    )));
    expect(find.text('김순자님'), findsOneWidget);
    expect(find.text('2 / 2'), findsOneWidget);
  });

  testWidgets('[QR-SWIPE-02] QR이 있는 예약만 넘긴다(취소는 건너뛴다)', (t) async {
    await t.pumpWidget(_wrap(QrFullscreenView(
      views: [
        _qv('본인', id: 'a'),
        _qv('취소', status: '병원취소', id: 'b'),
        _qv('김순자', id: 'c'),
      ],
      initialIndex: 0,
      brightness: _SpyBrightness(),
    )));
    expect(find.text('1 / 2'), findsOneWidget); // 취소 예약은 페이지에서 빠진다(총 2)
  });

  testWidgets('[QR-BRIGHT-01] 화면에 들어오면 밝기를 최대로 올린다', (t) async {
    final ctl = _SpyBrightness();
    await t.pumpWidget(_wrap(QrFullscreenView(views: [_qv('본인')], initialIndex: 0, brightness: ctl)));
    expect(ctl.maxed, isTrue);
  });

  testWidgets('[QR-BRIGHT-02] 화면을 떠나면 원래 밝기로 되돌린다', (t) async {
    final ctl = _SpyBrightness();
    await t.pumpWidget(_wrap(QrFullscreenView(views: [_qv('본인')], initialIndex: 0, brightness: ctl)));
    await t.pumpWidget(const SizedBox());
    expect(ctl.restored, isTrue);
  });

  testWidgets('[QR-MULTI-01] 한 번에 QR 하나만 그린다', (t) async {
    await t.pumpWidget(_wrap(QrFullscreenView(
      views: [_qv('본인', id: 'a'), _qv('김순자', id: 'b')],
      initialIndex: 0,
      brightness: _SpyBrightness(),
    )));
    expect(find.byType(QrImageView), findsOneWidget);
  });

  testWidgets('[QR-OK-02] QR 내용은 booking_code(6자리)이지 appointments.id(UUID)가 아니다', (t) async {
    await t.pumpWidget(_wrap(QrFullscreenView(
      views: [_qv('본인', code: '241401', id: 'uuid-1')],
      initialIndex: 0,
      brightness: _SpyBrightness(),
    )));
    // data는 private이라 코드 값을 담은 Key로 검증(UUID 'uuid-1'이 아니라 booking_code '241401').
    expect(find.byKey(const ValueKey('qr-241401')), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
  });

  testWidgets('[QR-OFF-01][QR-OFF-02] 오프라인에도 QR을 보이고 상단 안내를 넣는다', (t) async {
    await t.pumpWidget(_wrap(QrFullscreenView(
      views: [_qv('본인')],
      initialIndex: 0,
      brightness: _SpyBrightness(),
      online: false,
    )));
    expect(find.byType(QrImageView), findsOneWidget);
    expect(find.textContaining('인터넷 연결 없음'), findsOneWidget);
  });

  testWidgets('QR이 없는 목록이면 안내만 보인다', (t) async {
    await t.pumpWidget(_wrap(QrFullscreenView(
      views: [_qv('취소', status: '병원취소')],
      initialIndex: 0,
      brightness: _SpyBrightness(),
    )));
    expect(find.textContaining('표시할 접수 QR이 없습니다'), findsOneWidget);
  });
}
