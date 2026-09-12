import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/hospital_info_row.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('[HOME-INFO-01] 병원 주소·전화 두 줄을 보인다', (t) async {
    await t.pumpWidget(_wrap(const HospitalInfoRow(address: '서울 A', phone: '02-1')));
    expect(find.textContaining('서울 A'), findsOneWidget);
    expect(find.textContaining('02-1'), findsOneWidget);
  });

  testWidgets('[HOME-INFO-03][NAV-HOME-10] 주소를 누르면 지도 콜백이 불린다', (t) async {
    var mapOpened = false;
    await t.pumpWidget(_wrap(
        HospitalInfoRow(address: '서울 A', phone: '02-1', onTapAddress: () => mapOpened = true)));
    await t.tap(find.textContaining('서울 A'));
    expect(mapOpened, isTrue);
  });

  testWidgets('[HOME-INFO-03][NAV-HOME-09] 전화를 누르면 전화 콜백이 불린다', (t) async {
    var called = false;
    await t.pumpWidget(_wrap(
        HospitalInfoRow(address: '서울 A', phone: '02-1', onTapPhone: () => called = true)));
    await t.tap(find.textContaining('02-1'));
    expect(called, isTrue);
  });
}
