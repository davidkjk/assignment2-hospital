import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'add_harness.dart';

// LabeledField/RelationInput 순서: 이름(0) · 생년월일(1) · 관계 자유입력(2) · 전화번호(3).
Future<void> _fillName(WidgetTester t, [String v = '김지훈']) =>
    t.enterText(find.byType(TextField).at(0), v);
Future<void> _fillBirth(WidgetTester t, [String v = '2010-01-15']) =>
    t.enterText(find.byType(TextField).at(1), v);
Future<void> _fillPhone(WidgetTester t, String v) =>
    t.enterText(find.byType(TextField).at(3), v);

Future<void> _fillNameAndBirth(WidgetTester t) async {
  await _fillName(t);
  await _fillBirth(t);
}

Future<void> _fillValid(WidgetTester t, {String phone = '01044445555'}) async {
  await _fillNameAndBirth(t);
  await t.tap(find.text('남'));
  await t.pump();
  if (phone.isNotEmpty) await _fillPhone(t, phone);
}

void main() {
  testWidgets('[FAM-NEW-01] 입력은 이름·생년월일·성별·관계 + 전화번호(선택)', (t) async {
    await pumpNew(t);
    for (final label in ['이름', '생년월일', '성별', '나와의 관계']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.textContaining('전화번호'), findsWidgets);
    expect(find.textContaining('없으면 비워두세요'), findsOneWidget);
  });

  testWidgets('[FAM-NEW-02][FAM-NEW-03] 성별은 필수이고 미리 골라두지 않는다 — 골라야 등록하기가 산다', (t) async {
    await pumpNew(t);
    expect(find.text('남'), findsOneWidget);
    expect(find.text('여'), findsOneWidget);
    expect(find.text('성별을 골라주세요'), findsOneWidget); // 어느 쪽도 선택돼 있지 않다(BTN-STATE-03)
    expect(find.widgetWithText(Column, '등록하기'), findsWidgets); // 버튼은 화면에 있다
    await t.tap(find.text('남'));
    await t.pump();
    expect(find.text('성별을 골라주세요'), findsNothing); // 살아났다
  });

  testWidgets('[FAM-NEW-04][FAM-NEW-05] 기본값이 조용히 답을 만들지 않는다 — 안 고르면 서버로 안 간다', (t) async {
    final h = await pumpNew(t);
    await _fillNameAndBirth(t);
    await t.tap(find.text('등록하기'));
    await t.pumpAndSettle();
    expect(h.addRepo.addCalls, isEmpty); // 'F'가 몰래 실려 나가지 않는다
  });

  testWidgets('[FAM-NEW-06] 성별 라벨 옆에 왜 묻는지 — 가입 화면과 같은 문구', (t) async {
    await pumpNew(t);
    expect(find.text('(문진 문항 노출에 쓰입니다)'), findsOneWidget);
  });

  testWidgets('[FAM-NEW-07][FAM-NEW-08][FAM-NEW-09] 전화번호를 비워도 등록되고, 보호자 번호를 복사하지 않는다', (t) async {
    final h = await pumpNew(t);
    expect(find.textContaining('비워두시면'), findsOneWidget);
    expect(find.textContaining('보호자(내) 번호'), findsOneWidget);
    await _fillValid(t, phone: '');
    await t.tap(find.text('등록하기'));
    await t.pumpAndSettle();
    expect(h.addRepo.addCalls.single.phone, isNull); // 빈 문자열도 아니고 내 번호도 아니다
    expect(h.addRepo.otpCalls, 0); // ㉮는 인증하지 않는다
  });

  testWidgets('[FAM-NEW-10][FAM-NEW-11][FAM-NEW-12] 상한은 서버가 거절하고 화면은 그 문장을 팝업으로', (t) async {
    final repo = FakeFamilyAddRepo()..failAddWith(409, '가족은 최대 10명까지 등록하실 수 있습니다.');
    await pumpNew(t, addRepo: repo);
    await _fillValid(t);
    await t.tap(find.text('등록하기'));
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.textContaining('최대 10명'), findsOneWidget);
    expect(find.textContaining('병원에 문의해 주세요'), findsOneWidget);
    expect(find.text('닫기'), findsOneWidget);
  });

  testWidgets('[FAM-NEW-13][FAM-NEW-14] 중복 경고는 화면 위 상시 안내다(팝업이 아니다)', (t) async {
    await pumpNew(t);
    expect(find.textContaining('이미 병원에 방문·예약하신 적 있는 가족이라면'), findsOneWidget);
    expect(find.textContaining('과거 기록과 별도로 관리됩니다'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing); // 본체는 갈래 선택 화면이다
  });

  testWidgets('[FAM-NEW-15] 등록 버튼은 처리 중 「등록 중…」 — 두 번 눌리지 않는다', (t) async {
    final repo = FakeFamilyAddRepo()..delayAdd();
    await pumpNew(t, addRepo: repo);
    await _fillValid(t);
    await t.tap(find.text('등록하기'));
    await t.pump(); // settle 하지 않는다(지연 중)
    expect(find.text('등록 중…'), findsOneWidget);
    await t.tap(find.text('등록 중…')); // 다시 눌러도
    await t.pump();
    expect(repo.addCalls.length, lessThanOrEqualTo(1)); // 두 번 실리지 않는다
    await t.pumpAndSettle();
  });

  testWidgets('[FAM-NEW-16][NAV-FAM-08] 성공하면 가족 목록 — 갈래 선택은 뒤에 남기지 않는다', (t) async {
    final h = await pumpNew(t);
    final before = h.listRepo.listCallCount;
    await _fillValid(t);
    await t.tap(find.text('등록하기'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family'); // NAV-FAM-08(go — 뒤로 눌러 등록 화면으로 안 돌아간다)
    expect(h.addRepo.addCalls.single.name, '김지훈');
    expect(h.listRepo.listCallCount, greaterThan(before)); // 새 카드가 목록에 있다(재조회)
  });
}
