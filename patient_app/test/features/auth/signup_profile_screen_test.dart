import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/features/auth/signup_profile_screen.dart';

class _FakeRepo implements SignupProfileRepo {
  int pwSet = 0, created = 0;
  String? failWith;
  @override
  Future<void> setPassword(String pw) async => pwSet++;
  @override
  Future<void> createProfile(
      {required String name,
      required String birthDate,
      required String gender,
      required bool adsAgreed,
      required String termsVersion}) async {
    if (failWith != null) throw ApiException(failWith!);
    created++;
  }
}

SignupProfileScreen _screen(_FakeRepo repo) =>
    SignupProfileScreen(controller: SignupProfileController(repo), onDone: () {});

/// 선택된 성별 칸 개수. 초기에는 0개여야 한다(기본값 없음).
int selectedChipCount(WidgetTester t) =>
    t.widgetList<GenderOption>(find.byType(GenderOption)).where((c) => c.selected).length;

/// 유효한 값으로 ③를 다 채운다(이름·생년월일·비번 두 칸·성별).
Future<void> _fillValid(WidgetTester t) async {
  await t.enterText(find.byKey(const Key('name')), '홍길동'); // 이름 칸(데모 순서: 비밀번호 먼저라 .first는 비번)
  await t.enterText(find.byKey(const Key('pw')), 'abc12345');
  await t.enterText(find.byKey(const Key('pw-confirm')), 'abc12345');
  await t.ensureVisible(find.byKey(const Key('birth'))); // 하단 CTA가 커져 테스트 뷰포트(600)에선 스크롤 밖
  await t.tap(find.byKey(const Key('birth')));
  await t.pumpAndSettle();
  await t.tap(find.text('OK')); // 기본 날짜(1970) 확정
  await t.pumpAndSettle();
  await t.ensureVisible(find.text('여')); // 폼이 길어 성별 칸이 스크롤 밖일 수 있다
  await t.tap(find.text('여'));
  await t.pump();
}

void main() {
  testWidgets('[AUTH-PROFILE-04] 이름·생년월일·성별 세 칸(전화는 ①에서 받았다)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    expect(find.text('이름'), findsOneWidget);
    expect(find.text('생년월일'), findsOneWidget);
    expect(find.text('성별'), findsOneWidget);
  });

  testWidgets('[AUTH-SIGNUP-06] 성별은 남·여 + 왜 묻는지(문진 문항 노출에 쓰입니다)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    expect(find.text('남'), findsOneWidget);
    expect(find.text('여'), findsOneWidget);
    expect(find.textContaining('문진 문항 노출에 쓰입니다'), findsOneWidget);
  });

  testWidgets('[AUTH-SIGNUP-06b] 성별을 미리 골라두지 않는다 — 하나 눌러야 [가입 완료]가 산다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    // 성별만 빼고 모두 채운다 → 성별 선택 여부만으로 버튼이 갈린다(플랜 결함 교정).
    await t.enterText(find.byKey(const Key('name')), '홍길동');
    await t.enterText(find.byKey(const Key('pw')), 'abc12345');
    await t.enterText(find.byKey(const Key('pw-confirm')), 'abc12345');
    await t.ensureVisible(find.byKey(const Key('birth')));
    await t.tap(find.byKey(const Key('birth')));
    await t.pumpAndSettle();
    await t.tap(find.text('OK'));
    await t.pumpAndSettle();
    final before = t.widget<FilledButton>(find.widgetWithText(FilledButton, '가입 완료'));
    expect(before.onPressed, isNull); // 성별 미선택이면 꺼짐
    await t.ensureVisible(find.text('여'));
    await t.tap(find.text('여'));
    await t.pump();
    final after = t.widget<FilledButton>(find.widgetWithText(FilledButton, '가입 완료'));
    expect(after.onPressed, isNotNull); // 성별 선택으로 살아난다
  });

  testWidgets('[AUTH-SIGNUP-06d] 초기 성별은 어느 쪽도 선택돼 있지 않다(기본값 F 없음)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    final selected = selectedChipCount(t);
    expect(selected, 0);
  });

  testWidgets('[AUTH-PROFILE-01] 비밀번호 조건을 미리 보여주고 충족되면 ✓로 바뀐다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    expect(find.textContaining('8자 이상'), findsOneWidget);
    expect(find.textContaining('영문'), findsOneWidget);
    await t.enterText(find.byKey(const Key('pw')), 'abc12345'); // 8자+영문숫자
    await t.pump();
    expect(find.textContaining('✓'), findsWidgets); // 충족 표시
  });

  testWidgets('[AUTH-PROFILE-03] 비밀번호 눈 토글(기본 가림)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    final pw = t.widget<TextField>(find.byKey(const Key('pw')));
    expect(pw.obscureText, isTrue); // 기본 가림
    expect(find.byIcon(Icons.visibility_off), findsWidgets);
  });

  testWidgets('[AUTH-PROFILE-03b] 확인 칸을 둔다(비밀번호 + 비밀번호 확인)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    expect(find.byKey(const Key('pw')), findsOneWidget);
    expect(find.byKey(const Key('pw-confirm')), findsOneWidget);
  });

  testWidgets('[AUTH-PROFILE-05] 생년월일은 날짜 선택기로 받는다(자유 입력 아님)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeRepo())));
    await t.ensureVisible(find.byKey(const Key('birth')));
    await t.tap(find.byKey(const Key('birth')));
    await t.pumpAndSettle();
    expect(find.byType(CalendarDatePicker), findsOneWidget); // YYYY-MM-DD 자유 입력이 아니다
  });

  testWidgets('[AUTH-SIGNUP-07] 가입 완료 성공이면 홈으로(축하 화면 없음)', (t) async {
    final repo = _FakeRepo();
    var done = false;
    await t.pumpWidget(MaterialApp(
        home: SignupProfileScreen(
            controller: SignupProfileController(repo), onDone: () => done = true)));
    await _fillValid(t);
    await t.tap(find.text('가입 완료'));
    await t.pumpAndSettle();
    expect(repo.pwSet, 1);
    expect(repo.created, 1);
    expect(done, isTrue); // 홈으로(별도 축하 화면 없음)
  });

  testWidgets('[AUTH-PROFILE-08] 실패면 버튼 위 오류, ①②를 다시 시키지 않는다', (t) async {
    final repo = _FakeRepo()..failWith = '가입에 실패했습니다. 잠시 후 다시 시도해주세요.';
    await t.pumpWidget(MaterialApp(
        home: SignupProfileScreen(controller: SignupProfileController(repo), onDone: () {})));
    await _fillValid(t);
    await t.tap(find.text('가입 완료'));
    await t.pumpAndSettle();
    expect(find.text('가입에 실패했습니다. 잠시 후 다시 시도해주세요.'), findsOneWidget);
    // 여전히 ③ 화면 — ①②로 되돌리지 않는다(인증은 이미 끝났다)
    expect(find.text('가입 완료'), findsOneWidget);
  });
}
