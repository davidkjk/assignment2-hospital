import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/widgets/warn_text.dart';
import 'package:hospital_patient_app/widgets/inline_error.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('[ERR-MSG-01] 서버가 준 문장을 그대로 쓴다 — 앱이 다시 쓰지 않는다', (t) async {
    await t.pumpWidget(_host(const InlineError('이미 예약된 시간입니다. 다른 시간을 선택해주세요.')));
    expect(find.text('이미 예약된 시간입니다. 다른 시간을 선택해주세요.'), findsOneWidget);
  });

  testWidgets('[ERR-MSG-02] 위젯은 메시지를 가공하지 않는다(자르기·접두어 금지) — 서버 한글 문장을 신뢰', (t) async {
    const long = '요청을 처리할 수 없습니다. 잠시 후 다시 시도하시거나 병원으로 문의해주세요.';
    await t.pumpWidget(_host(const InlineError(long)));
    expect(find.text(long), findsOneWidget); // 통째로. "오류: " 같은 접두어를 붙이지 않는다.
  });

  testWidgets('[ERR-KIND-01] 동작 실패 오류는 특정 칸이 아니라 버튼에 귀속 — 필드명을 받지 않는다', (t) async {
    // InlineError 생성자에는 fieldName이 없다. 입력 검증(칸 아래)은 FieldTextInput(Step 3)이 담는다.
    await t.pumpWidget(_host(const InlineError('마감된 진료입니다')));
    expect(find.byType(InlineError), findsOneWidget);
  });

  testWidgets('[ERR-POS-01] 좌측 4px 바 + 주의색 + 배경 없음(WarnText 재사용)', (t) async {
    await t.pumpWidget(_host(const InlineError('실패했습니다')));
    expect(find.byType(WarnText), findsOneWidget); // WarnText가 좌측 4px 바·warn색·배경없음을 보장
    final deco = t.widget<Container>(find.descendant(
        of: find.byType(WarnText), matching: find.byType(Container))).decoration as BoxDecoration;
    expect((deco.border! as Border).left.width, AppTokens.warnBarWidth); // 4px (Border 서브타입만 left 노출)
    expect(deco.color, isNull);                              // 배경 없음
  });

  testWidgets('[ERR-POS-02] 오류가 시야 밖이면 그 위치로 자동 스크롤한다', (t) async {
    final controller = ScrollController();
    await t.pumpWidget(_host(_Toggler(controller)));
    // 처음엔 리스트 아래쪽 오류 자리가 화면 밖.
    expect(find.text('버튼 동작이 실패했습니다'), findsNothing);
    await t.tap(find.text('오류 켜기'));
    await t.pumpAndSettle();
    // 자동 스크롤로 오류가 화면에 들어온다.
    expect(find.text('버튼 동작이 실패했습니다'), findsOneWidget);
    expect(controller.offset, greaterThan(0));
  });

  testWidgets('[ERR-POS-03] 스낵바를 쓰지 않는다 — 인라인 위젯이라 사라지지 않는다', (t) async {
    await t.pumpWidget(_host(const InlineError('실패')));
    await t.pump(const Duration(seconds: 5));
    expect(find.byType(SnackBar), findsNothing); // 스낵바 아님
    expect(find.text('실패'), findsOneWidget);     // 5초 뒤에도 그대로(자동 소멸 없음)
  });

  testWidgets('[ERR-GONE-01] 입력을 고쳐 풀리는 오류는 message=null이 되면 즉시 사라진다', (t) async {
    await t.pumpWidget(_host(const InlineError('형식이 올바르지 않습니다')));
    expect(find.text('형식이 올바르지 않습니다'), findsOneWidget);
    await t.pumpWidget(_host(const InlineError(null))); // 화면이 오류를 지움
    expect(find.text('형식이 올바르지 않습니다'), findsNothing);
    expect(find.byType(SizedBox), findsWidgets); // null이면 빈 자리(SizedBox.shrink)
  });

  testWidgets('[ERR-GONE-02] 다시 눌러 푸는 오류도 message=null 전환으로 사라진다', (t) async {
    await t.pumpWidget(_host(const InlineError('저장에 실패했습니다')));
    await t.pumpWidget(_host(const InlineError(null))); // 다시 누르는 순간 화면이 null로(◌ 저장 중…)
    expect(find.text('저장에 실패했습니다'), findsNothing);
  });

  testWidgets('[ERR-GONE-03] 스크롤 등 무관한 조작에는 사라지지 않는다', (t) async {
    await t.pumpWidget(_host(const InlineError('마감된 진료입니다')));
    await t.drag(find.byType(InlineError), const Offset(0, -50)); // 무관한 조작
    await t.pump();
    expect(find.text('마감된 진료입니다'), findsOneWidget); // 그대로
  });

  testWidgets('[ERR-RETRY-01] 버튼을 눌러 실패한 오류에는 [다시 시도]를 만들지 않는다', (t) async {
    await t.pumpWidget(_host(const InlineError('신청에 실패했습니다')));
    expect(find.text('다시 시도'), findsNothing);
    expect(find.textContaining('다시 시도'), findsNothing);
  });

  testWidgets('[ERR-RETRY-03] 누를 것이 이미 있으면 재시도 버튼을 만들지 않는다(InlineError엔 없음)', (t) async {
    // 원래 버튼을 다시 누르면 되므로 InlineError는 어떤 버튼도 갖지 않는다.
    await t.pumpWidget(_host(const InlineError('실패')));
    expect(find.byType(ElevatedButton), findsNothing);
    expect(find.byType(TextButton), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('[ERR-RETRY-04] InlineError는 원래 버튼의 글자를 건드리지 않는다 — 오류만 위에 얹는다', (t) async {
    // InlineError는 버튼과 독립된 위젯이라, 실패해도 아래 버튼 라벨을 "다시 시도"로 바꾸지 않는다.
    await t.pumpWidget(_host(const Column(children: [
      InlineError('신청에 실패했습니다'),
      Text('예약 신청하기'), // 아래 버튼 라벨(그대로)
    ])));
    expect(find.text('예약 신청하기'), findsOneWidget);
    expect(find.text('다시 시도'), findsNothing);
  });
}

/// ERR-POS-02 검증용 — 오류가 리스트 맨 아래(화면 밖)에 있고, 버튼으로 켜면 자동 스크롤되는지 본다.
class _Toggler extends StatefulWidget {
  final ScrollController controller;
  const _Toggler(this.controller);
  @override
  State<_Toggler> createState() => _TogglerState();
}

class _TogglerState extends State<_Toggler> {
  bool on = false;
  @override
  Widget build(BuildContext context) {
    // SingleChildScrollView+Column: InlineError가 화면 밖이어도 즉시 빌드돼(트리에 존재) message가
    // null→non-null로 바뀔 때 didUpdateWidget이 실제로 발화한다(lazy ListView면 빌드조차 안 됨).
    return SingleChildScrollView(
      controller: widget.controller,
      child: Column(
        children: [
          ElevatedButton(onPressed: () => setState(() => on = true), child: const Text('오류 켜기')),
          const SizedBox(height: 2000), // 오류 자리를 화면 밖으로 밀어냄
          InlineError(on ? '버튼 동작이 실패했습니다' : null),
        ],
      ),
    );
  }
}
