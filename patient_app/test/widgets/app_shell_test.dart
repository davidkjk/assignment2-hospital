import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/session_guard.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';
import 'package:hospital_patient_app/widgets/app_shell.dart';

// A안(2026-09-08): 키보드가 올라오면 하단 탭바를 숨겨 입력창~키보드 간격(탭바 높이만큼 뜨던 것)을 없앤다.
// 키보드를 내리면(전역 탭-디스미스) 탭바가 복귀해 다른 탭으로 갈 수 있다(막다른 길 아님).
Widget _shell(double kbInset) => ProviderScope(
      overrides: [
        connectivityProvider.overrideWith((ref) => Stream.value(true)), // 온라인 → OfflineBanner 숨김
        effectiveAuthProvider.overrideWith((ref) => AuthStatus.signedIn), // 배너가 만료 분기 안 타게
      ],
      child: MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(
            size: const Size(400, 800),
            viewInsets: EdgeInsets.only(bottom: kbInset),
          ),
          child: const AppShell(
            body: Center(child: Text('본문')),
            bottomTabs: Text('탭바', key: Key('tabs')),
          ),
        ),
      ),
    );

void main() {
  testWidgets('[A안] 키보드가 내려가 있으면 하단 탭바가 보인다', (t) async {
    await t.pumpWidget(_shell(0));
    await t.pump();
    expect(find.byKey(const Key('tabs')), findsOneWidget);
  });

  testWidgets('[A안] 키보드가 올라오면 하단 탭바를 숨긴다(입력창~키보드 간격 제거)', (t) async {
    await t.pumpWidget(_shell(300));
    await t.pump();
    expect(find.byKey(const Key('tabs')), findsNothing);
    expect(find.text('본문'), findsOneWidget); // 본문(화면)은 그대로 — 숨기는 건 탭바뿐
  });
}
