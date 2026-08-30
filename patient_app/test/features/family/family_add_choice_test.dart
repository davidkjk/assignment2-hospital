import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/widgets/warn_text.dart';

import 'add_harness.dart';
import 'harness.dart';

void main() {
  testWidgets('[FAM-ADD-01] 갈래를 먼저 묻는 화면이 따로 있다 — 두 선택지, 입력칸 없음', (t) async {
    await pumpChoice(t);
    expect(find.text('우리 병원이 처음이에요'), findsOneWidget);
    expect(find.text('전에 진료받은 적이 있어요'), findsOneWidget);
    expect(find.byType(TextField), findsNothing); // 여기서는 아무것도 입력받지 않는다
  });

  testWidgets('[FAM-ADD-02] 고르기 전에는 진행하지 않는다 — [다음]에 이유가 붙어 있고 눌러도 안 넘어간다', (t) async {
    final h = await pumpChoice(t);
    expect(find.text('위에서 한 가지를 골라주세요'), findsOneWidget); // 비활성 이유(BTN-STATE-03)
    await t.tap(find.text('다음'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family/add'); // 모른 채 진행시키지 않는다

    await t.tap(find.text('우리 병원이 처음이에요'));
    await t.pump();
    expect(find.text('위에서 한 가지를 골라주세요'), findsNothing); // 이유가 사라진다(=살아났다)
    await t.tap(find.text('다음'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family/add/new');
  });

  testWidgets('[FAM-ADD-03] ㉮ 설명: 이름·생년월일만 적으면 바로 등록', (t) async {
    await pumpChoice(t);
    expect(find.textContaining('이름·생년월일만 적으면 바로 등록됩니다'), findsOneWidget);
  });

  testWidgets('[FAM-ADD-04] ㉯ 설명: 그분 휴대폰으로 인증번호 + 주의색 한 줄', (t) async {
    await pumpChoice(t);
    expect(find.textContaining('그분 휴대폰으로 인증번호'), findsOneWidget);
    final warn = t.widget<WarnText>(find.byType(WarnText));
    expect(warn.text, contains('휴대폰이 없거나 번호가 바뀐 가족이면'));
    expect(warn.text, contains('병원에 문의')); // 헛걸음을 여기서 막는다
  });

  testWidgets('[FAM-ADD-05] 그 안내는 인증번호 화면보다 앞이다 — 문자 발송 전에 읽는다', (t) async {
    final h = await pumpChoice(t);
    expect(h.addRepo.requestCalls, isEmpty); // 아직 어떤 발송 창구도 불리지 않았다
    expect(find.textContaining('병원에 문의'), findsOneWidget);
  });

  testWidgets('[FAM-ADD-06][NAV-FAM-07] 뒤로 가면 갈래 선택 → 다시 목록(막다른 길 금지, 다시 고를 수 있다)', (t) async {
    final h = await pumpChoice(t);
    await t.tap(find.text('우리 병원이 처음이에요'));
    await t.pump();
    await t.tap(find.text('다음'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family/add/new');

    await t.pageBack();
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family/add'); // 갈래 선택으로 돌아온다(막다른 길 금지)
    // 두 갈래가 그대로 있어 다른 쪽으로 다시 고를 수 있다(강제되지 않는다).
    expect(find.text('우리 병원이 처음이에요'), findsOneWidget);
    expect(find.text('전에 진료받은 적이 있어요'), findsOneWidget);

    await t.pageBack();
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family'); // NAV-FAM-07
  });

  testWidgets('[FAM-ADD-07] 이미 10명이면 화면에 들어오기 전에 안내 팝업으로 막는다', (t) async {
    final members = [self(name: '김보호'), for (var i = 0; i < 10; i++) fam(id: 'f$i', name: '가족$i')];
    final h = await pumpChoice(t, members: members);
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.textContaining('최대 10명'), findsOneWidget);
    await t.tap(find.text('닫기'));
    await t.pumpAndSettle();
    expect(h.lastRoute, '/family'); // 빈 화면에 남겨두지 않는다
  });
}
