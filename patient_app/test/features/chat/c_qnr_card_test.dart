import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/cards/c_qnr_card.dart';

void main() {
  Map<String, dynamic> p({String state = '미작성', int answered = 0, int total = 8}) =>
      {'state': state, 'answered': answered, 'total': total};

  testWidgets('[CCARD-QNR-SHOW-01] 문항 1개↑면 상태·진행률·진입 행동만 담은 카드', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(payload: p()))));
    expect(find.byType(CQnrCard), findsOneWidget);
  });

  testWidgets('[CCARD-QNR-STATE-01] 작성완료·진료 시작 전엔 [내용 보기]+[수정하기], 진료중부터 보기만', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: p(state: '완료', answered: 8, total: 8)))));
    expect(find.text('내용 보기'), findsOneWidget);
    expect(find.text('수정하기'), findsOneWidget);
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: p(state: '진료중', answered: 8, total: 8)))));
    expect(find.text('내용 보기'), findsOneWidget);
    expect(find.text('수정하기'), findsNothing);                  // 진료중부터 보기만
  });

  testWidgets('[CCARD-QNR-ZERO-01] 0문항·기존 답 없음이면 안내 문구, (0/0)·비활성 버튼 금지', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: p(state: '0문항', total: 0)))));
    expect(find.text('작성할 문진이 없습니다'), findsOneWidget);
    expect(find.textContaining('(0/0)'), findsNothing);
  });

  testWidgets('[CCARD-QNR-ZERO-02] 0문항·기존 답 있음이면 (0/0) 없이 [내용 보기] 읽기전용만', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: p(state: '0문항답있음', total: 0)))));
    expect(find.text('내용 보기'), findsOneWidget);
    expect(find.textContaining('(0/0)'), findsNothing);
  });

  testWidgets('[CCARD-QNR-LOAD-01] 조회 중/오류면 완료·미작성으로 추측 안 하고 로딩/재시도', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(payload: p(state: 'loading')))));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('수정하기'), findsNothing);
  });

  testWidgets('[CCARD-QNR-LIVE-01] 작성 중/완료 예약 취소면 답 보존·[작성한 문진 보기]+[새로 예약하기]', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: p(state: '취소읽기전용', answered: 5, total: 8)))));
    expect(find.text('작성한 문진 보기'), findsOneWidget);
    expect(find.text('새로 예약하기'), findsOneWidget);
  });

  testWidgets('[CCARD-QNR-LIVE-02] 진료중 시작이면 수정 제거·내용 조회 유지', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: p(state: '진료중', answered: 8, total: 8)))));
    expect(find.text('내용 보기'), findsOneWidget);
    expect(find.text('수정하기'), findsNothing);
  });

  testWidgets('[CCARD-QNR-NAV-01] CTA는 전용 문진 화면을 연다 — 질문을 채팅 말풍선으로 나열 안 함', (t) async {
    String? route;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: p(state: '미작성'), onOpenQuestionnaire: (r) => route = r))));
    await t.tap(find.text('작성하기'));
    expect(route, startsWith('/questionnaire/')); // 전용 화면(T23)
  });
}
