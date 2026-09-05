import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/widgets/field_error.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: child));
String? _min8(String v) => v.length < 8 ? '8자 이상 입력해주세요' : null;
String? _required(String v) => v.isEmpty ? '필수 항목입니다' : null;

void main() {
  testWidgets('[ERR-FLD-02] 타이핑 도중에는 검사하지 않는다', (t) async {
    final form = FieldErrorController();
    final c = TextEditingController();
    await t.pumpWidget(_host(FieldTextInput(
        label: '비밀번호', controller: c, form: form, validate: _min8)));
    await t.enterText(find.byType(TextField), '123'); // 3자까지만 침
    await t.pump();
    expect(find.text('8자 이상 입력해주세요'), findsNothing); // 아직 나무라지 않는다
  });

  testWidgets('[ERR-FLD-03] 그 칸을 떠날 때 검사한다', (t) async {
    final form = FieldErrorController();
    final c = TextEditingController();
    await t.pumpWidget(_host(FieldTextInput(
        label: '비밀번호', controller: c, form: form, validate: _min8)));
    await t.enterText(find.byType(TextField), '123');
    FocusManager.instance.primaryFocus?.unfocus(); // 칸을 떠남(blur)
    await t.pump();
    expect(find.text('8자 이상 입력해주세요'), findsOneWidget);
  });

  testWidgets('[ERR-FLD-01] 여러 칸이 동시에 틀리면 각 칸마다 문구가 붙는다', (t) async {
    final form = FieldErrorController();
    final name = TextEditingController();   // 비어 있음
    final phone = TextEditingController();  // 비어 있음
    await t.pumpWidget(_host(Column(children: [
      FieldTextInput(label: '이름', controller: name, form: form, validate: _required),
      FieldTextInput(label: '전화', controller: phone, form: form, validate: _required),
    ])));
    form.validateAll();
    await t.pump();
    expect(find.text('필수 항목입니다'), findsNWidgets(2)); // 각 칸 아래 하나씩
  });

  testWidgets('[ERR-FLD-04] 버튼을 누를 때 건드리지 않은 칸도 전체 재검사된다', (t) async {
    final form = FieldErrorController();
    final birth = TextEditingController(); // 아예 건드리지 않음(포커스도 준 적 없음)
    await t.pumpWidget(_host(FieldTextInput(
        label: '생년월일', controller: birth, form: form, validate: _required)));
    expect(find.text('필수 항목입니다'), findsNothing);
    final ok = form.validateAll();     // 버튼 누를 때
    await t.pump();
    expect(ok, isFalse);
    expect(find.text('필수 항목입니다'), findsOneWidget); // 이때 걸린다
  });

  testWidgets('[ERR-FLD-05] 오류가 여럿이면 첫 오류 칸으로 자동 스크롤한다', (t) async {
    final scroll = ScrollController();
    final form = FieldErrorController();
    final a = TextEditingController();
    final b = TextEditingController();
    // SingleChildScrollView+Column: 모든 칸이 즉시 빌드돼 폼에 등록된다(lazy ListView면 화면 밖 칸이
    // 아예 빌드·등록되지 않아 스크롤 대상이 생기지 않는다).
    await t.pumpWidget(_host(SingleChildScrollView(controller: scroll, child: Column(children: [
      const SizedBox(height: 2000),   // 첫 필드를 화면 아래로 밀어냄
      FieldTextInput(label: '이름', controller: a, form: form, validate: _required),
      const SizedBox(height: 1500),
      FieldTextInput(label: '전화', controller: b, form: form, validate: _required),
    ]))));
    expect(scroll.offset, 0); // 시작 시 첫 오류 칸(이름)은 스크롤 위쪽 밖
    form.validateAll();
    await t.pumpAndSettle();
    expect(scroll.offset, greaterThan(0));  // 첫 오류 칸으로 스크롤됨
    expect(find.text('필수 항목입니다'), findsWidgets);
  });
}
