import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/legal/legal_document_view.dart';
import 'package:hospital_patient_app/features/legal/legal_documents.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('[CONSENT-DOC-01] 제목·버전·시행일·본문을 렌더한다', (t) async {
    await t.pumpWidget(MaterialApp(home: LegalDocumentView(doc: legalDocs['terms']!)));
    await t.pumpAndSettle();
    expect(find.text('서비스 이용약관'), findsWidgets); // 앱바 제목
    expect(find.textContaining('v1.0'), findsWidgets); // 부제 + 본문 머리말 양쪽
    expect(find.textContaining('2026-09-11 시행'), findsOneWidget); // 부제 형식은 유일
    expect(find.textContaining('가온병원'), findsWidgets); // 본문에 정본값
  });

  testWidgets('[CONSENT-DOC-04] 닫기(뒤로)가 있다 — 열람은 동의를 바꾸지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
            builder: (ctx) => ElevatedButton(
                  onPressed: () => Navigator.push(
                      ctx,
                      MaterialPageRoute(
                          builder: (_) => LegalDocumentView(doc: legalDocs['ads']!))),
                  child: const Text('open'),
                )),
      ),
    ));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    expect(find.byType(LegalDocumentView), findsOneWidget);
    await t.tap(find.byType(BackButton)); // AppBar 기본 back
    await t.pumpAndSettle();
    expect(find.byType(LegalDocumentView), findsNothing); // 닫힘 — 원화면 그대로
  });
}
