import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_bot_controller.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_bot_sheet.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_guide_repository.dart';
import 'booking_test_support.dart';

/// 주입 가짜 — /chat/dept-guide 통신을 대신한다. 다음 응답/예외를 지정한다.
class _FakeRepo implements DeptGuideRepositoryLike {
  _FakeRepo({this.result, this.error});
  DeptGuideResult? result;
  Object? error;
  String? lastMessage;
  List<String>? lastHistory;

  @override
  Future<DeptGuideResult> guide({
    required String message,
    required List<String> history,
    String relation = '본인',
  }) async {
    lastMessage = message;
    lastHistory = List.of(history);
    if (error != null) throw error!;
    return result ?? const DeptGuideResult(reply: '언제부터 아프셨어요?');
  }
}

Future<ProviderContainer> pumpLiveSheet(WidgetTester t, _FakeRepo repo,
    {BookingTarget target = kSelf}) async {
  final container = ProviderContainer(overrides: [
    deptGuideRepositoryProvider.overrideWithValue(repo),
  ]);
  addTearDown(container.dispose);
  container.read(bookingProvider.notifier).selectTarget(target);
  await t.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: MaterialApp(
      theme: AppTheme.theme,
      home: Scaffold(
        body: Builder(
          builder: (ctx) => Center(
            child: ElevatedButton(
              onPressed: () => showModalBottomSheet(
                  context: ctx, isScrollControlled: true, builder: (_) => const DeptBotSheet()),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  ));
  await t.tap(find.text('open'));
  await t.pumpAndSettle();
  return container;
}

// 증상을 입력하고 봇 응답이 붙을 때까지 편지(typing 인디케이터의 무한 애니메이션 탓에 pumpAndSettle 금지).
Future<void> sendSymptom(WidgetTester t, String text) async {
  await t.enterText(find.byType(TextField), text);
  await t.tap(find.widgetWithIcon(IconButton, AppIcons.send));
  await t.pump(); // send 시작(sending=true)
  await t.pump(const Duration(milliseconds: 50)); // 가짜 Future 완료(sending=false)
}

void main() {
  testWidgets('[BOOK-BOT-LIVE-01] 증상을 입력하면 내 말풍선 + 봇 답변이 붙고 입력창은 유지된다', (t) async {
    final repo = _FakeRepo(result: const DeptGuideResult(reply: '언제부터 아프셨어요?'));
    await pumpLiveSheet(t, repo);
    await sendSymptom(t, '배가 아파요');
    expect(find.text('배가 아파요'), findsOneWidget); // 내 말풍선
    expect(find.text('언제부터 아프셨어요?'), findsOneWidget); // 봇 답변
    expect(find.byType(TextField), findsOneWidget); // 자유 입력 유지
    expect(repo.lastMessage, '배가 아파요');
  });

  testWidgets('[BOOK-BOT-LIVE-02] 봇이 진료과를 추천하면 [○○과로 계속하기]가 뜨고 누르면 그 과로 3단계', (t) async {
    final repo = _FakeRepo(
        result: const DeptGuideResult(
            reply: '정형외과를 추천드려요.', suggested: Department('d1', '정형외과')));
    final c = await pumpLiveSheet(t, repo);
    await sendSymptom(t, '무릎이 아파요');
    expect(find.text('정형외과로 계속하기'), findsOneWidget);
    await t.tap(find.text('정형외과로 계속하기'));
    await t.pumpAndSettle();
    expect(c.read(bookingProvider).department!.id, 'd1'); // NAV-BOOK-07
    expect(c.read(bookingProvider).step, 2);
  });

  testWidgets('[BOOK-BOT-LIVE-03] 이전 발화가 history로 누적돼 서버에 함께 간다', (t) async {
    final repo = _FakeRepo(result: const DeptGuideResult(reply: '다른 증상도 있나요?'));
    await pumpLiveSheet(t, repo);
    await sendSymptom(t, '배가 아파요');
    await sendSymptom(t, '어제부터요');
    expect(repo.lastMessage, '어제부터요');
    expect(repo.lastHistory, ['배가 아파요']); // 성공한 이전 발화만 이력에
  });

  testWidgets('[BOOK-BOT-LIVE-04] 봇 응답 실패면 시트를 닫지 않고 오류 + [다시 시도] + 입력 유지', (t) async {
    final repo = _FakeRepo(error: Exception('boom'));
    await pumpLiveSheet(t, repo);
    await sendSymptom(t, '배가 아파요');
    expect(find.text('배가 아파요'), findsOneWidget); // 원문 말풍선 보존
    expect(find.text('답변을 불러오지 못했어요'), findsOneWidget);
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.byType(DeptBotSheet), findsOneWidget); // 시트 안 닫힘(막다른 길 금지)
    expect(find.byType(TextField), findsOneWidget); // 자유 입력 유지
  });

  testWidgets('[BOOK-BOT-LIVE-05] 응급 발화면 119 안내가 말풍선으로 뜨고 추천 버튼은 없다', (t) async {
    final repo = _FakeRepo(
        result: const DeptGuideResult(
            reply: '지금 위급한 상황일 수 있어요. 즉시 119에 전화하거나 응급실로 가 주세요.',
            emergency: true));
    await pumpLiveSheet(t, repo);
    await sendSymptom(t, '숨을 못 쉬겠어요');
    expect(find.textContaining('119'), findsOneWidget);
    expect(find.textContaining('로 계속하기'), findsNothing);
  });

  testWidgets('[BOOK-BOT-LIVE-06] 다시 시도는 마지막 발화를 중복 말풍선 없이 재전송한다', (t) async {
    final repo = _FakeRepo(error: Exception('boom'));
    await pumpLiveSheet(t, repo);
    await sendSymptom(t, '배가 아파요');
    // 이제 성공하도록 바꾸고 다시 시도
    repo.error = null;
    repo.result = const DeptGuideResult(reply: '언제부터요?');
    await t.tap(find.text('다시 시도'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 50));
    expect(find.text('배가 아파요'), findsOneWidget); // 내 말풍선은 하나(중복 없음)
    expect(find.text('언제부터요?'), findsOneWidget);
    expect(find.text('답변을 불러오지 못했어요'), findsNothing);
  });
}
