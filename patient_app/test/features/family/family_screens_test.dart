import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/family/family_edit_screen.dart';
import 'package:hospital_patient_app/features/family/family_list_screen.dart';
import 'package:hospital_patient_app/features/family/unlink_section.dart';
import 'package:hospital_patient_app/core/router.dart';
import 'package:hospital_patient_app/core/tokens.dart';

import 'harness.dart';

void main() {
  group('가족 목록 (FAM-LIST)', () {
    testWidgets('[FAM-LIST-01·02·09] 본인 맨 위·관계 「본인」·가족 이름순(서버 정렬 그대로)', (t) async {
      await pumpList(t, [self(name: '김보호'), fam(id: 'a', name: '강아들', relation: '아들'), fam(id: 'b', name: '홍길동')]);
      final cards = t.widgetList<FamilyCard>(find.byType(FamilyCard)).toList();
      expect(cards.first.member.isSelf, isTrue);
      expect(cards.map((c) => c.member.name).toList(), ['김보호', '강아들', '홍길동']);
      expect(find.text('본인'), findsOneWidget);
    });

    testWidgets('[FAM-LIST-03] 관계 큰 제목 + 이름·생년월일(점)·성별(사람 말)', (t) async {
      await pumpList(t, [fam(name: '홍길동', birth: '1950-01-01', gender: 'M', relation: '부모')]);
      expect(find.text('부모'), findsOneWidget);
      expect(find.textContaining('홍길동'), findsOneWidget);
      expect(find.textContaining('1950.01.01'), findsOneWidget);   // 데모 포맷(점)
      expect(find.textContaining('남'), findsOneWidget);
    });

    testWidgets('[FAM-LIST-04·05] 카드 행동은 [정보 수정] 하나뿐', (t) async {
      await pumpList(t, [fam(name: '홍길동')]);
      expect(find.text('정보 수정'), findsOneWidget);
      expect(find.text('예약하기'), findsNothing);
      expect(find.text('연결 해제'), findsNothing);   // 되돌리기 어려워 수정 화면 안쪽으로
    });

    testWidgets('[FAM-LIST-06·07][NAV-FAM-05] 다가오는 예약 줄 하나 · 누르면 예약 상세', (t) async {
      await pumpList(t, [fam(upcoming: up(id: 'a1', date: '2026-09-01', dept: '내과'))]);
      expect(find.byType(UpcomingRow), findsOneWidget);
      expect(find.textContaining('9월 1일'), findsOneWidget);
      expect(find.textContaining('내과'), findsOneWidget);
      await t.tap(find.byType(UpcomingRow));
      await t.pumpAndSettle();
      expect(find.text('appt a1'), findsOneWidget);
    });

    testWidgets('[FAM-LIST-08] 끝난 예약뿐이면 줄이 없다', (t) async {
      await pumpList(t, [fam(upcoming: null)]);
      expect(find.byType(UpcomingRow), findsNothing);
    });

    testWidgets('[FAM-LIST-10·11][NAV-FAM-06] 가족 0명이어도 본인 카드 + [가족 추가하기] → 갈래 선택', (t) async {
      await pumpList(t, [self(name: '김보호')]);
      expect(find.byType(FamilyCard), findsOneWidget);   // 본인 카드가 화면을 채운다
      expect(find.textContaining('등록된 가족이 없습니다'), findsNothing);
      await t.tap(find.text('가족 추가하기'));
      await t.pumpAndSettle();
      expect(find.text('add-choice'), findsOneWidget);
    });

    testWidgets('[FAM-LIST-12] 10명이면 버튼은 살아 있고 누르면 안내 팝업(죽은 버튼 금지)', (t) async {
      await pumpList(t, [self(name: '김보호'), for (var i = 0; i < 10; i++) fam(id: 'f$i', name: '가족$i')]);
      await t.tap(find.text('가족 추가하기'));
      await t.pumpAndSettle();
      expect(find.textContaining('최대 10명'), findsOneWidget);
      expect(find.text('add-choice'), findsNothing);   // 갈래 선택으로 넘어가지 않는다
    });

    testWidgets('[NAV-FAM-04] [정보 수정] → 가족 정보 수정', (t) async {
      await pumpList(t, [fam(id: 'p1', name: '홍길동')]);
      await t.tap(find.text('정보 수정'));
      await t.pumpAndSettle();
      expect(find.byType(FamilyEditScreen), findsOneWidget);
    });
  });

  group('가족 정보 수정 (FAM-EDIT)', () {
    testWidgets('[FAM-EDIT-03·04] ㉮ 새 가족은 이름·생년월일·성별 전부 열림', (t) async {
      await pumpEdit(t, fam(name: '홍길동', canEdit: true));
      expect(t.widget<TextField>(find.byType(TextField).first).enabled, isTrue);
      expect(find.textContaining('바꿀 수 있어요'), findsOneWidget);
      expect(find.textContaining('병원에 문의'), findsNothing);
    });

    testWidgets('[FAM-EDIT-05·15] ㉯ 연결 가족은 읽기 전용 + 「병원에 문의하시면 수정해 드립니다」', (t) async {
      await pumpEdit(t, fam(canEdit: false, lock: 'linked'));
      expect(find.byType(LockedFieldNote), findsOneWidget);
      expect(find.text('병원에 문의하시면 수정해 드립니다'), findsOneWidget);
      // 이름 칸은 비활성
      final nameField = t.widget<TextField>(find.byType(TextField).first);
      expect(nameField.enabled, isFalse);
    });

    testWidgets('[FAM-EDIT-08·09] 이력 있는 본인은 「진료 기록이 있어 병원에서만 수정할 수 있습니다」', (t) async {
      await pumpEdit(t, self(canEdit: false, lock: 'has_history'));
      expect(find.text('진료 기록이 있어 병원에서만 수정할 수 있습니다'), findsOneWidget);
      expect(find.text('내 정보'), findsOneWidget);
    });

    testWidgets('[FAM-EDIT-07] 이력 없는 본인은 열림 · 관계/해제 없음(연결선 없음)', (t) async {
      await pumpEdit(t, self(canEdit: true));
      expect(t.widget<TextField>(find.byType(TextField).first).enabled, isTrue);
      expect(find.byType(RelationChips), findsNothing);   // 본인엔 「나와의 관계」 없음
      expect(find.byType(UnlinkSection), findsNothing);   // FAM-UNLINK-02
    });

    testWidgets('[FAM-EDIT-11] 성별 미리 안 골라둠 · 고르면 저장 살아남', (t) async {
      await pumpEdit(t, fam(gender: '', canEdit: true));
      // 성별 비었으면 저장 비활성(이유 문구 노출)
      expect(find.text('이름·생년월일·성별을 모두 입력해 주세요'), findsOneWidget);
      await t.tap(find.text('여'));
      await t.pumpAndSettle();
      expect(find.text('이름·생년월일·성별을 모두 입력해 주세요'), findsNothing);
    });

    testWidgets('[FAM-EDIT-12·13] 관계 칩 5종 + 자유 입력', (t) async {
      // 세션22c(e31d1c4)에서 옵션 부모→아버지/어머니로 바뀜 — 프리셋 밖 값('부모')은 자유 입력칸에 남는다.
      await pumpEdit(t, fam(relation: '부모', canEdit: false, lock: 'linked'));
      for (final r in ['아들', '딸', '배우자', '아버지', '어머니']) {
        expect(find.widgetWithText(RelationChips, r), findsOneWidget);
      }
      expect(find.byType(TextField), findsWidgets);   // 자유 입력칸 존재('부모'가 남음)
    });

    testWidgets('[FAM-EDIT-12] 미선택 관계 칩은 데모 outline처럼 흰 면 + 올라온 그림자(외곽선 없음)', (t) async {
      await pumpEdit(t, fam(relation: '부모', canEdit: false, lock: 'linked')); // 부모=프리셋 밖 → 5칩 모두 미선택
      final chip = t.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, '아들'));
      expect(chip.style!.side!.resolve({}), BorderSide.none);              // 외곽선 제거
      expect(chip.style!.backgroundColor!.resolve({}), AppTokens.surface); // 흰 면(bg-card)
      expect(chip.style!.elevation!.resolve({}), 1.5);                     // 올라온 그림자(shadow-sm)
    });

    testWidgets('[FAM-EDIT-02][NAV-FAM-13] 열린 가족 저장 → 신원+관계 둘 다 PATCH · 목록으로', (t) async {
      final h = await pumpEdit(t, fam(id: 'p1', canEdit: true));
      await t.tap(find.text('저장하기'));
      await t.pumpAndSettle();
      expect(h.location, '/family');
      expect(h.repo.patchBodies.any((b) => b.containsKey('relation')), isTrue);
      expect(h.repo.patchBodies.any((b) => b.containsKey('birth_date')), isTrue);
    });

    testWidgets('[FAM-EDIT-02] 잠긴 신원은 관계만 보낸다(잠긴 칸 서버로 안 감)', (t) async {
      final h = await pumpEdit(t, fam(canEdit: false, lock: 'linked'));
      await t.tap(find.text('저장하기'));
      await t.pumpAndSettle();
      expect(h.repo.patchBodies.every((b) => !b.containsKey('birth_date')), isTrue);
      expect(h.repo.patchBodies.any((b) => b.containsKey('relation')), isTrue);
    });
  });

  group('연결 해제 (FAM-UNLINK)', () {
    testWidgets('[FAM-UNLINK-01] 해제는 수정 화면 안쪽·구분선 아래·저장 버튼과 멀리', (t) async {
      await pumpEdit(t, fam(canEdit: true));
      expect(find.byType(UnlinkSection), findsOneWidget);
      final saveY = t.getCenter(find.text('저장하기')).dy;
      final unlinkY = t.getCenter(find.text('연결 해제')).dy;
      expect(unlinkY - saveY, greaterThan(80));
    });

    testWidgets('[FAM-UNLINK-05·06·07] 확인창은 지킬 수 있는 문구로', (t) async {
      await pumpEdit(t, fam(canEdit: true));
      await t.tap(find.text('연결 해제'));
      await t.pumpAndSettle();
      expect(find.textContaining('앱에서는 더 이상 보이지 않습니다'), findsOneWidget);
      expect(find.textContaining('과거 예약 이력은 그대로 남습니다'), findsNothing);
    });

    testWidgets('[FAM-UNLINK-08·09][NAV-FAM-14] 해제 성공 → 목록으로 · 그 카드가 사라짐', (t) async {
      final h = await pumpEdit(t, fam(id: 'p1', name: '홍길동', canEdit: true),
          all: [self(), fam(id: 'p1', name: '홍길동', canEdit: true)]);
      await t.tap(find.text('연결 해제'));
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(TextButton, '연결 해제'));   // 확인창 안 파괴 버튼
      await t.pumpAndSettle();
      expect(h.location, '/family');
      expect(find.text('홍길동'), findsNothing);
    });

    testWidgets('[FAM-UNLINK-03·04][NAV-FAM-15·16] 다가오는 예약 있으면 막고 그 예약 보여줌', (t) async {
      final h = await pumpEdit(t, fam(id: 'p1', canEdit: true, upcoming: up(id: 'a1', dept: '내과')));
      await t.tap(find.text('연결 해제'));
      await t.pumpAndSettle();
      expect(find.textContaining('먼저 예약을 취소해 주세요'), findsOneWidget);
      expect(find.textContaining('9월 1일'), findsOneWidget);
      expect(find.textContaining('내과'), findsOneWidget);
      await t.tap(find.text('예약 보러 가기'));
      await t.pumpAndSettle();
      expect(find.text('appt a1'), findsOneWidget);
      expect(h.repo.unlinkCalls, 0);   // 서버 부르지 않고 앱이 먼저 막았다
    });

    testWidgets('[NAV-FAM-16] 차단 팝업 [닫기]는 수정 화면에 남는다', (t) async {
      await pumpEdit(t, fam(id: 'p1', canEdit: true, upcoming: up()));
      await t.tap(find.text('연결 해제'));
      await t.pumpAndSettle();
      await t.tap(find.text('닫기'));
      await t.pumpAndSettle();
      expect(find.byType(FamilyEditScreen), findsOneWidget);
    });

    testWidgets('[FAM-UNLINK-03] 서버 409(두 번째 그물)도 같은 차단 팝업', (t) async {
      final h = await pumpEdit(t, fam(id: 'p1', canEdit: true));   // 앱엔 upcoming 없음(목록이 낡음)
      h.repo.blockUnlinkWith = up(id: 'a9', dept: '정형외과');
      await t.tap(find.text('연결 해제'));
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(TextButton, '연결 해제'));   // 확인창 통과
      await t.pumpAndSettle();
      expect(find.textContaining('먼저 예약을 취소해 주세요'), findsOneWidget);   // 서버가 막았다
      expect(find.textContaining('정형외과'), findsOneWidget);
    });
  });

  group('라우팅 (NAV-FAM)', () {
    test('[NAV-FAM-01·02·03] 가족은 민감 경로 — 재인증 배선(T11/T14)이 이미 건다', () {
      expect(isSensitiveLocation('/family'), isTrue);
      expect(isSensitiveLocation('/family/p1/edit'), isTrue);
    });

    testWidgets('[NAV-FAM-19] 조회 실패면 가운데 안내 + [다시 시도]', (t) async {
      final h = FamilyHarnessError();
      await t.pumpWidget(h.widget());
      await t.pumpAndSettle();
      expect(find.text('다시 시도'), findsOneWidget);
    });
  });
}
