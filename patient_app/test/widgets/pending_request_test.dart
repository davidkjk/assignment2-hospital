import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/pending_request.dart';
import 'package:hospital_patient_app/widgets/pending_request_card.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}

/// 실제 secure storage 대신 메모리 맵으로 흉내낸다.
_MockStorage _memStorage() {
  final s = _MockStorage();
  final mem = <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value')))
      .thenAnswer((i) async => mem[i.namedArguments[#key] as String] =
          i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key')))
      .thenAnswer((i) async => mem[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key')))
      .thenAnswer((i) async => mem.remove(i.namedArguments[#key] as String));
  return s;
}

void main() {
  test('[BTN-KILL-01] 요청을 보내기 직전에 유언(종류+신청 시각)을 적는다', () async {
    final store = PendingRequestStore(_memStorage());
    final at = DateTime(2026, 8, 17, 10, 2);
    await store.begin(PendingKind.book, at);
    final read = await store.read();
    expect(read!.kind, PendingKind.book);
    expect(read.startedAt, at);
  });

  test('[BTN-KILL-02] 응답이 도착하면(성공·실패 무관) 즉시 지운다', () async {
    final store = PendingRequestStore(_memStorage());
    await store.begin(PendingKind.book, DateTime(2026, 8, 17, 10, 2));
    await store.complete();
    expect(await store.read(), isNull);
  });

  test('[BTN-KILL-04] 문구에 "방금"을 쓰지 않고 적어둔 절대 시각을 넣는다', () {
    expect(koreanTime(DateTime(2026, 8, 17, 10, 2)), '오전 10:02');
    expect(koreanTime(DateTime(2026, 8, 17, 14, 5)), '오후 2:05');
    final msg = const PendingRequest(PendingKind.book, null).homeMessageAt(
        DateTime(2026, 8, 17, 10, 2));
    expect(msg.contains('방금'), isFalse);
    expect(msg.contains('오전 10:02'), isTrue);
  });

  test('[BTN-KILL-06] 대상은 예약 신청·변경뿐 — 문진 저장·취소·탈퇴는 종류에 없다', () {
    expect(PendingKind.values, [PendingKind.book, PendingKind.change]);
  });

  testWidgets('[BTN-KILL-03] 앱을 다시 켜면 홈에 안내 한 줄 + [예약 목록에서 확인]이 뜬다', (t) async {
    final store = PendingRequestStore(_memStorage());
    await store.begin(PendingKind.book, DateTime(2026, 8, 17, 10, 2));
    await t.pumpWidget(ProviderScope(
      overrides: [pendingRequestStoreProvider.overrideWithValue(store)],
      child: MaterialApp(home: Scaffold(
          body: PendingRequestCard(onConfirm: () {}))),
    ));
    await t.pumpAndSettle();
    expect(find.textContaining('오전 10:02에 신청하신 예약의 결과를 확인하지 못했습니다'), findsOneWidget);
    expect(find.text('예약 목록에서 확인'), findsOneWidget);
  });

  testWidgets('[BTN-KILL-05] 안내를 확인하면(버튼 탭) 유언을 지우고 onConfirm을 부른다', (t) async {
    final store = PendingRequestStore(_memStorage());
    await store.begin(PendingKind.book, DateTime(2026, 8, 17, 10, 2));
    var confirmed = false;
    await t.pumpWidget(ProviderScope(
      overrides: [pendingRequestStoreProvider.overrideWithValue(store)],
      child: MaterialApp(home: Scaffold(
          body: PendingRequestCard(onConfirm: () => confirmed = true))),
    ));
    await t.pumpAndSettle();
    await t.tap(find.text('예약 목록에서 확인'));
    await t.pumpAndSettle();
    expect(confirmed, isTrue);
    expect(await store.read(), isNull); // 지워짐
  });

  testWidgets('[BTN-KILL-07] 자동 재시도·[다시 신청] 버튼을 두지 않는다', (t) async {
    final store = PendingRequestStore(_memStorage());
    await store.begin(PendingKind.book, DateTime(2026, 8, 17, 10, 2));
    await t.pumpWidget(ProviderScope(
      overrides: [pendingRequestStoreProvider.overrideWithValue(store)],
      child: MaterialApp(home: Scaffold(body: PendingRequestCard(onConfirm: () {}))),
    ));
    await t.pumpAndSettle();
    expect(find.textContaining('다시 신청'), findsNothing);
    expect(find.textContaining('재신청'), findsNothing);
  });
}
