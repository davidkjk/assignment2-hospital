import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'add_harness.dart';

/// 실제 흐름대로 폼을 채우고 [인증번호 받기]로 인증 화면에 도착한다 — draft가 이때 채워진다.
Future<AddHarness> _openOtp(
  WidgetTester t, {
  FakeFamilyAddRepo? addRepo,
  String name = '김영수',
  String phone = '01000005678',
  String? relation, // null이면 폼 기본값('어머니')
}) async {
  final h = await pumpLinkForm(t, addRepo: addRepo);
  await t.enterText(find.byType(TextField).at(0), name);
  await t.enterText(find.byType(TextField).at(1), '1948-05-20');
  await t.enterText(find.byType(TextField).at(2), phone);
  if (relation != null) {
    await t.tap(find.text('기타 +'));
    await t.pump();
    await t.enterText(find.byType(TextField).at(3), relation);
  }
  await t.tap(find.text('인증번호 받기'));
  await t.pumpAndSettle();
  return h;
}

Future<void> _enterCode(WidgetTester t, String code) async {
  final boxes = find.byType(TextField);
  for (var i = 0; i < 6; i++) {
    await t.enterText(boxes.at(i), code[i]);
  }
  await t.pump();
}

void main() {
  testWidgets('[FAM-LINK-04][FAM-LINK-05] 6자리·5:00 · 마스킹된 그분 번호', (t) async {
    await _openOtp(t, phone: '01000005678');
    expect(find.byType(TextField), findsNWidgets(6));
    expect(find.textContaining('5:00'), findsOneWidget);
    expect(find.textContaining('010-****-5678'), findsOneWidget); // AUTH-OTP-06
  });

  testWidgets('[FAM-LINK-11][FAM-LINK-12] 앱은 「대상이 있나」를 스스로 판정하지 않는다', (t) async {
    final h = await _openOtp(t);
    // 화면이 가진 것은 request_id뿐 — 후보 존재 여부를 담은 값이 아예 없다.
    expect(h.addRepo.requestCalls.length, 1);
    expect(find.textContaining('확인되었습니다'), findsNothing);
    expect(h.addRepo.confirmCalls, isEmpty); // 코드를 넣기 전에는 연결이 일어나지 않는다
  });

  testWidgets('[FAM-LINK-13][FAM-LINK-18][FAM-LINK-19][FAM-LINK-20] 문자가 안 와도 막다른 길이 아니다', (t) async {
    final h = await _openOtp(t);
    expect(find.text('휴대폰이 없는 가족인가요?'), findsOneWidget); // T13 AUTH-OTP-11 링크
    await t.tap(find.text('휴대폰이 없는 가족인가요?'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/settings/hospital'); // 죽어 있던 링크를 이었다
  });

  testWidgets('[FAM-LINK-21][NAV-FAM-11] 인증 성공 → 가족 목록에 새 카드, 관계는 입력한 값', (t) async {
    final h = await _openOtp(t, relation: '어머니');
    final before = h.listRepo.listCallCount;
    await _enterCode(t, '123456');
    await t.tap(find.text('확인'));
    await t.pumpAndSettle();
    expect(h.addRepo.confirmCalls.single.code, '123456');
    expect(h.addRepo.requestCalls.single.relation, '어머니'); // 관계는 요청 때 실려 서버가 보관
    expect(h.lastRoute, '/family'); // NAV-FAM-11
    expect(h.listRepo.listCallCount, greaterThan(before)); // 새 카드가 목록에 있다
  });

  testWidgets('[NAV-FAM-10] 뒤로 가면 정보 입력 화면이고 값이 그대로 있다', (t) async {
    final h = await _openOtp(t, name: '김영수', phone: '01000005678');
    await t.pageBack();
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family/add/link');
    expect(find.text('김영수'), findsOneWidget); // 다시 치게 하지 않는다
    expect(find.text('01000005678'), findsOneWidget);
  });

  testWidgets('[FAM-LINK-22] 도착 시 번호 쿨다운이 이어져 [다시 받기]가 카운트다운으로 잠겨 있다', (t) async {
    await _openOtp(t, phone: '01000005678');
    // 폼에서 시작한 30초 쿨다운이 번호 기준으로 인증 화면에도 이어진다(BTN-COOL-04·05).
    expect(find.textContaining('초 후 다시 받기'), findsOneWidget);
  });
}
