import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/qr/brightness.dart';
import 'package:hospital_patient_app/features/qr/qr_fullscreen.dart';

class _NoopBrightness implements BrightnessController {
  @override
  Future<void> max() async {}
  @override
  Future<void> restore() async {}
}

AppointmentView _v(String name, {String id = 'a', String code = '241401'}) {
  // 골든은 결정적이어야 한다 — now-상대값은 다른 날 재실행 때 날짜가 바뀌어 픽셀이 어긋난다. 고정 미래 날짜로.
  final slot = DateTime(2030, 5, 20, 14, 0);
  return AppointmentView.fromJson({
    'id': id,
    'status': '예약확정',
    'for_patient_name': name,
    'relation': '본인',
    'is_self': true,
    'booking_code': code,
    'department_name': '안과',
    'doctor_name': '오세림',
    'has_questionnaire': false,
    'slot_date': slot.toIso8601String().substring(0, 10),
    'start_time': '14:00',
    'hospital_change_prev_time': null,
    'hospital_change_kind': null,
  });
}

void main() {
  setUpAll(() async {
    final gothic = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (gothic.existsSync()) {
      await (FontLoader('Roboto')
            ..addFont(Future.value(gothic.readAsBytesSync().buffer.asByteData())))
          .load();
    }
    final icons = File(
        '/Users/kimjunkee/dev/flutter/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
    if (icons.existsSync()) {
      await (FontLoader('MaterialIcons')
            ..addFont(Future.value(icons.readAsBytesSync().buffer.asByteData())))
          .load();
    }
  });

  testWidgets('qr fullscreen golden (데모 대조용)', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(MaterialApp(
      home: QrFullscreenView(
        views: [_v('박말순', id: 'a', code: '241401'), _v('김순자', id: 'b', code: '241502')],
        initialIndex: 0,
        brightness: _NoopBrightness(),
      ),
    ));
    await t.pumpAndSettle();
    await expectLater(find.byType(QrFullscreenView), matchesGoldenFile('goldens/qr_fullscreen.png'));
  });
}
