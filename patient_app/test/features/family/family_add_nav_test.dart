import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/family/family_add_choice_screen.dart';
import 'package:hospital_patient_app/features/family/family_link_form_screen.dart';
import 'package:hospital_patient_app/features/family/family_new_screen.dart';

import 'add_harness.dart';

// ⚠️ NAV-FAM-17(예약 1단계 「+ 가족 추가하기」 → 갈래 선택)의 **버튼 쪽 1줄**은 예약 스레드(T19)의
// booking/steps/who_step.dart가 소유한다. 이 브랜치(feat/patient-app-family)에는 booking이 아직 없어
// (라우터의 /booking은 자리표시자) 그 test를 여기서 돌릴 수 없다. → **머지 시** who_step.dart의
// `context.go('/family')`를 `context.push('/family/add')`로 바꾸고 who_step_test 기대값 1건을
// '/family/add'로 맞춘다(핸드오프·커밋 본문에 기록). 여기서는 도착지(/family/add)가 갈래 선택 화면으로
// 살아 있음을 확인해 그 목적지가 준비돼 있음을 보증한다.
void main() {
  testWidgets('[NAV-FAM-06→07] /family/add 는 갈래 선택 화면(NAV-FAM-17의 도착지가 준비돼 있다)', (t) async {
    final h = await pumpChoice(t);
    expect(h.lastRoute, '/family/add');
    expect(find.byType(FamilyAddChoiceScreen), findsOneWidget);
  });

  testWidgets('[NAV-FAM-08 경로] /family/add/new 는 ㉮ 등록 화면', (t) async {
    await pumpNew(t);
    expect(find.byType(FamilyNewScreen), findsOneWidget);
  });

  testWidgets('[NAV-FAM-09 경로] /family/add/link 는 ㉯ 입력 화면', (t) async {
    await pumpLinkForm(t);
    expect(find.byType(FamilyLinkFormScreen), findsOneWidget);
  });
}
