import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../support/golden_fonts.dart';
import 'package:hospital_patient_app/features/home/appointment_card.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';


// Task 17 골든 게이트 — 상태 B 카드 7종을 한 화면에 세로로 쌓아 데모 StatusCard 갤러리와 눈대조한다.
// 한글(AppleGothic) + 아이콘(MaterialIcons)을 로드해 tofu 없이 렌더한다.

void main() {
  setUpAll(() async {
    await loadGoldenFonts();
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

  // 고정 시각으로 결정론적 렌더(DateTime.now() 배제 — 표시 시각·late 판정이 실행마다 바뀌지 않게).
  final now = DateTime(2026, 8, 18, 15, 0);
  AppointmentView gv(String status, String name, String time,
      {String relation = '본인',
      bool isSelf = true,
      String? code = '241401',
      bool hasQuestionnaire = false,
      String? cancelledBy}) =>
      AppointmentView.fromJson({
        'id': status,
        'status': status,
        'for_patient_name': name,
        'relation': relation,
        'is_self': isSelf,
        'booking_code': code,
        'department_name': '안과',
        'doctor_name': '오세림',
        'has_questionnaire': hasQuestionnaire,
        'slot_date': '2026-08-18',
        'start_time': time,
        'hospital_change_prev_time': null,
        'hospital_change_kind': null,
        'cancelled_by': cancelledBy,
        'cancelled_at': cancelledBy != null ? DateTime(2026, 8, 18, 9).toIso8601String() : null,
      });

  testWidgets('card gallery golden (상태 B 데모 대조용)', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 2400));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final cards = <AppointmentView>[
      gv('예약확정', '박말순', '15:30', relation: '어머니', isSelf: false, code: '241401'), // 확정(유예 전)
      gv('도착', '김민준', '15:00', relation: '아들', isSelf: false, code: '241502'),
      gv('진료중', '김순자', '15:00', hasQuestionnaire: true, code: '241503'),
      gv('진료완료', '김순자', '14:00', hasQuestionnaire: true, code: '241504'),
      gv('병원취소', '박말순', '15:00', relation: '어머니', isSelf: false, cancelledBy: 'hospital'),
      gv('예약확정', '김순자', '14:00', code: '241505'), // 14:00 + now 15:00 → +30분 경과 → late(⑨)
    ];
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        backgroundColor: const Color(0xFFEFF3F4),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              for (final v in cards)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: AppointmentCard(view: v, now: now),
                ),
            ],
          ),
        ),
      ),
    ));
    await t.pumpAndSettle();
    await expectLater(find.byType(Scaffold), matchesGoldenFile('goldens/card_gallery.png'));
  });
}
