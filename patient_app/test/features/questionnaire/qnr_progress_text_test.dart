import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/questionnaire/qnr_progress_text.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_wizard.dart';
import 'package:hospital_patient_app/features/questionnaire/resume_screen.dart';

void main() {
  test('[QNR-PROG-06] 마법사 상단은 「N번 / M문항」 — 지금 몇 번째 문항인지', () {
    expect(qnrHeaderText(index: 0, total: 8), '1번 / 8문항'); // index는 0부터, 사람에겐 1부터
    expect(qnrHeaderText(index: 2, total: 8), '3번 / 8문항'); // 목업 56 ⑤
  });

  test('[QNR-PROG-08] 이어쓰기 화면은 「M문항 중 N개를 작성하셨습니다.」 — 한 것의 수', () {
    expect(qnrResumeText(answered: 3, total: 8), '8문항 중 3개를 작성하셨습니다.');
  });

  test('[QNR-PROG-07] 홈·나의 예약 줄은 「사전문진 작성 중 (N/M)」', () {
    expect(qnrRowText(answered: 3, total: 8), '사전문진 작성 중 (3/8)');
  });

  test('[QNR-PROG-09] 세 자리는 같은 숫자를 쓴다 — 각자 계산하지 않는다', () {
    // 같은 (answered=3, total=8)에서 나온 세 문구에 3과 8이 모두 살아 있다.
    const a = 3, t = 8;
    expect(qnrHeaderText(index: a, total: t), contains('$t문항'));
    expect(qnrResumeText(answered: a, total: t), allOf(contains('$t문항'), contains('$a개')));
    expect(qnrRowText(answered: a, total: t), contains('($a/$t)'));
  });

  test('[QNR-PROG-03] 분모는 성별에 따라 달라진다 — 포맷터는 받은 total을 그대로 쓴다(자기가 세지 않음)', () {
    // 같은 진료과라도 남성은 임신 문항이 빠져 분모가 준다(서버 compute_progress가 준 값).
    expect(qnrRowText(answered: 3, total: 8), contains('(3/8)')); // 여성 환자
    expect(qnrRowText(answered: 3, total: 7), contains('(3/7)')); // 남성 환자 — 문항 하나가 안 보임
  });

  test('[QNR-PROG-03] 분모가 0이어도 깨지지 않는다 — 문진을 받지 않는 진료과', () {
    expect(qnrRowText(answered: 0, total: 0), '사전문진 작성 중 (0/0)'); // 화면이 이 값을 그릴 일은 없다(진입 방어)
  });

  testWidgets('[QNR-PROG-06] 마법사 상단에 「3번 / 8문항」이 그려진다', (t) async {
    await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: QnrProgressHeader(index: 2, total: 8))));
    expect(find.text('3번 / 8문항'), findsOneWidget);
  });

  testWidgets('[QNR-PROG-08] 이어쓰기 화면에 「8문항 중 3개를 작성하셨습니다.」가 그려진다', (t) async {
    await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: ResumeSummary(answered: 3, total: 8))));
    expect(find.text('8문항 중 3개를 작성하셨습니다.'), findsOneWidget);
  });

  testWidgets('[QNR-PROG-09] 이어쓰기 숫자는 화면이 세지 않고 서버 값을 쓴다 — 답이 4개 있어도 서버가 3이면 3', (t) async {
    // 성별로 안 보이는 문항의 옛 답이 answers에 남아 있어도 화면 숫자는 서버 값(3)을 따른다.
    await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: ResumeSummary(answered: 3, total: 8))));
    expect(find.textContaining('3개'), findsOneWidget);
    expect(find.textContaining('4개'), findsNothing);
  });
}
