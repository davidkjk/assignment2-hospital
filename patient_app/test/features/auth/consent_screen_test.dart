import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/consent_screen.dart';

Widget _host(Widget child, [ProviderContainer? c]) => UncontrolledProviderScope(
    container: c ?? ProviderContainer(), child: MaterialApp(home: child));

void main() {
  test('[CONSENT-ALL-01] 「필수 항목에 모두 동의」는 필수 3개만 켜고 광고는 켜지 않는다', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(consentProvider.notifier).toggleRequiredAll();
    final s = c.read(consentProvider);
    expect(s.requiredAllOn, isTrue);
    expect(s.ads, isFalse); // [선택] 광고는 켜지지 않는다
  });

  test('[CONSENT-ALL-04] 필수 하나를 끄면 맨 위 「모두 동의」도 함께 꺼진다(파생값)', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final n = c.read(consentProvider.notifier);
    n.toggleRequiredAll();
    n.toggle('sensitive'); // 민감정보 끔
    expect(c.read(consentProvider).requiredAllOn, isFalse);
  });

  test('[CONSENT-ITEM-02] 민감정보(③)는 개인정보(②)와 별도로 켜고 끈다', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final n = c.read(consentProvider.notifier);
    n.toggle('privacy');
    expect(c.read(consentProvider).privacy, isTrue);
    expect(c.read(consentProvider).sensitive, isFalse); // 묶이지 않는다
  });

  test('[CONSENT-BTN-03] 남은 필수 개수를 센다', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(c.read(consentProvider).requiredRemaining, 3);
    c.read(consentProvider.notifier).toggle('terms');
    expect(c.read(consentProvider).requiredRemaining, 2);
  });

  testWidgets('[CONSENT-STEP-03] 세션(AuthStatus)을 건드리지 않는다 — authState override 없이도 뜬다',
      (t) async {
    await t.pumpWidget(_host(const ConsentScreen())); // authStateChangesProvider override 없음
    expect(find.byType(ConsentScreen), findsOneWidget);
  });

  testWidgets('[CONSENT-STEP-08] 뒤로 갔다 와도 켜 둔 체크가 남는다(provider가 화면 밖에서 산다)',
      (t) async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(consentProvider.notifier).toggleRequiredAll();
    await t.pumpWidget(_host(const ConsentScreen(), c)); // 화면 새로 그려도
    expect(c.read(consentProvider).requiredAllOn, isTrue); // 상태 유지
  });

  testWidgets('[CONSENT-ITEM-01] [필수] 3줄 + [선택] 1줄, 모두 네 줄', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.textContaining('서비스 이용약관'), findsOneWidget);
    expect(find.textContaining('개인정보 수집·이용'), findsOneWidget);
    expect(find.textContaining('민감정보'), findsOneWidget);
    expect(find.textContaining('광고성 정보 수신'), findsOneWidget);
    // 선택은 정확히 하나(광고). 배지가 제목에 합쳐져 있어 textContaining으로 센다(플랜 결함 교정).
    expect(find.textContaining('[선택]'), findsOneWidget);
  });

  testWidgets('[CONSENT-ITEM-03] 각 줄에 무엇을 주는지 부제목이 붙는다', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.textContaining('이름 · 생년월일 · 성별 · 전화번호'), findsOneWidget); // ②
    expect(find.textContaining('문진 답변 · 진료기록 · 처방'), findsOneWidget); // ③
  });

  testWidgets('[CONSENT-ITEM-04] ④에 「안 받아도 예약 알림은 그대로 옵니다」를 적는다', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.textContaining('안 받아도 예약 알림은 그대로 옵니다'), findsOneWidget);
  });

  testWidgets('[CONSENT-ITEM-05] 줄 끝 › 를 누르면 본문(자리표시자)이 열린다', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    await t.tap(find.byIcon(AppIcons.chevron_right).first);
    await t.pumpAndSettle();
    expect(find.byType(Dialog), findsOneWidget); // 본문 열림(내용은 병원이 채운다)
  });

  testWidgets('[CONSENT-ALL-03] 맨 위 줄 이름은 「필수 항목에 모두 동의」(전체 동의 아님)', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.text('필수 항목에 모두 동의'), findsOneWidget);
    expect(find.text('전체 동의'), findsNothing);
  });

  testWidgets('[CONSENT-BTN-01] 필수 셋이 켜지면 [다음]이 살아난다', (t) async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(consentProvider.notifier).toggleRequiredAll();
    await t.pumpWidget(_host(const ConsentScreen(), c));
    final btn = t.widget<FilledButton>(find.widgetWithText(FilledButton, '다음'));
    expect(btn.onPressed, isNotNull); // 활성
  });

  testWidgets('[CONSENT-BTN-02] 덜 켜지면 [다음]이 꺼지고 아래에 「필수 항목 N개가 남았습니다」', (t) async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(consentProvider.notifier).toggle('terms'); // 1개만 켬 → 2개 남음
    await t.pumpWidget(_host(const ConsentScreen(), c));
    final btn = t.widget<FilledButton>(find.widgetWithText(FilledButton, '다음'));
    expect(btn.onPressed, isNull); // 꺼짐
    expect(find.text('필수 항목 2개가 남았습니다'), findsOneWidget);
  });

  testWidgets('[CONSENT-BTN-04] 막다른 길 방지 — 동의 없이 이용하려면 병원 전화 안내', (t) async {
    await t.pumpWidget(_host(const ConsentScreen()));
    expect(find.textContaining('동의 없이 이용하려면 병원으로 전화'), findsOneWidget);
  });
}
