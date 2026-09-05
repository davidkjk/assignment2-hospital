import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/widgets/app_icons.dart';

void main() {
  test('[DISP-ICON-01] 막힌 기능(진료중 이후 잠김)은 자물쇠 아이콘', () {
    expect(appIcon(AppIconKind.blocked), AppIcons.lock);
  });
  test('[DISP-ICON-02] 보기 전용(진료완료·이력)은 눈 아이콘', () {
    expect(appIcon(AppIconKind.readonly), AppIcons.visibility);
  });
  test('[DISP-ICON-03] 아이콘은 채움 벡터 IconData다 — 이모지(String) 금지', () {
    final icon = appIcon(AppIconKind.blocked);
    expect(icon, isA<IconData>());
    expect(icon.fontFamily, 'PhosphorFill'); // 벡터 폰트 아이콘(이모지 아님)
  });
}
