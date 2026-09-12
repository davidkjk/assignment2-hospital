import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'add_harness.dart';

// TextField 순서: 이름(0) · 생년월일(1) · 휴대폰(2) · 관계 자유입력(3).
Future<void> _fillLink(WidgetTester t,
    {String name = '김영수', String birth = '1948-05-20', String phone = '01000005678'}) async {
  await t.enterText(find.byType(TextField).at(0), name);
  await t.enterText(find.byType(TextField).at(1), birth);
  await t.enterText(find.byType(TextField).at(2), phone);
}

const _boxText = '휴대폰이 없거나, 번호가 바뀐 가족인가요? ›';

void main() {
  testWidgets('[FAM-LINK-01] 입력은 이름·생년월일·휴대폰 번호·관계', (t) async {
    await pumpLinkForm(t);
    for (final label in ['이름', '생년월일', '휴대폰 번호', '나와의 관계']) {
      expect(find.textContaining(label), findsWidgets);
    }
  });

  testWidgets('[FAM-LINK-03] 성별은 묻지 않는다 — 병원 기록의 값을 쓴다', (t) async {
    await pumpLinkForm(t);
    expect(find.text('성별'), findsNothing);
    expect(find.text('남'), findsNothing);
  });

  testWidgets('[FAM-LINK-02] 관계를 입력받아 서버로 보낸다 — 「가족(연결)」로 굳히지 않는다', (t) async {
    final h = await pumpLinkForm(t);
    await _fillLink(t);
    await t.tap(find.text('기타 +'));
    await t.pump();
    await t.enterText(find.byType(TextField).at(3), '장인어른');
    await t.tap(find.text('인증번호 받기'));
    await t.pumpAndSettle();
    expect(h.addRepo.requestCalls.single.relation, '장인어른');
  });

  testWidgets('[FAM-LINK-14][FAM-LINK-15] 안내 상자는 이 화면에 있다 — 문자를 보내기 전이다', (t) async {
    final h = await pumpLinkForm(t);
    expect(find.text(_boxText), findsOneWidget);
    expect(find.textContaining('병원에 전화하거나 방문하시면 직원이 확인 후 연결해 드립니다'), findsOneWidget);
    expect(h.addRepo.requestCalls, isEmpty); // 아직 아무 문자도 안 나갔다
  });

  testWidgets('[FAM-LINK-16] 문구는 「없거나」와 「바뀐」을 함께 적는다 — 좁은 옛 문구를 쓰지 않는다', (t) async {
    await pumpLinkForm(t);
    expect(find.text(_boxText), findsOneWidget);
    expect(find.text('휴대폰이 없는 가족인가요?'), findsNothing);
  });

  testWidgets('[FAM-LINK-17][NAV-FAM-12] 안내 상자를 누르면 병원 안내 화면으로', (t) async {
    final h = await pumpLinkForm(t);
    await t.tap(find.text(_boxText));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/settings/hospital'); // 전화·길찾기가 있는 화면
  });

  testWidgets('[NAV-FAM-09] [인증번호 받기] 성공 → 인증번호 입력 화면', (t) async {
    final h = await pumpLinkForm(t);
    await _fillLink(t);
    await t.tap(find.text('인증번호 받기'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family/add/link/otp');
  });

  testWidgets('[FAM-LINK-06] 병원 기록에 없는 사람이어도 화면은 똑같이 넘어간다', (t) async {
    final repo = FakeFamilyAddRepo()..nextRequestFindsNobody(); // 서버는 200 + request_id만 준다
    final h = await pumpLinkForm(t, addRepo: repo);
    await _fillLink(t);
    await t.tap(find.text('인증번호 받기'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family/add/link/otp'); // 「그런 환자 없습니다」가 없다
    expect(find.textContaining('없습니다'), findsNothing);
  });

  testWidgets('[FAM-LINK-09][FAM-LINK-10] 본인·이미 연결은 그 자리에서 알려준다', (t) async {
    final repo = FakeFamilyAddRepo()..failRequestWith(409, '이미 가족으로 연결되어 있습니다');
    final h = await pumpLinkForm(t, addRepo: repo);
    await _fillLink(t);
    await t.tap(find.text('인증번호 받기'));
    await t.pumpAndSettle();
    expect(find.textContaining('이미 가족으로 연결되어 있습니다'), findsOneWidget);
    expect(find.text('가족 목록 보기'), findsOneWidget); // 막다른 길을 만들지 않는다
    expect(h.lastRoute, '/family/add/link'); // 화면을 옮기지 않는다

    await t.tap(find.text('가족 목록 보기'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family');
  });

  testWidgets('[FAM-LINK-22] 인증번호 받기를 누르면 그 번호에 30초 쿨다운이 걸린다(번호 기준)', (t) async {
    final h = await pumpLinkForm(t);
    await _fillLink(t, phone: '01000005678');
    await t.tap(find.text('인증번호 받기'));
    await t.pumpAndSettle();
    expect(h.cooldown.remainingSeconds('01000005678', DateTime.now()), greaterThan(0));
  });

  testWidgets('[FAM-LINK-22][#16] 서버가 429 + 남은 초를 주면 그 값으로 쿨다운을 맞춘다', (t) async {
    final repo = FakeFamilyAddRepo()
      ..failRequestWith(429, '인증번호는 30초 뒤에 다시 받으실 수 있습니다.', retryAfter: 12);
    final h = await pumpLinkForm(t, addRepo: repo);
    await _fillLink(t, phone: '01000005678');
    await t.tap(find.text('인증번호 받기'));
    await t.pumpAndSettle();
    final left = h.cooldown.remainingSeconds('01000005678', DateTime.now());
    expect(left, greaterThan(0));
    expect(left, lessThanOrEqualTo(12)); // 서버 값(12초)에 맞춘다 — 앱 기본 30초가 아니다
    expect(h.lastRoute, '/family/add/link'); // 넘어가지 않는다
  });
}
