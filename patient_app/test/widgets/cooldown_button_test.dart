import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/widgets/cooldown_button.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}

_MockStorage _memStorage([Map<String, String?>? shared]) {
  final s = _MockStorage();
  final mem = shared ?? <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value')))
      .thenAnswer((i) async =>
          mem[i.namedArguments[#key] as String] = i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key')))
      .thenAnswer((i) async => mem[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key')))
      .thenAnswer((i) async => mem.remove(i.namedArguments[#key] as String));
  return s;
}

const _a = '01011112222';
const _b = '01033334444';

void main() {
  test('[BTN-COOL-02] 누른 직후 남은 시간은 30초에서 시작한다', () async {
    final store = PhoneCooldownStore(_memStorage());
    final t0 = DateTime(2026, 8, 17, 10, 0, 0);
    await store.start(_a, t0);
    expect(store.remainingSeconds(_a, t0), 30);
    expect(store.remainingSeconds(_a, t0.add(const Duration(seconds: 1))), 29); // 1초씩 줄어든다
  });

  test('[BTN-COOL-03] 횟수 제한이 없다 — 여러 사이클을 돌려도 시간만 본다', () async {
    final store = PhoneCooldownStore(_memStorage());
    var t = DateTime(2026, 8, 17, 10, 0, 0);
    for (var i = 0; i < 5; i++) {
      await store.start(_a, t);
      expect(store.remainingSeconds(_a, t), 30); // 매번 정상적으로 다시 열린다(막다른 길 없음)
      t = t.add(const Duration(seconds: 31));
    }
  });

  test('[BTN-COOL-04] 화면이 아니라 번호에 건다 — 앱 재시작(새 Store)에도 유지된다', () async {
    final shared = <String, String?>{};
    final t0 = DateTime(2026, 8, 17, 10, 0, 0);
    await PhoneCooldownStore(_memStorage(shared)).start(_a, t0);
    final revived = PhoneCooldownStore(_memStorage(shared)); // 재시작 흉내
    await revived.load();
    expect(revived.remainingSeconds(_a, t0.add(const Duration(seconds: 5))), 25);
  });

  test('[BTN-COOL-05] 껐다 켜도(로그인 화면으로 가도) 같은 번호면 쿨다운이 살아 있다', () async {
    final shared = <String, String?>{};
    final t0 = DateTime(2026, 8, 17, 10, 0, 0);
    await PhoneCooldownStore(_memStorage(shared)).start(_a, t0);
    final afterRestart = PhoneCooldownStore(_memStorage(shared));
    await afterRestart.load();
    expect(afterRestart.remainingSeconds(_a, t0.add(const Duration(seconds: 10))), greaterThan(0));
  });

  test('[BTN-COOL-06] 서버가 거절하며 내려준 남은 초로 로컬을 맞춘다', () async {
    final store = PhoneCooldownStore(_memStorage());
    final now = DateTime(2026, 8, 17, 10, 0, 0);
    await store.syncFromServer(_a, 20, now);
    expect(store.remainingSeconds(_a, now), 20);
  });

  test('[BTN-COOL-07] 재시작 후 같은 번호에 쿨다운이 남았으면 다시 보내지 않는다(remaining>0으로 판단)', () async {
    final shared = <String, String?>{};
    final t0 = DateTime(2026, 8, 17, 10, 0, 0);
    await PhoneCooldownStore(_memStorage(shared)).start(_a, t0);
    final revived = PhoneCooldownStore(_memStorage(shared));
    await revived.load();
    // AUTH 화면은 이 값이 0보다 크면 새로 보내지 않고 인증번호 입력 화면으로 넘어간다.
    expect(revived.remainingSeconds(_a, t0.add(const Duration(seconds: 3))) > 0, isTrue);
  });

  test('[BTN-COOL-09] 다른 번호는 정상 발송 — 쿨다운은 번호마다 따로 센다', () async {
    final store = PhoneCooldownStore(_memStorage());
    final now = DateTime(2026, 8, 17, 10, 0, 0);
    await store.start(_a, now);
    expect(store.remainingSeconds(_a, now), 30);
    expect(store.remainingSeconds(_b, now), 0); // b는 시작한 적 없다
  });

  test('[BTN-COOL-10] 로컬과 서버가 어긋나면 서버가 이긴다', () async {
    final store = PhoneCooldownStore(_memStorage());
    final now = DateTime(2026, 8, 17, 10, 0, 0);
    await store.start(_a, now);                 // 로컬은 30초라고 생각
    await store.syncFromServer(_a, 5, now);      // 서버는 5초 남았다고 함
    expect(store.remainingSeconds(_a, now), 5);  // 서버 승
  });

  testWidgets('[BTN-COOL-01] 대상 버튼(인증번호 다시 받기)을 누르면 발송되고 쿨다운이 시작된다', (t) async {
    final store = PhoneCooldownStore(_memStorage());
    var sent = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CooldownButton(
      phone: _a, label: '인증번호 다시 받기', store: store,
      onSend: () async { sent++; return null; }))));
    expect(find.text('인증번호 다시 받기'), findsOneWidget);
    await t.tap(find.byType(CooldownButton));
    await t.pump();
    expect(sent, 1);
    expect(store.remainingSeconds(_a, DateTime.now()), greaterThan(0)); // 번호에 쿨다운 걸림
    await t.pumpWidget(const SizedBox()); // timer dispose
  });

  testWidgets('[BTN-COOL-08] 쿨다운 중에는 버튼에 남은 시간을 숫자로 보여준다', (t) async {
    final store = PhoneCooldownStore(_memStorage());
    await store.start(_a, DateTime.now()); // 지금 시작 → 약 30초
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CooldownButton(
      phone: _a, label: '인증번호 다시 받기', store: store, onSend: () async => null))));
    await t.pump();
    expect(find.textContaining('초 후 다시 받기'), findsOneWidget); // 남은 시간 표시
    expect(find.text('인증번호 다시 받기'), findsNothing);            // 평소 라벨은 숨김
    await t.pumpWidget(const SizedBox());
  });
}
