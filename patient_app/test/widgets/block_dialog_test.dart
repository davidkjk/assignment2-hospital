import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/widgets/block_dialog.dart';

/// 버튼을 눌러 다이얼로그를 띄우는 껍데기 — context를 얻기 위한 발판.
Widget _launcher(void Function(BuildContext) onTap) => MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) =>
              ElevatedButton(onPressed: () => onTap(ctx), child: const Text('열기')),
        ),
      ),
    );

void main() {
  testWidgets('[BLOCK-EXIT-01] 모든 막힘 팝업에는 [닫기]가 있다', (t) async {
    await t.pumpWidget(_launcher((ctx) =>
        showBlockDialog(ctx, title: '점검 중입니다', message: '지금은 이용할 수 없습니다')));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    expect(find.text('닫기'), findsOneWidget);
  });

  testWidgets('[BLOCK-TIME-01] 소요 시간 추정 문구(곧·보통)는 assert로 막는다', (t) async {
    await t.pumpWidget(_launcher((_) {}));
    final ctx = t.element(find.text('열기'));
    expect(() => showBlockDialog(ctx, title: '점검 중', message: '곧 복구됩니다'),
        throwsAssertionError);
    expect(() => showBlockDialog(ctx, title: '점검 중', message: '보통 1~2시간 걸립니다'),
        throwsAssertionError);
  });

  testWidgets('[BLOCK-CONF-01] 되돌릴 수 없는 동작의 빨간 버튼은 확인창 안에만 있다', (t) async {
    await t.pumpWidget(_launcher((ctx) => showBlockDialog(ctx,
        title: '가족 연결을 해제할까요?',
        message: '해제하면 이 가족의 예약을 대신 관리할 수 없습니다',
        confirmLabel: '연결 해제',
        destructive: true,
        onConfirm: () {})));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    final btn = t.widget<TextButton>(find.ancestor(
        of: find.text('연결 해제'), matching: find.byType(TextButton)));
    expect(btn.style!.foregroundColor!.resolve({}), AppTokens.warn); // 확인창 안의 주의색 버튼
  });

  testWidgets('[BLOCK-CHG-01] 변경 확인창은 변경 전 → 후를 함께 보여준다', (t) async {
    await t.pumpWidget(_launcher((ctx) => showBlockDialog(ctx,
        title: '예약을 변경할까요?',
        message: '아래 내용으로 변경됩니다',
        before: '8월 20일(수) 오전 10:00',
        after: '8월 21일(목) 오후 2:30',
        confirmLabel: '변경하기',
        onConfirm: () {})));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    expect(find.textContaining('8월 20일(수) 오전 10:00'), findsOneWidget); // 전
    expect(find.textContaining('8월 21일(목) 오후 2:30'), findsOneWidget);  // 후
  });

  testWidgets('[BTN-EXIT-01] 처리 중 이탈 확인 — 제목·본문·[기다리기]·[나가기]', (t) async {
    await t.pumpWidget(_launcher((ctx) => showExitConfirm(ctx)));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    expect(find.text('예약을 신청하는 중입니다'), findsOneWidget);
    expect(find.text('나가셔도 신청은 계속 진행됩니다. 결과는 예약 목록에서 확인하실 수 있습니다.'),
        findsOneWidget);
    expect(find.text('기다리기'), findsOneWidget);
    expect(find.text('나가기'), findsOneWidget);
  });

  testWidgets('[BTN-EXIT-02] 금지 문구 "나가시면 신청이 취소됩니다"를 쓰지 않는다', (t) async {
    await t.pumpWidget(_launcher((ctx) => showExitConfirm(ctx)));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    expect(find.textContaining('취소됩니다'), findsNothing);
  });

  testWidgets('[BTN-EXIT-03] [나가기]는 시간제한 없는 대기의 탈출구 — true를 돌려준다', (t) async {
    bool? result;
    await t.pumpWidget(_launcher((ctx) async => result = await showExitConfirm(ctx)));
    await t.tap(find.text('열기'));
    await t.pumpAndSettle();
    await t.tap(find.text('나가기'));
    await t.pumpAndSettle();
    expect(result, isTrue); // 사람이 나가기를 택하면 이탈 허용(앱이 시간을 재지 않는다)
  });
}
