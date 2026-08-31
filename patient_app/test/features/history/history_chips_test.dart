// HIST-WHO: 본인 먼저·이름순, 가족 0명이면 칩 줄 자체를 감춤, 5명↑ 가로 스크롤, 칩 눌러도 화면 안 옮김.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';
import 'package:hospital_patient_app/features/history/history_screen.dart';

FamilyMember _m(String id, String name, {bool self = false}) => FamilyMember(
      id: id, name: name, birthDate: '1990-01-01', gender: 'F', relation: self ? '본인' : '자녀',
      isSelf: self, canEditIdentity: true, hasVisitHistory: false, phoneBorrowed: false);

Widget _host(Widget w) => MaterialApp(home: Scaffold(body: w));

void main() {
  testWidgets('[HIST-WHO-01][HIST-WHO-02] 가로 이름 칩 — 본인 맨 앞, 가족은 이름 오름차순', (t) async {
    final members = [_m('me', '김순자', self: true), _m('b', '김병수'), _m('a', '김가영')];
    await t.pumpWidget(_host(NameChips(members: members, selectedId: 'me', onSelect: (_) {})));
    final chips = t.widgetList<Text>(find.byType(Text)).map((e) => e.data).toList();
    expect(chips.first, '김순자'); // 본인 먼저(HIST-WHO-02)
    expect(chips.indexOf('김가영') < chips.indexOf('김병수'), true); // 가족 이름 오름차순
  });
  testWidgets('[HIST-WHO-03] 기본 선택은 본인 — 본인 칩이 선택된 채로 그려진다', (t) async {
    // ⚠️ 플랜 Step7의 「본인 1명만으로 김순자 렌더」는 HIST-WHO-04(본인 칩 하나만 남기지 않음)와 모순 →
    // 규칙(HIST-WHO-04)이 이겨 칩 줄이 뜨는 가족 있는 경우로 「기본 선택=본인」을 검증한다.
    // (selectedId=null→본인 id 해석은 화면이 하며 history_screen_test가 확인.)
    final members = [_m('me', '김순자', self: true), _m('a', '김가영')];
    await t.pumpWidget(_host(NameChips(members: members, selectedId: 'me', onSelect: (_) {})));
    final selfChip = t.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, '김순자'));
    expect(selfChip.selected, true);
  });
  testWidgets('[HIST-WHO-04] 가족 0명이면 칩 줄 자체를 감춘다(본인 칩 하나만 남기지 않는다)', (t) async {
    await t.pumpWidget(_host(NameChips(members: [_m('me', '김순자', self: true)], selectedId: 'me', onSelect: (_) {})));
    expect(find.byType(NameChips), findsOneWidget);
    expect(find.byKey(const Key('history-chip-row')), findsNothing); // 렌더된 칩 줄이 없다
  });
  testWidgets('[HIST-WHO-05] 5명 이상이면 가로 스크롤(줄바꿈 아님)', (t) async {
    final members = [_m('me', '나', self: true), _m('1', 'ㄱ'), _m('2', 'ㄴ'), _m('3', 'ㄷ'), _m('4', 'ㄹ'), _m('5', 'ㅁ')];
    await t.pumpWidget(_host(NameChips(members: members, selectedId: 'me', onSelect: (_) {})));
    final sv = t.widget<SingleChildScrollView>(find.byKey(const Key('history-chip-row')));
    expect(sv.scrollDirection, Axis.horizontal); // Wrap이 아니라 가로 스크롤
  });
  testWidgets('[HIST-WHO-10] 칩을 누르면 콜백만 부른다 — 화면을 옮기지 않는다', (t) async {
    String? picked;
    final members = [_m('me', '김순자', self: true), _m('a', '김가영')];
    await t.pumpWidget(_host(NameChips(members: members, selectedId: 'me', onSelect: (id) => picked = id)));
    await t.tap(find.text('김가영'));
    expect(picked, 'a'); // Navigator.push 없음 — 목록만 갈아끼운다
  });
}
