import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';

import 'notification_test_support.dart';

void main() {
  testWidgets('[NOTI-LIST-01][NOTI-BODY-01] 목록은 날짜 묶음·제목·본문(저장된 그대로)·시각을 보인다', (t) async {
    await t.pumpWidget(inboxWith([noti('confirmed', body: '민준님 예약이 확정되었습니다.')]));
    await t.pumpAndSettle();
    expect(find.text('오늘'), findsOneWidget); // 날짜 묶음 머리(sent_at=오늘 고정)
    expect(find.text('예약 확정'), findsOneWidget); // 제목
    expect(find.text('민준님 예약이 확정되었습니다.'), findsOneWidget); // 본문 그대로(진료과·의사 안 붙임)
  });

  testWidgets('[NOTI-READ-01] 안 읽은 알림은 왼쪽 색 바 — 중요는 주의색, 일반은 딥틸', (t) async {
    await t.pumpWidget(inboxWith([noti('hospital_cancelled', read: false), noti('confirmed', read: false)]));
    await t.pumpAndSettle();
    expect(barColor(t, '예약 취소'), AppTokens.warn); // 중요=주의색
    expect(barColor(t, '예약 확정'), AppTokens.primary); // 일반=딥틸
  });

  testWidgets('[NOTI-READ-02] 읽은 알림은 색 바가 없고 글자가 회색', (t) async {
    await t.pumpWidget(inboxWith([noti('confirmed', read: true)]));
    await t.pumpAndSettle();
    expect(hasBar(t, '예약 확정'), isFalse);
    expect(textColor(t, '예약 확정'), AppTokens.grayDone);
  });

  testWidgets('[NOTI-READ-03] 읽지 않은 알림의 배경을 물들이지 않는다(면적 최소)', (t) async {
    await t.pumpWidget(inboxWith([noti('hospital_cancelled', read: false)]));
    await t.pumpAndSettle();
    expect(rowBackgroundTinted(t, '예약 취소'), isFalse); // 색은 4px 바에만
  });

  testWidgets('[NOTI-KEEP-02] 목록 하단에 30일 보관 안내', (t) async {
    await t.pumpWidget(inboxWith([noti('confirmed')]));
    await t.pumpAndSettle();
    expect(find.text('알림은 30일 동안 보관됩니다'), findsOneWidget);
  });

  testWidgets('[NOTI-READ-04] 화면에 들어오면 읽음 창구를 부른다(배지가 0이 된다)', (t) async {
    final api = FakeNotificationApi(items: [notiJson('confirmed')], unread: 1);
    await t.pumpWidget(inboxApp(api));
    await t.pumpAndSettle();
    expect(api.markedRead, isTrue); // 진입 순간 mark_all_read
  });

  testWidgets('[NOTI-EMPTY-01][NOTI-EMPTY-02] 0건이면 안내만, [다시 시도] 없음', (t) async {
    await t.pumpWidget(inboxWith([]));
    await t.pumpAndSettle();
    expect(find.textContaining('받은 알림이 없습니다'), findsOneWidget);
    expect(find.textContaining('여기에서 알려드립니다'), findsOneWidget);
    expect(find.text('다시 시도'), findsNothing); // 실패가 아니라 사실
  });

  testWidgets('[NOTI-EMPTY-03][NOTI-OFF-01] 오프라인·조회 실패면 [다시 시도]가 붙는다', (t) async {
    await t.pumpWidget(inboxOffline());
    await t.pumpAndSettle();
    expect(find.text('다시 시도'), findsOneWidget); // EmptyState.offline
  });
}
